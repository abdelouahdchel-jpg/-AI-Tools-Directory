import { createClient } from '@supabase/supabase-js';
import {
  discoveryService,
  SHARED_PLATFORM_DOMAINS,
  matchesExistingToolRecord,
  cleanUrlForDedup
} from '../src/services/discovery/discoveryService';
import { extractPageMetadata } from '../src/services/discovery/metadataExtractor';
import { preflightCheckUrl } from '../src/services/urlVerifier';
import { generateSlug, normalizeDomain } from '../src/lib/validation';
import { INITIAL_TOOLS } from '../src/data/initialData';
import { Tool } from '../src/types/database';

export type DiscoveryExecutionMode = 'dry_run' | 'live_noop' | 'live_insert';

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
}

interface DiscoveryRunReport {
  timestamp: string;
  mode: DiscoveryExecutionMode;
  total_discovered: number;
  software_products_identified: number;
  filtered_out_non_products: number;
  duplicates_detected: number;
  validation_passed: number;
  failed_url_checks: number;
  inserted_drafts: number;
  failed_inserts: number;
  linked_categories: number;
  inserted_tools: Array<{ name: string; domain: string; id?: string; category?: string }>;
  duplicate_examples: Array<{ name: string; reason: string }>;
  rejection_examples: Array<{ name: string; reason: string }>;
  errors: string[];
}

/**
 * Determines execution mode without falsely labeling live zero-new-tools runs as DRY-RUN.
 */
export function resolveExecutionMode(params: {
  isLiveSupabase: boolean;
  hasClient: boolean;
  candidateCount: number;
  dryRunFlag?: boolean;
}): DiscoveryExecutionMode {
  if (params.dryRunFlag || !params.isLiveSupabase || !params.hasClient) {
    return 'dry_run';
  }
  return params.candidateCount > 0 ? 'live_insert' : 'live_noop';
}

/**
 * Verifies URL security (HTTPS + anti-SSRF preflight) AND live HTTP reachability (2xx/3xx).
 */
export async function verifyLiveWebsiteReachability(
  urlStr: string,
  timeoutMs: number = 5000
): Promise<{ ok: boolean; httpStatus?: number; finalUrl: string; reason?: string }> {
  const preflight = preflightCheckUrl(urlStr);
  if (!preflight.safe) {
    return {
      ok: false,
      finalUrl: urlStr,
      reason: preflight.error || 'Failed URL security preflight check'
    };
  }

  const runRequest = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(urlStr, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AIScoutDirectory-Verifier/1.0 (+https://aiscout.directory)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await runRequest('HEAD');
    if (res.status === 405 || res.status === 403 || res.status === 400) {
      res = await runRequest('GET');
    }

    const finalUrl = res.url || urlStr;
    const redirectSecurity = preflightCheckUrl(finalUrl);
    if (!redirectSecurity.safe) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl,
        reason: `Redirected destination failed URL security check: ${redirectSecurity.error}`
      };
    }

    if (res.status >= 200 && res.status < 400) {
      return { ok: true, httpStatus: res.status, finalUrl };
    }

    return {
      ok: false,
      httpStatus: res.status,
      finalUrl,
      reason: `Website returned HTTP ${res.status}`
    };
  } catch (err: any) {
    return {
      ok: false,
      finalUrl: urlStr,
      reason: err?.name === 'AbortError'
        ? `Website request timed out after ${timeoutMs}ms`
        : `Website unreachable: ${err?.message || 'network error'}`
    };
  }
}

/**
 * Resolves a candidate category name to an existing public.categories UUID.
 */
