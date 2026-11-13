import { SourceAdapter, DiscoveredToolCandidate, DiscoveryBatchResult, DiscoverySourceMetadata } from './types';
import { GitHubAiToolsAdapter } from './githubAdapter';
import { CuratedOpenDatasetAdapter } from './curatedDatasetAdapter';
import { HuggingFaceSpacesAdapter } from './huggingFaceAdapter';
import { PublicRssFeedAdapter } from './rssAdapter';
import { ToolImportRowSchema, normalizeDomain, generateSlug } from '../../lib/validation';
import { Tool } from '../../types/database';

/**
 * Normalizes a URL for robust deduplication comparison
 */
export function cleanUrlForDedup(rawUrl: string): string {
  try {
    let trimmed = rawUrl.trim().toLowerCase();
    if (!trimmed.startsWith('http')) trimmed = 'https://' + trimmed;
    const u = new URL(trimmed);
    return (u.hostname + u.pathname).replace(/\/+$/, '').replace(/^www\./, '');
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Multi-tenant platforms where multiple different tools share the same top-level domain.
 * For these platforms, we check path/full URL and tool name/slug, rather than treating
 * the root domain alone as a duplicate collision.
 */
export const SHARED_PLATFORM_DOMAINS = new Set([
  'github.com',
  'huggingface.co',
  'hf.space',
  'streamlit.app',
  'gradio.app',
  'vercel.app',
  'netlify.app'
]);

/**
 * Checks whether a candidate matches an existing tool record while respecting
 * multi-tenant shared platforms (e.g. huggingface.co).
 * - On shared platforms: matches by normalized website_url, slug, or name (NEVER domain alone).
 * - On independent domains: matches by normalized_domain, slug, name, or normalized website_url.
 */
export function matchesExistingToolRecord(
  candidate: { name: string; website_url: string; normalized_domain?: string },
  existing: { name: string; slug: string; website_url: string; normalized_domain: string }
): { matched: boolean; reason?: string } {
  const domain = (candidate.normalized_domain || normalizeDomain(candidate.website_url)).toLowerCase().trim();
  const slug = generateSlug(candidate.name).toLowerCase().trim();
  const nameKey = candidate.name.toLowerCase().trim();
  const cleanUrl = cleanUrlForDedup(candidate.website_url);
  const isSharedPlatform = SHARED_PLATFORM_DOMAINS.has(domain);

  if (!isSharedPlatform && existing.normalized_domain.toLowerCase().trim() === domain) {
    return { matched: true, reason: `Domain '${domain}' already cataloged in directory` };
  }
  if (existing.slug.toLowerCase().trim() === slug) {
    return { matched: true, reason: `Slug '${slug}' already exists in directory` };
  }
  if (existing.name.toLowerCase().trim() === nameKey) {
    return { matched: true, reason: `Tool name '${candidate.name}' already cataloged in directory` };
  }
  if (cleanUrlForDedup(existing.website_url) === cleanUrl) {
    return { matched: true, reason: `URL '${candidate.website_url}' already cataloged in directory` };
  }
  return { matched: false };
}

/**
 * Discovery Engine Coordinator
 * Manages registered adapters, runs deduplication against current directory tools,
 * executes validation checks, and formats batches ready for safe draft insertion.
 */
export class DiscoveryService {
  private adapters: Map<string, SourceAdapter> = new Map();

  constructor() {
    this.registerAdapter(new CuratedOpenDatasetAdapter());
    this.registerAdapter(new GitHubAiToolsAdapter());
    this.registerAdapter(new HuggingFaceSpacesAdapter());
    this.registerAdapter(new PublicRssFeedAdapter());
  }

  public registerAdapter(adapter: SourceAdapter) {
    this.adapters.set(adapter.metadata.id, adapter);
  }

  public getAvailableSources(): DiscoverySourceMetadata[] {
    return Array.from(this.adapters.values()).map(a => a.metadata);
  }

  /**
   * Run discovery batch from selected source with duplicate detection & validation
   */
  public async runDiscovery(
    sourceId: string,
    existingTools: Tool[],
    options?: { limit?: number; query?: string }
  ): Promise<DiscoveryBatchResult> {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      throw new Error(`Discovery source adapter '${sourceId}' is not registered.`);
    }

    const rawCandidates = await adapter.discover(options);

    // Existing indices for deduplication
    const existingDomains = new Set(existingTools.map(t => t.normalized_domain.toLowerCase().trim()));
    const existingNames = new Set(existingTools.map(t => t.name.toLowerCase().trim()));
    const existingSlugs = new Set(existingTools.map(t => t.slug.toLowerCase().trim()));
    const existingUrls = new Set(existingTools.map(t => cleanUrlForDedup(t.website_url)));

    // Intra-batch deduplication sets
    const seenInBatchDomains = new Set<string>();
    const seenInBatchNames = new Set<string>();
    const seenInBatchSlugs = new Set<string>();
    const seenInBatchUrls = new Set<string>();

    let softwareProductsCount = 0;
    let nonProductsCount = 0;
    let duplicatesCount = 0;
    let validCount = 0;

    const evaluatedCandidates = rawCandidates.map(candidate => {
      // 1. Requirement 3: Official website verification (Do not accept raw GitHub repo as official website)
      const isRawGitHubRepo = candidate.website_url.toLowerCase().includes('github.com/') &&
        !candidate.website_url.toLowerCase().includes('.github.io');

      if (isRawGitHubRepo) {
        candidate.is_software_product = false;
        candidate.rejection_reason = 'Lacks standalone official website URL; GitHub repository link is code repository only, not an official product site.';
        candidate.evaluation_status = 'Rejected — Not a Software Product';
      }

      // Classification count
      if (candidate.is_software_product) {
        softwareProductsCount++;
      } else {
        nonProductsCount++;
      }

      // 2. Requirement 2: Enhanced Duplicate Detection (Domain, Name, Slug, Full URL + Intra-batch)
      const domain = candidate.normalized_domain || normalizeDomain(candidate.website_url);
      const nameKey = candidate.name.toLowerCase().trim();
      const slug = generateSlug(candidate.name).toLowerCase().trim();
      const cleanUrl = cleanUrlForDedup(candidate.website_url);
      const isSharedPlatform = SHARED_PLATFORM_DOMAINS.has(domain);

      let isDuplicate = false;
      let duplicateReason: string | undefined;

      // A. Check against database
      if (!isSharedPlatform && existingDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Domain '${domain}' already cataloged in directory`;
      } else if (existingNames.has(nameKey)) {
        isDuplicate = true;
        duplicateReason = `Tool name '${candidate.name}' already cataloged in directory`;
      } else if (existingSlugs.has(slug)) {
        isDuplicate = true;
        duplicateReason = `Slug '${slug}' already exists in directory`;
      } else if (existingUrls.has(cleanUrl)) {
        isDuplicate = true;
        duplicateReason = `URL '${candidate.website_url}' already cataloged in directory`;
      }
      // B. Check within the same batch (intra-batch deduplication)
      else if (!isSharedPlatform && seenInBatchDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Duplicate domain '${domain}' within current discovery batch`;
      } else if (seenInBatchNames.has(nameKey)) {
        isDuplicate = true;
        duplicateReason = `Duplicate tool name '${candidate.name}' within current discovery batch`;
      } else if (seenInBatchSlugs.has(slug)) {
        isDuplicate = true;
        duplicateReason = `Duplicate slug '${slug}' within current discovery batch`;
      } else if (seenInBatchUrls.has(cleanUrl)) {
        isDuplicate = true;
        duplicateReason = `Duplicate URL within current discovery batch`;
      }

      if (isDuplicate) {
        duplicatesCount++;
      } else {
        if (!isSharedPlatform) seenInBatchDomains.add(domain);
        seenInBatchNames.add(nameKey);
        seenInBatchSlugs.add(slug);
        seenInBatchUrls.add(cleanUrl);
      }

      // 3. Schema validation check against ToolImportRowSchema
      const validationErrors: string[] = [];
      const parsed = ToolImportRowSchema.safeParse({
        name: candidate.name,
        website_url: candidate.website_url,
        short_description: candidate.short_description,
        full_description: candidate.full_description,
        pricing_type: candidate.pricing_type,
        starting_price: candidate.starting_price,
        currency: candidate.currency,
        category: candidate.category,
        data_source: candidate.data_source,
        official_source_url: candidate.official_source_url,
        source_license: candidate.source_license || '',
        source_attribution: candidate.source_attribution || '',
        logo_url: candidate.logo_url || '',
        affiliate_url: ''
      });

      if (!parsed.success) {
        parsed.error.issues.forEach(issue => {
          validationErrors.push(`${issue.path.join('.')}: ${issue.message}`);
        });
      } else {
        validCount++;
      }

      // Assign exact evaluation status label
      let evaluationStatus: typeof candidate.evaluation_status = candidate.evaluation_status || 'Ready for Draft Import';
      if (!candidate.is_software_product) {
        evaluationStatus = 'Rejected — Not a Software Product';
      } else if (isDuplicate) {
        evaluationStatus = 'Duplicate';
      } else if (validationErrors.length > 0) {
        evaluationStatus = 'Needs Correction';
      }

      // Candidate updated with final evaluation status
      candidate.evaluation_status = evaluationStatus;

      // Auto-select ONLY candidates that are Ready for Draft Import
      const selected = evaluationStatus === 'Ready for Draft Import';

      return {
        candidate,
        is_duplicate: isDuplicate,
        duplicate_reason: duplicateReason,
        validation_errors: validationErrors,
        selected
      };
    });

    return {
      source_id: adapter.metadata.id,
      source_name: adapter.metadata.name,
      timestamp: new Date().toISOString(),
      total_discovered: rawCandidates.length,
      software_products_identified: softwareProductsCount,
      filtered_out_non_products: nonProductsCount,
      duplicates_detected: duplicatesCount,
      validation_passed: validCount,
      candidates: evaluatedCandidates
    };
  }

  /**
   * Run discovery across all registered adapters and aggregate results
   */
  public async runAllSources(
    existingTools: Tool[],
    options?: { limitPerSource?: number }
  ): Promise<DiscoveryBatchResult[]> {
    const results: DiscoveryBatchResult[] = [];
    const accumulatedTools: Tool[] = [...existingTools];

    for (const adapter of this.adapters.values()) {
      if (!adapter.metadata.enabled) continue;
      try {
        const result = await this.runDiscovery(adapter.metadata.id, accumulatedTools, {
          limit: options?.limitPerSource || 10
        });
        results.push(result);

        // Track approved candidates across sources in the same run so cross-adapter duplicates are caught
        for (const item of result.candidates) {
          if (item.candidate.evaluation_status === 'Ready for Draft Import' && !item.is_duplicate) {
            const c = item.candidate;
            accumulatedTools.push({
              id: `batch-${generateSlug(c.name)}`,
              name: c.name,
              slug: generateSlug(c.name),
              website_url: c.website_url,
              normalized_domain: c.normalized_domain || normalizeDomain(c.website_url),
              short_description: c.short_description,
              full_description: c.full_description,
              logo_url: c.logo_url || '',
              pricing_type: c.pricing_type,
              starting_price: c.starting_price,
              currency: c.currency,
              data_source: c.data_source,
              verification_status: 'unverified',
              publication_status: 'draft',
              featured: false,
              sponsored: false,
              upvotes: 0,
              views_count: 0,
              categories: [],
              created_at: c.discovered_at,
              updated_at: c.discovered_at
            });
          }
        }
      } catch (err) {
        console.warn(`Discovery failed for adapter ${adapter.metadata.id}:`, err);
      }
    }
    return results;
  }
}

export const discoveryService = new DiscoveryService();
