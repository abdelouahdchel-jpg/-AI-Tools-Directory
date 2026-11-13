import { createClient } from '@supabase/supabase-js';
import { discoveryService } from '../src/services/discovery/discoveryService';
import { extractPageMetadata } from '../src/services/discovery/metadataExtractor';
import { generateSlug, normalizeDomain } from '../src/lib/validation';
import { INITIAL_TOOLS } from '../src/data/initialData';
import { Tool } from '../src/types/database';

interface DiscoveryRunReport {
  timestamp: string;
  total_discovered: number;
  software_products_identified: number;
  filtered_out_non_products: number;
  duplicates_detected: number;
  validation_passed: number;
  inserted_drafts: number;
  failed_inserts: number;
  inserted_tools: Array<{ name: string; domain: string; id?: string }>;
  duplicate_examples: Array<{ name: string; reason: string }>;
  rejection_examples: Array<{ name: string; reason: string }>;
  errors: string[];
}

async function runAutomatedDiscovery() {
  const startTime = new Date().toISOString();
  console.log('===============================================================');
  console.log('🤖 AI TOOLS DIRECTORY — AUTOMATED DISCOVERY & DRAFT INGESTION');
  console.log(`⏱️  Timestamp: ${startTime}`);
  console.log('===============================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // STRICT SECURITY CONSTRAINT: SUPABASE_SERVICE_ROLE_KEY is used ONLY here in this server/CLI script
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let supabaseClient: any = null;
  let existingTools: Tool[] = [...INITIAL_TOOLS];
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
    } catch (err: any) {
      console.warn(`⚠️  Could not fetch live tools from Supabase (${err.message}). Using catalog fallback.`);
    }
  } else {
    console.log('🧪 DRY-RUN / LOCAL MODE: No Supabase credentials provided in environment.');
    console.log(`   Comparing against ${existingTools.length} built-in catalog tools.`);
  }

  // 1. Run discovery across all free adapters
  console.log('\n📡 Executing discovery across registered public adapters:');
  const availableSources = discoveryService.getAvailableSources();
  availableSources.forEach(s => console.log(`   • [${s.type}] ${s.name} (Free: ${s.is_free})`));

  const batchResults = await discoveryService.runAllSources(existingTools, { limitPerSource: 8 });

  const report: DiscoveryRunReport = {
    timestamp: startTime,
    total_discovered: 0,
    software_products_identified: 0,
    filtered_out_non_products: 0,
    duplicates_detected: 0,
    validation_passed: 0,
    inserted_drafts: 0,
    failed_inserts: 0,
    inserted_tools: [],
    duplicate_examples: [],
    rejection_examples: [],
    errors: []
  };

  const candidatesToImport: any[] = [];

  for (const b of batchResults) {
    report.total_discovered += b.total_discovered;
    report.software_products_identified += b.software_products_identified;
    report.filtered_out_non_products += b.filtered_out_non_products;
    report.duplicates_detected += b.duplicates_detected;
    report.validation_passed += b.validation_passed;

    for (const item of b.candidates) {
      if (item.candidate.evaluation_status === 'Ready for Draft Import' && !item.is_duplicate) {
        candidatesToImport.push(item.candidate);
      } else if (item.is_duplicate) {
        if (report.duplicate_examples.length < 5) {
          report.duplicate_examples.push({
            name: item.candidate.name,
            reason: item.duplicate_reason || 'Already in directory'
          });
        }
      } else if (!item.candidate.is_software_product) {
        if (report.rejection_examples.length < 5) {
          report.rejection_examples.push({
            name: item.candidate.name,
            reason: item.candidate.rejection_reason || 'Not a software product'
          });
        }
      }
    }
  }

  console.log('\n📊 DISCOVERY SUMMARY:');
  console.log(`   • Total Discovered: ${report.total_discovered}`);
  console.log(`   • Software Products Identified: ${report.software_products_identified}`);
  console.log(`   • Filtered Non-Products: ${report.filtered_out_non_products}`);
  console.log(`   • Duplicate Matches Prevented: ${report.duplicates_detected}`);
  console.log(`   • Approved for Safe Draft Import: ${candidatesToImport.length}`);

  // 2. Metadata Enrichment for Approved Candidates
  if (candidatesToImport.length > 0) {
    console.log('\n🔍 Extracting metadata (OpenGraph/favicons) for valid candidates...');
    for (const cand of candidatesToImport) {
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
    }
  }

  // 3. Database Insertion strictly as DRAFT & UNVERIFIED
  if (isLiveSupabase && supabaseClient && candidatesToImport.length > 0) {
    console.log(`\n💾 Inserting ${candidatesToImport.length} verified candidates into Supabase...`);

    // A. Create batch tracking record
    const batchFilename = `gh_actions_${startTime.split('T')[0]}_${Date.now().toString(36)}`;
    const { data: batchData, error: batchErr } = await supabaseClient
      .from('import_batches')
      .insert({
        filename: batchFilename,
        source_name: 'GitHub Actions Automated Discovery',
        source_type: 'api',
        total_rows: candidatesToImport.length,
        valid_rows: candidatesToImport.length,
        inserted_rows: 0,
        duplicate_rows: report.duplicates_detected,
        rejected_rows: report.filtered_out_non_products,
        status: 'processing'
      })
      .select('id')
      .single();

    const batchId = batchData?.id;

    for (const cand of candidatesToImport) {
      const slug = generateSlug(cand.name);
      const domain = cand.normalized_domain || normalizeDomain(cand.website_url);

      // Final pre-insert duplicate check against live database
      const { data: existingCheck } = await supabaseClient
        .from('tools')
        .select('id, name')
        .or(`slug.eq.${slug},normalized_domain.eq.${domain}`)
        .limit(1);

      if (existingCheck && existingCheck.length > 0) {
        console.log(`   ⏭️  Skipping "${cand.name}" (matched live record: ${existingCheck[0].name})`);
        report.duplicates_detected++;
        continue;
      }

      // Mandatory Constraints: publication_status = 'draft', verification_status = 'unverified'
      const { data: newTool, error: insertErr } = await supabaseClient
        .from('tools')
        .insert({
          name: cand.name,
          slug,
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
        report.inserted_drafts++;
        report.inserted_tools.push({ name: cand.name, domain, id: newTool.id });
        console.log(`   ✅ Inserted draft [ID: ${newTool.id}]: "${cand.name}" (${domain})`);
      }
    }

    // B. Finalize batch record
    if (batchId) {
      await supabaseClient
        .from('import_batches')
        .update({
          inserted_rows: report.inserted_drafts,
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
          inserted_drafts: report.inserted_drafts,
          duplicates_prevented: report.duplicates_detected,
          non_products_rejected: report.filtered_out_non_products,
          failed_inserts: report.failed_inserts,
          tools: report.inserted_tools.map(t => t.name)
        }
      });
    } catch {
      // Non-fatal
    }
  } else {
    // Dry-run mode: display what WOULD be inserted
    report.inserted_drafts = candidatesToImport.length;
    report.inserted_tools = candidatesToImport.map(c => ({
      name: c.name,
      domain: c.normalized_domain || normalizeDomain(c.website_url)
    }));
    console.log(`\n🧪 DRY-RUN COMPLETED: ${candidatesToImport.length} tools verified and ready for safe draft insertion.`);
  }

  console.log('\n===============================================================');
  console.log('📋 EXECUTION REPORT:');
  console.log(`   • Newly Inserted Drafts: ${report.inserted_drafts}`);
  console.log(`   • Failed Inserts: ${report.failed_inserts}`);
  console.log(`   • Duplicates Prevented: ${report.duplicates_detected}`);
  console.log(`   • Non-Products Filtered: ${report.filtered_out_non_products}`);
  console.log('===============================================================\n');

  return report;
}

// Execute CLI
runAutomatedDiscovery()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal automated discovery failure:', err);
    process.exit(1);
  });
