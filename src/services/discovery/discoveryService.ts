import { SourceAdapter, DiscoveredToolCandidate, DiscoveryBatchResult, DiscoverySourceMetadata } from './types';
import { GitHubAiToolsAdapter } from './githubAdapter';
import { CuratedOpenDatasetAdapter } from './curatedDatasetAdapter';
import { ToolImportRowSchema, normalizeDomain, generateSlug } from '../../lib/validation';
import { Tool } from '../../types/database';

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
    const existingDomains = new Set(existingTools.map(t => t.normalized_domain));
    const existingNames = new Set(existingTools.map(t => t.name.toLowerCase().trim()));
    const existingSlugs = new Set(existingTools.map(t => t.slug));

    const seenInBatchDomains = new Set<string>();

    let softwareProductsCount = 0;
    let nonProductsCount = 0;
    let duplicatesCount = 0;
    let validCount = 0;

    const evaluatedCandidates = rawCandidates.map(candidate => {
      // 1. Classification check
      if (candidate.is_software_product) {
        softwareProductsCount++;
      } else {
        nonProductsCount++;
      }

      // 2. Duplicate Detection
      const domain = candidate.normalized_domain || normalizeDomain(candidate.website_url);
      const nameKey = candidate.name.toLowerCase().trim();
      const slug = generateSlug(candidate.name);

      let isDuplicate = false;
      let duplicateReason: string | undefined;

      if (existingDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Domain '${domain}' already cataloged in directory`;
      } else if (existingNames.has(nameKey) || existingSlugs.has(slug)) {
        isDuplicate = true;
        duplicateReason = `Tool name '${candidate.name}' already cataloged in directory`;
      } else if (seenInBatchDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Duplicate domain '${domain}' within same discovery stream`;
      }

      if (isDuplicate) {
        duplicatesCount++;
      } else {
        seenInBatchDomains.add(domain);
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
}

export const discoveryService = new DiscoveryService();
