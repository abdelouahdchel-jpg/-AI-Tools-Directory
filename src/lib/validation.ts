import { z } from 'zod';

export const PricingTypeEnum = z.enum([
  'free',
  'freemium',
  'paid',
  'free_trial',
  'open_source',
  'unknown'
]);

export const PublicationStatusEnum = z.enum([
  'draft',
  'pending',
  'published',
  'rejected',
  'needs_update'
]);

export const VerificationStatusEnum = z.enum([
  'unverified',
  'pending_review',
  'verified',
  'flagged'
]);

// Normalizes domain to prevent duplicate variations (e.g. https://www.openai.com/chatgpt -> openai.com)
export function normalizeDomain(urlStr: string): string {
  try {
    let clean = urlStr.trim().toLowerCase();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return urlStr.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

// Slugs generator with URL safety
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Zod Schema for CSV/JSON Import Row
export const ToolImportRowSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(150),
  website_url: z.string().url('Invalid website URL'),
  short_description: z.string().min(10, 'Short description must be at least 10 characters').max(280),
  full_description: z.string().min(20, 'Full description must be provided'),
  pricing_type: PricingTypeEnum.default('unknown'),
  starting_price: z.coerce.number().min(0).default(0),
  currency: z.string().max(10).default('USD'),
  category: z.string().min(2, 'Category name or slug is required'),
  data_source: z.string().default('csv_import'),
  official_source_url: z.string().url().optional().or(z.literal('')),
  source_license: z.string().optional().or(z.literal('')),
  source_attribution: z.string().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
  affiliate_url: z.string().url().optional().or(z.literal(''))
});

// Zod Schema for Public Submissions
export const PublicSubmissionSchema = z.object({
  tool_name: z.string().min(2, 'Tool name is required').max(150),
  website_url: z.string().url('Please enter a valid website URL'),
  submitter_email: z.string().email('Please enter a valid email address'),
  description: z.string().min(30, 'Please provide a clear description (at least 30 characters)'),
  pricing_type: PricingTypeEnum.default('freemium'),
  category_id: z.string().optional(),
  source_information: z.string().optional()
});

// Zod Schema for Tool Creation / Update in Admin
export const ToolFormSchema = z.object({
  name: z.string().min(2, 'Tool name is required'),
  slug: z.string().min(2, 'Slug is required'),
  website_url: z.string().url('Valid website URL is required'),
  short_description: z.string().min(10).max(280),
  full_description: z.string().min(20),
  logo_url: z.string().url().optional().or(z.literal('')),
  pricing_type: PricingTypeEnum,
  starting_price: z.coerce.number().min(0),
  currency: z.string().default('USD'),
  affiliate_url: z.string().url().optional().or(z.literal('')),
  official_source_url: z.string().url().optional().or(z.literal('')),
  data_source: z.string().default('manual_entry'),
  verification_status: VerificationStatusEnum.default('unverified'),
  publication_status: PublicationStatusEnum.default('draft'),
  featured: z.boolean().default(false),
  sponsored: z.boolean().default(false),
  categories: z.array(z.string()).min(1, 'Select at least one category')
});