export function resolveCategoryId(
  categoryName: string,
  categories: CategoryRecord[]
): string | null {
  if (!categoryName || !Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  const normalizedName = categoryName.trim().toLowerCase();
  const targetSlug = generateSlug(categoryName);

  const exact = categories.find(
    c => c.name.trim().toLowerCase() === normalizedName || c.slug.trim().toLowerCase() === targetSlug
  );
  if (exact) return exact.id;

  // Partial / token match fallback (e.g. "Coding" -> "Coding & Development")
  const tokens = normalizedName.split(/[\s&/,-]+/).filter(t => t.length >= 3);
  if (tokens.length > 0) {
    const partial = categories.find(c => {
      const catLower = c.name.toLowerCase();
      return tokens.some(tok => catLower.includes(tok));
    });
    if (partial) return partial.id;
  }

  return null;
}

/**
 * Ensures unique slug in public.tools (especially when two distinct tools on a shared platform share a short name).
 */
export function resolveSafeUniqueSlug(
  toolName: string,
  websiteUrl: string,
  existingTools: Array<{ slug: string; website_url: string; normalized_domain: string }>
): string {
  const baseSlug = generateSlug(toolName) || 'ai-tool';
  const candidateCleanUrl = cleanUrlForDedup(websiteUrl);

  const slugCollision = existingTools.find(
    t => t.slug.toLowerCase() === baseSlug && cleanUrlForDedup(t.website_url) !== candidateCleanUrl
  );

  if (!slugCollision) {
    return baseSlug;
  }

  // Build deterministic suffix from URL path segment (e.g. Hugging Face author)
  try {
    const parsed = new URL(websiteUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const discriminator = segments.length >= 2 ? generateSlug(segments[segments.length - 2]) : generateSlug(parsed.hostname);
    if (discriminator) {
      const disambiguated = `${baseSlug}-${discriminator}`.slice(0, 175);
      if (!existingTools.some(t => t.slug.toLowerCase() === disambiguated)) {
        return disambiguated;
      }
    }
  } catch {
    // Fallback to short hash below
  }

  let hash = 0;
  for (let i = 0; i < candidateCleanUrl.length; i++) {
    hash = ((hash << 5) - hash + candidateCleanUrl.charCodeAt(i)) | 0;
  }
  return `${baseSlug}-${Math.abs(hash).toString(36).slice(0, 5)}`.slice(0, 175);
}

export async function runAutomatedDiscovery() {
  const startTime = new Date().toISOString();
  const dryRunFlag = typeof process !== 'undefined' && process.argv.includes('--dry-run');

  console.log('===============================================================');
  console.log('🤖 AI TOOLS DIRECTORY — AUTOMATED DISCOVERY & DRAFT INGESTION');
  console.log(`⏱️  Timestamp: ${startTime}`);
  console.log('===============================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // STRICT SECURITY CONSTRAINT: SUPABASE_SERVICE_ROLE_KEY is used ONLY here in this server/CLI script
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let supabaseClient: any = null;
  let existingTools: Tool[] = [...INITIAL_TOOLS];
  let dbCategories: CategoryRecord[] = [];
  const isLiveSupabase = Boolean(supabaseUrl && supabaseKey);

  if (isLiveSupabase) {
    console.log(`🔌 Connecting to Supabase at: ${supabaseUrl}`);
    supabaseClient = createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false }
    });

    try {
      const { data: dbTools, error: fetchErr } = await supabaseClient
        .from('tools')
        .select('*');

      if (!fetchErr && dbTools && dbTools.length > 0) {
        console.log(`📚 Loaded ${dbTools.length} existing catalog records from Supabase.`);
        existingTools = dbTools;
      } else {
        console.log(`ℹ️  No remote tools found or error reading tools (${fetchErr?.message || 'none'}). Using catalog fallback.`);
      }

      const { data: catRows, error: catErr } = await supabaseClient
        .from('categories')
        .select('id, name, slug');

      if (!catErr && catRows) {
        dbCategories = catRows as CategoryRecord[];
        console.log(`🏷️  Loaded ${dbCategories.length} categories from Supabase.`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Could not fetch live tools from Supabase (${err.message}). Using catalog fallback.`);
    }
  } else {
    console.log('🧪 DRY-RUN / LOCAL MODE: No Supabase credentials provided in environment.');
    console.log(`   Comparing against ${existingTools.length} built-in catalog tools.`);
  }

  // 1. Run discovery across all free adapters (limitPerSource: 20 so adapters reach fresh tools beyond existing items)
  console.log('\n📡 Executing discovery across registered public adapters:');
  const availableSources = discoveryService.getAvailableSources();
  availableSources.forEach(s => console.log(`   • [${s.type}] ${s.name} (Free: ${s.is_free})`));

  const batchResults = await discoveryService.runAllSources(existingTools, { limitPerSource: 20 });

  const report: DiscoveryRunReport = {
    timestamp: startTime,
    mode: 'dry_run',
    total_discovered: 0,
    software_products_identified: 0,
    filtered_out_non_products: 0,
    duplicates_detected: 0,
    validation_passed: 0,
    failed_url_checks: 0,
    inserted_drafts: 0,
    failed_inserts: 0,
    linked_categories: 0,
    inserted_tools: [],
    duplicate_examples: [],
    rejection_examples: [],
    errors: []
  };

  const preVerifiedCandidates: any[] = [];

  for (const b of batchResults) {
    report.total_discovered += b.total_discovered;
    report.software_products_identified += b.software_products_identified;
    report.filtered_out_non_products += b.filtered_out_non_products;
    report.duplicates_detected += b.duplicates_detected;
    report.validation_passed += b.validation_passed;

    for (const item of b.candidates) {
      if (item.candidate.evaluation_status === 'Ready for Draft Import' && !item.is_duplicate) {
        preVerifiedCandidates.push(item.candidate);
      } else if (item.is_duplicate) {
        if (report.duplicate_examples.length < 10) {
          report.duplicate_examples.push({
            name: item.candidate.name,
            reason: item.duplicate_reason || 'Already in directory'
          });
        }
      } else {
        if (report.rejection_examples.length < 10) {
          report.rejection_examples.push({
            name: item.candidate.name,
            reason: item.candidate.rejection_reason || item.validation_errors.join('; ') || item.candidate.evaluation_status
          });
        }
      }
    }
  }

  // 2. Real URL Security + Live HTTP Reachability + Metadata Enrichment Gate
  const verifiedCandidates: any[] = [];
  if (preVerifiedCandidates.length > 0) {
    console.log(`\n🛡️  Verifying URL security & live HTTP reachability for ${preVerifiedCandidates.length} eligible candidates...`);
    for (const cand of preVerifiedCandidates) {
      const reachability = await verifyLiveWebsiteReachability(cand.website_url, 5000);
      if (!reachability.ok) {
        report.failed_url_checks++;
        report.filtered_out_non_products++;
        console.log(`   ⛔ Rejected "${cand.name}" (${cand.website_url}): ${reachability.reason}`);
        if (report.rejection_examples.length < 10) {
          report.rejection_examples.push({
            name: cand.name,
            reason: reachability.reason || 'Failed live URL reachability check'
          });
        }
        continue;
      }

      cand.website_check_result = `HTTP ${reachability.httpStatus} OK (${reachability.finalUrl})`;

      if (cand.website_url && !cand.website_url.includes('github.com')) {
        try {
          const meta = await extractPageMetadata(cand.website_url, 3000);
          if (meta) {
            if (meta.logo_url && !cand.logo_url) cand.logo_url = meta.logo_url;
            if (meta.description && cand.short_description.length < 40) cand.short_description = meta.description.slice(0, 260);
          }
        } catch {
          // Keep adapter data
        }
      }

      verifiedCandidates.push(cand);
    }
  }

  console.log('\n📊 DISCOVERY SUMMARY:');
  console.log(`   • Total Discovered: ${report.total_discovered}`);
  console.log(`   • Software Products Identified: ${report.software_products_identified}`);
  console.log(`   • Filtered Non-Products: ${report.filtered_out_non_products}`);
  console.log(`   • Duplicate Matches Prevented: ${report.duplicates_detected}`);
  console.log(`   • Failed URL Security/Reachability Checks: ${report.failed_url_checks}`);
  console.log(`   • Approved & Verified for Safe Draft Import: ${verifiedCandidates.length}`);

  report.mode = resolveExecutionMode({
    isLiveSupabase,
    hasClient: Boolean(supabaseClient),
    candidateCount: verifiedCandidates.length,
    dryRunFlag
  });

  // 3. Database Insertion strictly as DRAFT & UNVERIFIED (or explicit Live No-Op / Dry-Run)
  if (report.mode === 'live_insert') {
    console.log(`\n💾 Inserting ${verifiedCandidates.length} verified candidates into Supabase as DRAFT & UNVERIFIED...`);

    // A. Create batch tracking record
    const batchFilename = `gh_actions_${startTime.split('T')[0]}_${Date.now().toString(36)}`;
    const { data: batchData } = await supabaseClient
      .from('import_batches')
      .insert({
        filename: batchFilename,
        source_name: 'GitHub Actions Automated Discovery',
        source_type: 'api',
        total_rows: verifiedCandidates.length,
        valid_rows: verifiedCandidates.length,
        inserted_rows: 0,
        duplicate_rows: report.duplicates_detected,
        rejected_rows: report.filtered_out_non_products,
        status: 'processing'
      })
      .select('id')
      .single();

    const batchId = batchData?.id;

    for (const cand of verifiedCandidates) {
      const domain = (cand.normalized_domain || normalizeDomain(cand.website_url)).toLowerCase().trim();
      const baseSlug = generateSlug(cand.name);
      const isSharedPlatform = SHARED_PLATFORM_DOMAINS.has(domain);

      // Final pre-insert duplicate check against live database + intra-run existingTools:
      let matchedExisting: { id: string; name: string; reason: string } | null = null;

      for (const existing of existingTools) {
        const memCheck = matchesExistingToolRecord(
          { name: cand.name, website_url: cand.website_url, normalized_domain: domain },
          existing
        );
        if (memCheck.matched) {
          matchedExisting = {
            id: existing.id,
            name: existing.name,
            reason: memCheck.reason || 'Matched existing catalog record'
          };
          break;
        }
      }

      if (!matchedExisting) {
        const { data: dbCheckRows } = await supabaseClient
          .from('tools')
          .select('id, name, slug, website_url, normalized_domain')
          .or(`slug.eq.${baseSlug},normalized_domain.eq.${domain}`)
          .limit(isSharedPlatform ? 50 : 10);

        if (dbCheckRows && dbCheckRows.length > 0) {
          for (const row of dbCheckRows) {
            const check = matchesExistingToolRecord(
              { name: cand.name, website_url: cand.website_url, normalized_domain: domain },
              row
            );
            if (check.matched) {
              matchedExisting = {
                id: row.id,
                name: row.name,
                reason: check.reason || (isSharedPlatform
                  ? 'Matched unique product URL on shared platform'
                  : `Independent domain/slug collision (${domain})`)
              };
              break;
            }
          }
        }
      }

      if (matchedExisting) {
        console.log(`   ⏭️  Skipping "${cand.name}" (matched live record: ${matchedExisting.name} — ${matchedExisting.reason})`);
        report.duplicates_detected++;
        continue;
      }

      const safeSlug = resolveSafeUniqueSlug(cand.name, cand.website_url, existingTools);

      // Mandatory Constraints: publication_status = 'draft', verification_status = 'unverified'
      const { data: newTool, error: insertErr } = await supabaseClient
        .from('tools')
        .insert({
          name: cand.name,
          slug: safeSlug,
          website_url: cand.website_url,
          normalized_domain: domain,
          short_description: cand.short_description,
          full_description: cand.full_description,
          logo_url: cand.logo_url || null,
          pricing_type: cand.pricing_type,
          starting_price: cand.starting_price,
          currency: cand.currency || 'USD',
          affiliate_url: null,
          official_source_url: cand.official_source_url || cand.website_url,
          data_source: cand.data_source || 'automated_discovery',
          source_license: cand.source_license || null,
          source_attribution: cand.source_attribution || null,
          verification_status: 'unverified',
          publication_status: 'draft',
          featured: false,
          sponsored: false,
          upvotes: 0,
          views_count: 0
        })
        .select('id')
        .single();

      if (insertErr || !newTool) {
        console.error(`   ❌ Failed inserting "${cand.name}":`, insertErr?.message);
        report.failed_inserts++;
        report.errors.push(`${cand.name}: ${insertErr?.message}`);

        if (batchId) {
          await supabaseClient.from('import_errors').insert({
            batch_id: batchId,
            row_number: report.inserted_drafts + report.failed_inserts,
            error_code: insertErr?.code || 'INSERT_ERROR',
            error_message: insertErr?.message || 'Database write rejected',
            original_data: { name: cand.name, url: cand.website_url }
          });
        }
      } else {
        // Link appropriate category if resolved from public.categories
        const categoryId = resolveCategoryId(cand.category, dbCategories);
        if (categoryId) {
          const { error: tcErr } = await supabaseClient
            .from('tool_categories')
            .insert({
              tool_id: newTool.id,
              category_id: categoryId,
              is_primary: true
            });

          if (!tcErr) {
            report.linked_categories++;
          } else {
            console.warn(`   ⚠️  Could not link category "${cand.category}" for "${cand.name}": ${tcErr.message}`);
          }
        }

        // Update in-memory catalog to prevent intra-run duplicates
        existingTools.push({
          id: newTool.id,
          name: cand.name,
          slug: safeSlug,
          website_url: cand.website_url,
          normalized_domain: domain,
          short_description: cand.short_description,
          full_description: cand.full_description,
          logo_url: cand.logo_url || '',
          pricing_type: cand.pricing_type,
          starting_price: cand.starting_price,
          currency: cand.currency || 'USD',
          data_source: cand.data_source || 'automated_discovery',
          verification_status: 'unverified',
          publication_status: 'draft',
          featured: false,
          sponsored: false,
          upvotes: 0,
          views_count: 0,
          categories: [],
          created_at: startTime,
          updated_at: startTime
        });

        report.inserted_drafts++;
        report.inserted_tools.push({ name: cand.name, domain, id: newTool.id, category: cand.category });
        console.log(`   ✅ Inserted draft [ID: ${newTool.id}]: "${cand.name}" (${domain})${categoryId ? ` [Category linked: ${cand.category}]` : ''}`);
      }
    }

    // B. Finalize batch record
    if (batchId) {
      await supabaseClient
        .from('import_batches')
        .update({
          inserted_rows: report.inserted_drafts,
          duplicate_rows: report.duplicates_detected,
          rejected_rows: report.filtered_out_non_products + report.failed_inserts,
          status: report.failed_inserts > 0 && report.inserted_drafts > 0 ? 'partial' : report.failed_inserts > 0 ? 'failed' : 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);
    }

    // C. Write Audit Log
    try {
      await supabaseClient.from('audit_logs').insert({
        action: 'automated_discovery_run',
        entity_type: 'import_batch',
        entity_id: batchId || 'automated_job',
        metadata: {
          mode: report.mode,
          inserted_drafts: report.inserted_drafts,
          linked_categories: report.linked_categories,
          duplicates_prevented: report.duplicates_detected,
          non_products_rejected: report.filtered_out_non_products,
          failed_url_checks: report.failed_url_checks,
          failed_inserts: report.failed_inserts,
          tools: report.inserted_tools.map(t => t.name)
        }
      });
    } catch {
      // Non-fatal
    }
  } else if (report.mode === 'live_noop') {
    console.log('\n✅ LIVE RUN COMPLETED (Supabase connected): 0 new eligible tools to insert (all discovered candidates were duplicates or filtered out).');
    try {
      await supabaseClient.from('audit_logs').insert({
        action: 'automated_discovery_run',
        entity_type: 'import_batch',
        entity_id: 'live_noop',
        metadata: {
          mode: report.mode,
          existing_catalog_count: existingTools.length,
          total_discovered: report.total_discovered,
          duplicates_prevented: report.duplicates_detected,
          non_products_rejected: report.filtered_out_non_products,
          failed_url_checks: report.failed_url_checks,
          inserted_drafts: 0
        }
      });
    } catch {
      // Non-fatal
    }
  } else {
    // True Dry-Run mode (no Supabase credentials or explicit --dry-run)
    report.inserted_drafts = verifiedCandidates.length;
    report.inserted_tools = verifiedCandidates.map(c => ({
      name: c.name,
      domain: c.normalized_domain || normalizeDomain(c.website_url),
      category: c.category
    }));
    console.log(`\n🧪 DRY-RUN COMPLETED: ${verifiedCandidates.length} tools verified and ready for safe draft insertion (no database writes executed).`);
  }

  console.log('\n===============================================================');
  console.log('📋 EXECUTION REPORT:');
  console.log(`   • Execution Mode: ${report.mode}`);
  console.log(`   • Newly Inserted Drafts: ${report.inserted_drafts}`);
  console.log(`   • Categories Linked: ${report.linked_categories}`);
  console.log(`   • Failed Inserts: ${report.failed_inserts}`);
  console.log(`   • Duplicates Prevented: ${report.duplicates_detected}`);
  console.log(`   • Non-Products Filtered: ${report.filtered_out_non_products}`);
  console.log(`   • Failed URL Checks: ${report.failed_url_checks}`);
  console.log('===============================================================\n');

  return report;
}

const isDirectCliExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/run_automated_discovery.ts'));

if (isDirectCliExecution) {
  runAutomatedDiscovery()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal automated discovery failure:', err);
      process.exit(1);
    });
}
