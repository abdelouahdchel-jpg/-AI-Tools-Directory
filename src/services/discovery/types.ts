/**
 * Automatic AI Tools Discovery - Source Adapter Types & Contracts
 */

export type DiscoveryEvaluationStatus =
  | 'Ready for Draft Import'
  | 'Needs Correction'
  | 'Needs Manual Review'
  | 'Rejected — Not a Software Product'
  | 'Duplicate';

export interface DiscoveredToolCandidate {
  name: string;
  website_url: string;
  normalized_domain: string;
  short_description: string;
  full_description: string;
  category: string;
  pricing_type: 'free' | 'freemium' | 'paid' | 'open_source' | 'unknown';
  starting_price: number | null; // Null when price cannot be officially verified; never default to $0
  currency: string;
  data_source: string;
  official_source_url: string;
  source_license?: string;
  source_attribution: string;
  logo_url?: string;
  discovered_at: string;
  last_verified_at: string;
  confidence_score: number; // 0 to 1.0
  is_software_product: boolean; // False for libraries, CLI frameworks without standalone product app, models only
  rejection_reason?: string;
  evaluation_status: DiscoveryEvaluationStatus;
  website_check_result: string;
  uncertain_or_missing_fields: string[];
}

export interface DiscoverySourceMetadata {
  id: string;
  name: string;
  description: string;
  type: 'public_api' | 'open_dataset' | 'curated_feed' | 'rss_feed';
  homepage_url: string;
  is_free: boolean;
  requires_auth: boolean;
  rate_limit_per_minute: number;
  enabled: boolean;
}

export interface SourceAdapter {
  metadata: DiscoverySourceMetadata;
  discover(options?: { limit?: number; query?: string }): Promise<DiscoveredToolCandidate[]>;
}

export interface DiscoveryBatchResult {
  source_id: string;
  source_name: string;
  timestamp: string;
  total_discovered: number;
  software_products_identified: number;
  filtered_out_non_products: number;
  duplicates_detected: number;
  validation_passed: number;
  candidates: Array<{
    candidate: DiscoveredToolCandidate;
    is_duplicate: boolean;
    duplicate_reason?: string;
    validation_errors: string[];
    selected: boolean;
  }>;
}
