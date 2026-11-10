/**
 * Production Database & Application Data Contracts
 * Covers all 12 schema entities, enums, filters, and batch import structs.
 */

export type PricingType = 'free' | 'freemium' | 'paid' | 'free_trial' | 'open_source' | 'unknown';
export type PublicationStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'needs_update';
export type VerificationStatus = 'unverified' | 'pending_review' | 'verified' | 'flagged';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type AdminRole = 'super_admin' | 'editor' | 'moderator';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent_id?: string | null;
  icon_name?: string;
  display_order?: number;
  tool_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PricingPlan {
  id: string;
  tool_id: string;
  plan_name: string;
  price: number;
  billing_period: 'monthly' | 'annually' | 'one_time' | 'usage_based' | 'forever_free';
  currency: string;
  description: string;
  features: string[];
  source_url?: string;
  last_verified_at?: string;
}

export interface ToolFeature {
  id: string;
  tool_id: string;
  feature_name: string;
  description?: string;
}

export interface Tool {
  id: string;
  name: string;
  slug: string;
  website_url: string;
  normalized_domain: string;
  short_description: string;
  full_description: string;
  logo_url: string;
  pricing_type: PricingType;
  starting_price: number | null;
  currency: string;
  affiliate_url?: string;
  official_source_url?: string;
  data_source: string;
  source_license?: string;
  source_attribution?: string;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  featured: boolean;
  sponsored: boolean;
  sponsored_until?: string | null;
  upvotes: number;
  views_count: number;
  categories: Category[];
  pricing_plans?: PricingPlan[];
  features?: string[];
  alternatives?: string[]; // IDs or slugs
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  tool_name: string;
  website_url: string;
  submitter_email: string;
  description: string;
  pricing_type: PricingType;
  category_id?: string;
  source_information?: string;
  status: SubmissionStatus;
  admin_notes?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  administrator_id?: string;
  administrator_email?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ImportBatch {
  id: string;
  filename: string;
  source_name: string;
  source_type: 'csv' | 'json' | 'api' | 'manual';
  total_rows: number;
  valid_rows: number;
  inserted_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  rejected_rows: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial' | 'rolled_back';
  error_summary?: string;
  created_at: string;
  completed_at?: string;
}

export interface ImportError {
  id: string;
  batch_id: string;
  row_number: number;
  error_code: string;
  error_message: string;
  original_data?: Record<string, unknown>;
  created_at: string;
}

export interface DirectoryFilters {
  searchQuery: string;
  categorySlug: string;
  pricingTypes: PricingType[];
  onlyFeatured: boolean;
  onlyVerified: boolean;
  sortBy: 'featured' | 'recent' | 'popular' | 'name-asc' | 'name-desc' | 'price-asc';
  page: number;
  pageSize: number;
}
