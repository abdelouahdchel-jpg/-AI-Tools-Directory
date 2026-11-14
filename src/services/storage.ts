import {
  Tool,
  Category,
  Submission,
  AuditLog,
  ImportBatch,
  ImportError,
  DirectoryFilters,
  PricingType,
  PricingPlan,
  PublicationStatus,
  VerificationStatus
} from '../types/database';
import { INITIAL_CATEGORIES, INITIAL_TOOLS } from '../data/initialData';
import { normalizeDomain, generateSlug, ToolImportRowSchema } from '../lib/validation';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_KEYS = {
  TOOLS: 'ai_dir_tools_v1',
  CATEGORIES: 'ai_dir_categories_v1',
  SUBMISSIONS: 'ai_dir_submissions_v1',
  AUDIT_LOGS: 'ai_dir_audit_logs_v1',
  IMPORT_BATCHES: 'ai_dir_import_batches_v1',
  IMPORT_ERRORS: 'ai_dir_import_errors_v1',
  BOOKMARKS: 'ai_dir_bookmarks_v1',
  COMPARE_LIST: 'ai_dir_compare_v1',
  PUBLISHED_CACHE: 'ai_dir_published_cache_v2'
};

export interface FetchPublishedToolsResult {
  tools: Tool[];
  categories: Category[];
  fromCache: boolean;
  cacheTimestamp?: string;
  error?: string;
}

class DirectoryStorageService {
  private tools: Tool[] = [];
  private categories: Category[] = [];
  private submissions: Submission[] = [];
  private auditLogs: AuditLog[] = [];
  private importBatches: ImportBatch[] = [];
  private importErrors: ImportError[] = [];

  // Dedicated state for Supabase published tools
  private publishedTools: Tool[] = [];
  private isUsingCache: boolean = false;
  private cacheTimestamp?: string;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedCategories = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (storedCategories) {
        this.categories = JSON.parse(storedCategories);
      } else {
        this.categories = [...INITIAL_CATEGORIES];
        this.saveCategories();
      }

      // Check if we have an existing published tools cache from Supabase
      const cachedPublished = this.getCachedPublishedTools();
      if (cachedPublished && Array.isArray(cachedPublished.tools) && cachedPublished.tools.length > 0) {
        this.publishedTools = cachedPublished.tools;
        this.isUsingCache = true;
        this.cacheTimestamp = cachedPublished.timestamp;
      }

      const storedTools = localStorage.getItem(STORAGE_KEYS.TOOLS);
      if (storedTools) {
        this.tools = JSON.parse(storedTools);
        // Self-healing migration for existing cached records with broken colon URLs or outdated defaults
        let needsSave = false;
        this.tools.forEach(tool => {
          const initialMatch = INITIAL_TOOLS.find(it => it.id === tool.id || it.slug === tool.slug);
          if (initialMatch && (!tool.logo_url || tool.logo_url.includes('lucide:') || tool.logo_url.includes(':') || tool.logo_url.includes('api.iconify.design'))) {
            tool.logo_url = initialMatch.logo_url;
            needsSave = true;
          } else if (tool.logo_url && tool.logo_url.includes('api.iconify.design/') && tool.logo_url.includes(':')) {
            tool.logo_url = tool.logo_url.replace(':', '/');
            needsSave = true;
          } else if (tool.logo_url && (tool.logo_url.includes('lucide:cpu.svg') || tool.logo_url.includes('lucide:box.svg'))) {
            tool.logo_url = '';
            needsSave = true;
          }
        });
        if (needsSave) {
          this.saveTools();
        }
      } else {
        this.tools = [...INITIAL_TOOLS];
        this.saveTools();
      }

      const storedSubmissions = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
      if (storedSubmissions) {
        this.submissions = JSON.parse(storedSubmissions);
      }

      const storedBatches = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
      if (storedBatches) {
        this.importBatches = JSON.parse(storedBatches);
      }

      const storedErrors = localStorage.getItem(STORAGE_KEYS.IMPORT_ERRORS);
      if (storedErrors) {
        this.importErrors = JSON.parse(storedErrors);
      }

      const storedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (storedLogs) {
        this.auditLogs = JSON.parse(storedLogs);
      }
    } catch {
      this.categories = [...INITIAL_CATEGORIES];
      this.tools = [...INITIAL_TOOLS];
    }
  }

  private saveTools() {
    try {
      localStorage.setItem(STORAGE_KEYS.TOOLS, JSON.stringify(this.tools));
    } catch (e) {
      console.error('Failed to persist tools', e);
    }
  }

  private saveCategories() {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(this.categories));
    } catch (e) {
      console.error('Failed to persist categories', e);
    }
  }

  private saveSubmissions() {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(this.submissions));
    } catch (e) {
      console.error('Failed to persist submissions', e);
    }
  }

  private saveBatches() {
    try {
      localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(this.importBatches));
      localStorage.setItem(STORAGE_KEYS.IMPORT_ERRORS, JSON.stringify(this.importErrors));
    } catch (e) {
      console.error('Failed to persist import batches', e);
    }
  }

  private saveAuditLogs() {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs));
    } catch (e) {
      console.error('Failed to persist audit logs', e);
    }
  }

  public logAuditAction(action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
    const log: AuditLog = {
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      administrator_email: 'admin@aitoolsdirectory.internal',
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs = this.auditLogs.slice(0, 500);
    }
    this.saveAuditLogs();
    return log;
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  // ====================================================================
  // SUPABASE PUBLISHED TOOLS INTEGRATION & LOCAL CACHE
  // ====================================================================

  /**
   * Retrieve cached published tools snapshot if available.
   */
  public getCachedPublishedTools(): { tools: Tool[]; categories: Category[]; timestamp: string } | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PUBLISHED_CACHE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.tools)) {
          return {
            tools: parsed.tools,
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            timestamp: parsed.timestamp || new Date().toISOString()
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Save a snapshot of published tools to localStorage as fallback cache.
   */
  public savePublishedCache(tools: Tool[], categories: Category[]): void {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        tools,
        categories,
        version: 2
      };
      localStorage.setItem(STORAGE_KEYS.PUBLISHED_CACHE, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save published tools cache', e);
    }
  }

  public setPublishedTools(tools: Tool[], categories?: Category[]): void {
    this.publishedTools = tools;
    if (categories && categories.length > 0) {
      this.categories = categories;
    }
  }

  public getPublishedTools(): Tool[] {
    return [...this.publishedTools];
  }

  public isCacheActive(): boolean {
    return this.isUsingCache;
  }

  public getCacheTimestamp(): string | undefined {
    return this.cacheTimestamp;
  }

  /**
   * Fetch only verified, published tools from Supabase with categories, pricing, features, and alternatives.
   * If offline or unconfigured, falls back to local cache snapshot with explicit fromCache flag.
   */
  public async fetchPublishedTools(): Promise<FetchPublishedToolsResult> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      const cached = this.getCachedPublishedTools();
      if (cached && cached.tools.length > 0) {
        this.publishedTools = cached.tools;
        if (cached.categories.length > 0) this.categories = cached.categories;
        this.isUsingCache = true;
        this.cacheTimestamp = cached.timestamp;
        return {
          tools: this.publishedTools,
          categories: this.categories,
          fromCache: true,
          cacheTimestamp: cached.timestamp,
          error: 'Supabase credentials not configured. Displaying local offline cache.'
        };
      }
      this.publishedTools = [];
      this.isUsingCache = false;
      this.cacheTimestamp = undefined;
      throw new Error('Supabase is not configured. Project URL and Anon Public Key are required.');
    }

    try {
      // 1. Fetch published tools from Supabase (strictly publication_status = 'published')
      const { data: toolsData, error: toolsError } = await client
        .from('tools')
        .select('*')
        .eq('publication_status', 'published')
        .order('featured', { ascending: false })
        .order('upvotes', { ascending: false });

      if (toolsError) throw toolsError;

      // 2. Fetch categories from Supabase
      const { data: categoriesData, error: categoriesError } = await client
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (categoriesError) throw categoriesError;

      const rawTools = toolsData || [];
      const rawCategories: Category[] = categoriesData || [];
      const toolIds = rawTools.map((t: any) => t.id);

      const toolCategoriesMap: Record<string, string[]> = {};
      const pricingPlansMap: Record<string, PricingPlan[]> = {};
      const toolFeaturesMap: Record<string, string[]> = {};
      const toolAlternativesMap: Record<string, string[]> = {};

      if (toolIds.length > 0) {
        const [tcRes, ppRes, tfRes, taRes] = await Promise.all([
          client.from('tool_categories').select('tool_id, category_id, is_primary').in('tool_id', toolIds),
          client.from('pricing_plans').select('*').in('tool_id', toolIds),
          client.from('tool_features').select('*').in('tool_id', toolIds),
          client.from('tool_alternatives').select('*').in('tool_id', toolIds)
        ]);

        if (tcRes.data) {
          tcRes.data.forEach((tc: any) => {
            if (!toolCategoriesMap[tc.tool_id]) toolCategoriesMap[tc.tool_id] = [];
            toolCategoriesMap[tc.tool_id].push(tc.category_id);
          });
        }

        if (ppRes.data) {
          ppRes.data.forEach((pp: any) => {
            if (!pricingPlansMap[pp.tool_id]) pricingPlansMap[pp.tool_id] = [];
            pricingPlansMap[pp.tool_id].push({
              id: pp.id,
              tool_id: pp.tool_id,
              plan_name: pp.plan_name,
              price: Number(pp.price) || 0,
              billing_period: pp.billing_period || 'monthly',
              currency: pp.currency || 'USD',
              description: pp.description || '',
              features: Array.isArray(pp.features) ? pp.features : [],
              source_url: pp.source_url,
              last_verified_at: pp.last_verified_at
            });
          });
        }

        if (tfRes.data) {
          tfRes.data.forEach((tf: any) => {
            if (!toolFeaturesMap[tf.tool_id]) toolFeaturesMap[tf.tool_id] = [];
            toolFeaturesMap[tf.tool_id].push(tf.feature_name);
          });
        }

        if (taRes.data) {
          taRes.data.forEach((ta: any) => {
            if (!toolAlternativesMap[ta.tool_id]) toolAlternativesMap[ta.tool_id] = [];
            toolAlternativesMap[ta.tool_id].push(ta.alternative_tool_id);
          });
        }
      }

      // Map rows to Tool interface
      const mappedTools: Tool[] = rawTools.map((row: any) => {
        const assignedCatIds = toolCategoriesMap[row.id] || [];
        const toolCats = rawCategories.filter(c => assignedCatIds.includes(c.id));

        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          website_url: row.website_url,
          normalized_domain: row.normalized_domain || '',
          short_description: row.short_description || '',
          full_description: row.full_description || row.short_description || '',
          logo_url: row.logo_url || '',
          pricing_type: row.pricing_type || 'unknown',
          starting_price: Number(row.starting_price) || 0,
          currency: row.currency || 'USD',
          affiliate_url: row.affiliate_url || '',
          official_source_url: row.official_source_url || row.website_url,
          data_source: row.data_source || 'supabase',
          source_license: row.source_license || '',
          source_attribution: row.source_attribution || '',
          verification_status: row.verification_status || 'unverified',
          publication_status: row.publication_status || 'published',
          featured: Boolean(row.featured),
          sponsored: Boolean(row.sponsored),
          sponsored_until: row.sponsored_until,
          upvotes: Number(row.upvotes) || 0,
          views_count: Number(row.views_count) || 0,
          categories: toolCats.length > 0 ? toolCats : (rawCategories.slice(0, 1) || []),
          pricing_plans: pricingPlansMap[row.id] || [],
          features: toolFeaturesMap[row.id] || [],
          alternatives: toolAlternativesMap[row.id] || [],
          last_verified_at: row.last_verified_at,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      });

      this.publishedTools = mappedTools;
      if (rawCategories.length > 0) {
        this.categories = rawCategories;
      }
      this.isUsingCache = false;
      this.cacheTimestamp = undefined;

      // Update backup cache
      this.savePublishedCache(mappedTools, this.categories);

      return {
        tools: mappedTools,
        categories: this.categories,
        fromCache: false
      };
    } catch (err: any) {
      console.warn('Failed to fetch from Supabase, attempting offline cache...', err);
      const cached = this.getCachedPublishedTools();
      if (cached && cached.tools.length > 0) {
        this.publishedTools = cached.tools;
        if (cached.categories.length > 0) this.categories = cached.categories;
        this.isUsingCache = true;
        this.cacheTimestamp = cached.timestamp;
        return {
          tools: this.publishedTools,
          categories: this.categories,
          fromCache: true,
          cacheTimestamp: cached.timestamp,
          error: err.message || 'Connection to Supabase failed. Displaying cached version.'
        };
      }
      this.publishedTools = [];
      this.isUsingCache = false;
      this.cacheTimestamp = undefined;
      throw err;
    }
  }

  // Categories
  public getCategories(): Category[] {
    // augment with tool counts from published tools
    const sourceTools = this.publishedTools.length > 0 ? this.publishedTools : this.tools;
    return this.categories.map(cat => ({
      ...cat,
      tool_count: sourceTools.filter(t => 
        t.publication_status === 'published' && 
        t.categories.some(c => c.id === cat.id || c.slug === cat.slug)
      ).length
    }));
  }

  public getCategoryBySlug(slug: string): Category | undefined {
    return this.categories.find(c => c.slug === slug);
  }

  public addCategory(cat: Omit<Category, 'id'>): Category {
    const newCat: Category = {
      ...cat,
      id: 'cat-' + generateSlug(cat.name) + '-' + Math.random().toString(36).substring(2, 6)
    };
    this.categories.push(newCat);
    this.saveCategories();
    this.logAuditAction('create_category', 'category', newCat.id, { name: newCat.name });
    return newCat;
  }

  // Tools Queries
  public queryTools(filters: DirectoryFilters): {
    tools: Tool[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    let result = this.publishedTools.filter(t => t.publication_status === 'published');

    // Search query
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase().trim();
      result = result.filter(t => {
        return (
          t.name.toLowerCase().includes(q) ||
          t.short_description.toLowerCase().includes(q) ||
          t.full_description.toLowerCase().includes(q) ||
          t.normalized_domain.toLowerCase().includes(q) ||
          t.categories.some(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) ||
          (t.features && t.features.some(f => f.toLowerCase().includes(q)))
        );
      });
    }

    // Category filter
    if (filters.categorySlug && filters.categorySlug !== 'all') {
      result = result.filter(t => t.categories.some(c => c.slug === filters.categorySlug));
    }

    // Pricing type
    if (filters.pricingTypes && filters.pricingTypes.length > 0) {
      result = result.filter(t => filters.pricingTypes.includes(t.pricing_type));
    }

    // Featured only
    if (filters.onlyFeatured) {
      result = result.filter(t => t.featured);
    }

    // Verified only
    if (filters.onlyVerified) {
      result = result.filter(t => t.verification_status === 'verified');
    }

    // Sorting
    switch (filters.sortBy) {
      case 'featured':
        result.sort((a, b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          return b.upvotes - a.upvotes;
        });
        break;
      case 'popular':
        result.sort((a, b) => b.upvotes - a.upvotes);
        break;
      case 'recent':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        result.sort((a, b) => (a.starting_price ?? 0) - (b.starting_price ?? 0));
        break;
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    const total = result.length;
    const page = Math.max(1, filters.page);
    const pageSize = filters.pageSize || 12;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;
    const paginated = result.slice(start, start + pageSize);

    return {
      tools: paginated,
      total,
      page,
      pageSize,
      totalPages
    };
  }

  public getToolBySlug(slug: string): Tool | undefined {
    return this.publishedTools.find(t => t.slug === slug) || this.tools.find(t => t.slug === slug);
  }

  public getToolById(id: string): Tool | undefined {
    return this.publishedTools.find(t => t.id === id) || this.tools.find(t => t.id === id);
  }

  public getRelatedTools(tool: Tool, limit = 4): Tool[] {
    const categorySlugs = new Set(tool.categories.map(c => c.slug));
    const source = this.publishedTools.length > 0 ? this.publishedTools : this.tools;
    return source
      .filter(t => t.id !== tool.id && t.publication_status === 'published')
      .filter(t => t.categories.some(c => categorySlugs.has(c.slug)))
      .slice(0, limit);
  }

  public recordToolView(toolId: string) {
    const tool = this.publishedTools.find(t => t.id === toolId) || this.tools.find(t => t.id === toolId);
    if (tool) {
      tool.views_count = (tool.views_count || 0) + 1;
      this.saveTools();

      // Best-effort remote update if Supabase is active
      const client = getSupabase();
      if (client && isSupabaseConfigured()) {
        client.from('tools').update({ views_count: tool.views_count }).eq('id', tool.id).then();
      }
    }
  }

  public toggleUpvote(toolId: string): number {
    const tool = this.publishedTools.find(t => t.id === toolId) || this.tools.find(t => t.id === toolId);
    if (tool) {
      const upvotedKey = `tool_upvoted_${toolId}`;
      const hasUpvoted = localStorage.getItem(upvotedKey) === 'true';
      if (hasUpvoted) {
        tool.upvotes = Math.max(0, tool.upvotes - 1);
        localStorage.removeItem(upvotedKey);
      } else {
        tool.upvotes = (tool.upvotes || 0) + 1;
        localStorage.setItem(upvotedKey, 'true');
      }
      this.saveTools();

      // Best-effort remote update if Supabase is active
      const client = getSupabase();
      if (client && isSupabaseConfigured()) {
        client.from('tools').update({ upvotes: tool.upvotes }).eq('id', tool.id).then();
      }

      if (this.publishedTools.length > 0) {
        this.savePublishedCache(this.publishedTools, this.categories);
      }
      return tool.upvotes;
    }
    return 0;
  }

  // ====================================================================
  // SUPABASE ADMIN DATA QUERIES & REAL RECORD MUTATIONS
  // ====================================================================

  /**
   * Fetch ALL tools from Supabase (including published, draft, pending, rejected)
   * Enforced via Supabase RLS ('Admins manage tools' policy).
   */
  public async fetchAdminTools(): Promise<Tool[]> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }

    const { data: toolsData, error: toolsError } = await client
      .from('tools')
      .select('*')
      .order('created_at', { ascending: false });

    if (toolsError) throw toolsError;

    const { data: categoriesData, error: catError } = await client
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (catError) throw catError;

    const rawTools = toolsData || [];
    const rawCategories: Category[] = categoriesData || [];
    const toolIds = rawTools.map((t: any) => t.id);

    const toolCategoriesMap: Record<string, string[]> = {};
    if (toolIds.length > 0) {
      const { data: tcData, error: tcError } = await client
        .from('tool_categories')
        .select('tool_id, category_id')
        .in('tool_id', toolIds);

      if (tcError) {
        console.warn('Failed to fetch tool_categories from Supabase:', tcError);
      } else if (tcData) {
        tcData.forEach((tc: any) => {
          if (!toolCategoriesMap[tc.tool_id]) toolCategoriesMap[tc.tool_id] = [];
          toolCategoriesMap[tc.tool_id].push(tc.category_id);
        });
      }
    }

    const mappedTools: Tool[] = rawTools.map((row: any) => {
      const assignedCatIds = toolCategoriesMap[row.id] || [];
      const toolCats = rawCategories.filter(c => assignedCatIds.includes(c.id));

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        website_url: row.website_url,
        normalized_domain: row.normalized_domain || '',
        short_description: row.short_description || '',
        full_description: row.full_description || row.short_description || '',
        logo_url: row.logo_url || '',
        pricing_type: row.pricing_type || 'unknown',
        starting_price:
          row.starting_price !== null && row.starting_price !== undefined
            ? Number(row.starting_price)
            : null,
        currency: row.currency || 'USD',
        affiliate_url: row.affiliate_url || '',
        official_source_url: row.official_source_url || row.website_url,
        data_source: row.data_source || 'supabase',
        source_license: row.source_license || '',
        source_attribution: row.source_attribution || '',
        verification_status: row.verification_status || 'unverified',
        publication_status: row.publication_status || 'draft',
        featured: Boolean(row.featured),
        sponsored: Boolean(row.sponsored),
        sponsored_until: row.sponsored_until,
        upvotes: Number(row.upvotes) || 0,
        views_count: Number(row.views_count) || 0,
        categories: toolCats.length > 0 ? toolCats : (rawCategories.slice(0, 1) || []),
        last_verified_at: row.last_verified_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    this.tools = mappedTools;
    if (rawCategories.length > 0) {
      this.categories = rawCategories;
    }
    this.saveTools();
    return mappedTools;
  }

  /**
   * Fetch all submissions from public.submissions via Supabase RLS
   */
  public async fetchAdminSubmissions(): Promise<Submission[]> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      return [...this.submissions];
    }

    try {
      const { data, error } = await client
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: Submission[] = (data || []).map((row: any) => ({
        id: row.id,
        tool_name: row.tool_name,
        website_url: row.website_url,
        submitter_email: row.submitter_email,
        description: row.description,
        pricing_type: row.pricing_type || 'unknown',
        source_information: row.source_information || undefined,
        status: row.status || 'pending',
        admin_notes: row.admin_notes || undefined,
        created_at: row.created_at
      }));

      this.submissions = mapped;
      this.saveSubmissions();
      return mapped;
    } catch (err) {
      console.warn('Failed to fetch submissions from Supabase:', err);
      return [...this.submissions];
    }
  }

  /**
   * Fetch categories from public.categories
   */
  public async fetchAdminCategories(): Promise<Category[]> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      return this.getCategories();
    }

    try {
      const { data, error } = await client
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      const mapped: Category[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description || '',
        icon_name: row.icon_name || 'Sparkles',
        display_order: row.display_order ?? 0,
        tool_count: this.tools.filter(t => t.categories.some(c => c.id === row.id || c.slug === row.slug)).length,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      this.categories = mapped;
      this.saveCategories();
      return mapped;
    } catch (err) {
      console.warn('Failed to fetch categories from Supabase:', err);
      return this.getCategories();
    }
  }

  /**
   * Fetch audit logs from public.audit_logs
   */
  public async fetchAdminAuditLogs(): Promise<AuditLog[]> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      return [...this.auditLogs];
    }

    try {
      const { data, error } = await client
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;

      const mapped: AuditLog[] = (data || []).map((row: any) => ({
        id: row.id,
        administrator_id: row.administrator_id,
        administrator_email: row.administrator_email || 'admin@aitoolsdirectory.internal',
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id || '',
        metadata: row.metadata || {},
        timestamp: row.timestamp
      }));

      this.auditLogs = mapped;
      this.saveAuditLogs();
      return mapped;
    } catch (err) {
      console.warn('Failed to fetch audit logs from Supabase:', err);
      return [...this.auditLogs];
    }
  }

  /**
   * Fetch import batches from public.import_batches
   */
  public async fetchAdminBatches(): Promise<ImportBatch[]> {
    const client = getSupabase();
    if (!client || !isSupabaseConfigured()) {
      return [...this.importBatches];
    }

    try {
      const { data, error } = await client
        .from('import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped: ImportBatch[] = (data || []).map((row: any) => ({
        id: row.id,
        filename: row.filename,
        source_name: row.source_name,
        source_type: row.source_type,
        total_rows: row.total_rows || 0,
        valid_rows: row.valid_rows || 0,
        inserted_rows: row.inserted_rows || 0,
        updated_rows: row.updated_rows || 0,
        duplicate_rows: row.duplicate_rows || 0,
        rejected_rows: row.rejected_rows || 0,
        status: row.status,
        error_summary: row.error_summary,
        created_at: row.created_at,
        completed_at: row.completed_at
      }));

      this.importBatches = mapped;
      this.saveBatches();
      return mapped;
    } catch (err) {
      console.warn('Failed to fetch import batches from Supabase:', err);
      return [...this.importBatches];
    }
  }

  /**
   * Toggle publication status directly in public.tools
   */
  public async toggleToolPublicationAdmin(toolId: string, currentStatus: PublicationStatus): Promise<PublicationStatus> {
    const newStatus: PublicationStatus = currentStatus === 'published' ? 'draft' : 'published';
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      const { error } = await client
        .from('tools')
        .update({
          publication_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', toolId);

      if (error) throw error;
      await this.logAuditActionRemote('toggle_publication', 'tool', toolId, { previous: currentStatus, next: newStatus });
    }

    const tool = this.tools.find(t => t.id === toolId);
    if (tool) {
      tool.publication_status = newStatus;
      tool.updated_at = new Date().toISOString();
      this.saveTools();
    }
    return newStatus;
  }

  /**
   * Toggle verification status directly in public.tools
   */
  public async toggleToolVerificationAdmin(toolId: string, currentStatus: VerificationStatus): Promise<VerificationStatus> {
    const newStatus: VerificationStatus = currentStatus === 'verified' ? 'unverified' : 'verified';
    const lastVerified = newStatus === 'verified' ? new Date().toISOString() : null;
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      const { error } = await client
        .from('tools')
        .update({
          verification_status: newStatus,
          last_verified_at: lastVerified,
          updated_at: new Date().toISOString()
        })
        .eq('id', toolId);

      if (error) throw error;
      await this.logAuditActionRemote('toggle_verification', 'tool', toolId, { previous: currentStatus, next: newStatus });
    }

    const tool = this.tools.find(t => t.id === toolId);
    if (tool) {
      tool.verification_status = newStatus;
      tool.last_verified_at = lastVerified || undefined;
      tool.updated_at = new Date().toISOString();
      this.saveTools();
    }
    return newStatus;
  }

  /**
   * Delete a tool from public.tools (cascades to related tables via RLS)
   */
  public async deleteToolAdmin(toolId: string): Promise<boolean> {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      const { error } = await client.from('tools').delete().eq('id', toolId);
      if (error) throw error;
      await this.logAuditActionRemote('delete_tool', 'tool', toolId);
    }

    const index = this.tools.findIndex(t => t.id === toolId);
    if (index !== -1) {
      this.tools.splice(index, 1);
      this.saveTools();
    }
    return true;
  }

  /**
   * Save or Update tool in public.tools and maintain tool_categories relations
   */
  public async saveOrUpdateToolAdmin(toolData: Partial<Tool> & { name: string; website_url: string }): Promise<Tool> {
    const normalizedDomain = normalizeDomain(toolData.website_url);
    const slug = toolData.slug || generateSlug(toolData.name);
    const client = getSupabase();

    const isUUID = Boolean(toolData.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toolData.id));

    if (client && isSupabaseConfigured()) {
      if (isUUID && toolData.id) {
        // UPDATE existing tool in Supabase
        const { error: updateError } = await client
          .from('tools')
          .update({
            name: toolData.name,
            slug,
            website_url: toolData.website_url,
            normalized_domain: normalizedDomain,
            short_description: toolData.short_description || '',
            full_description: toolData.full_description || toolData.short_description || '',
            pricing_type: toolData.pricing_type || 'unknown',
            starting_price: toolData.starting_price ?? null,
            currency: toolData.currency || 'USD',
            publication_status: toolData.publication_status || 'draft',
            verification_status: toolData.verification_status || 'unverified',
            last_verified_at: toolData.verification_status === 'verified' ? (toolData.last_verified_at || new Date().toISOString()) : null,
            featured: Boolean(toolData.featured),
            sponsored: Boolean(toolData.sponsored),
            updated_at: new Date().toISOString()
          })
          .eq('id', toolData.id);

        if (updateError) throw updateError;

        if (toolData.categories && toolData.categories.length > 0) {
          const validCatIds = toolData.categories
            .map(c => c.id)
            .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

          if (validCatIds.length > 0) {
            await client.from('tool_categories').delete().eq('tool_id', toolData.id);
            const catInserts = validCatIds.map((cid, idx) => ({
              tool_id: toolData.id,
              category_id: cid,
              is_primary: idx === 0
            }));
            await client.from('tool_categories').insert(catInserts);
          }
        }

        await this.logAuditActionRemote('update_tool', 'tool', toolData.id, { name: toolData.name });
        return {
          ...toolData,
          id: toolData.id,
          normalized_domain: normalizedDomain,
          slug,
          categories: toolData.categories || []
        } as Tool;
      } else {
        // INSERT new tool into Supabase
        const { data: insertData, error: insertError } = await client
          .from('tools')
          .insert({
            name: toolData.name,
            slug,
            website_url: toolData.website_url,
            normalized_domain: normalizedDomain,
            short_description: toolData.short_description || '',
            full_description: toolData.full_description || toolData.short_description || '',
            logo_url: toolData.logo_url || null,
            pricing_type: toolData.pricing_type || 'unknown',
            starting_price: toolData.starting_price ?? null,
            currency: toolData.currency || 'USD',
            data_source: toolData.data_source || 'manual_admin_entry',
            publication_status: toolData.publication_status || 'draft',
            verification_status: toolData.verification_status || 'unverified',
            last_verified_at: toolData.verification_status === 'verified' ? new Date().toISOString() : null,
            featured: Boolean(toolData.featured),
            sponsored: Boolean(toolData.sponsored),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const newId = insertData.id;
        if (toolData.categories && toolData.categories.length > 0) {
          const validCatIds = toolData.categories
            .map(c => c.id)
            .filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

          if (validCatIds.length > 0) {
            const catInserts = validCatIds.map((cid, idx) => ({
              tool_id: newId,
              category_id: cid,
              is_primary: idx === 0
            }));
            await client.from('tool_categories').insert(catInserts);
          }
        }

        await this.logAuditActionRemote('create_tool', 'tool', newId, { name: toolData.name });
        return {
          ...toolData,
          id: newId,
          normalized_domain: normalizedDomain,
          slug,
          categories: toolData.categories || []
        } as Tool;
      }
    }

    return this.saveOrUpdateTool(toolData);
  }

  /**
   * Review Community Submission in public.submissions
   * If approved, creates a new draft tool in public.tools
   */
  public async reviewSubmissionAdmin(submissionId: string, status: 'approved' | 'rejected', notes = ''): Promise<Submission | null> {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      const now = new Date().toISOString();
      const { data: subData, error: subError } = await client
        .from('submissions')
        .update({
          status,
          admin_notes: notes || null,
          reviewed_at: now
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (subError) throw subError;

      if (status === 'approved' && subData) {
        const domain = normalizeDomain(subData.website_url);
        const slug = generateSlug(subData.tool_name);

        const { data: newTool, error: toolErr } = await client
          .from('tools')
          .insert({
            name: subData.tool_name,
            slug,
            website_url: subData.website_url,
            normalized_domain: domain,
            short_description: subData.description.slice(0, 280),
            full_description: subData.description,
            pricing_type: subData.pricing_type || 'unknown',
            data_source: 'user_submission',
            source_attribution: 'Community submission by ' + subData.submitter_email,
            publication_status: 'draft',
            verification_status: 'pending_review',
            created_at: now,
            updated_at: now
          })
          .select()
          .single();

        if (!toolErr && newTool) {
          const defaultCat = this.categories[0];
          if (defaultCat && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(defaultCat.id)) {
            await client.from('tool_categories').insert({
              tool_id: newTool.id,
              category_id: defaultCat.id,
              is_primary: true
            });
          }
        }
      }

      await this.logAuditActionRemote('review_submission', 'submission', submissionId, {
        status,
        tool_name: subData?.tool_name
      });

      return {
        id: submissionId,
        tool_name: subData?.tool_name || '',
        website_url: subData?.website_url || '',
        submitter_email: subData?.submitter_email || '',
        description: subData?.description || '',
        pricing_type: subData?.pricing_type || 'unknown',
        status,
        admin_notes: notes,
        created_at: subData?.created_at || now
      };
    }

    return this.reviewSubmission(submissionId, status, notes);
  }

  /**
   * Add a new category in public.categories
   */
  public async addCategoryAdmin(name: string, description: string): Promise<Category> {
    const slug = generateSlug(name);
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      const maxOrder = this.categories.length > 0 ? Math.max(...this.categories.map(c => c.display_order || 0)) : 0;
      const { data, error } = await client
        .from('categories')
        .insert({
          name: name.trim(),
          slug,
          description: description.trim() || `Tools in ${name.trim()}`,
          icon_name: 'Sparkles',
          display_order: maxOrder + 1
        })
        .select()
        .single();

      if (error) throw error;
      const newCat: Category = {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        icon_name: data.icon_name,
        display_order: data.display_order,
        tool_count: 0
      };
      this.categories.push(newCat);
      this.saveCategories();
      await this.logAuditActionRemote('create_category', 'category', data.id, { name: data.name });
      return newCat;
    }

    return this.addCategory({ name, slug, description });
  }

  /**
   * Remote-aware audit logger that records to public.audit_logs via active admin authentication
   */
  public async logAuditActionRemote(action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (user) {
          await client.from('audit_logs').insert({
            administrator_id: user.id,
            administrator_email: user.email,
            action,
            entity_type: entityType,
            entity_id: String(entityId),
            metadata: metadata || {}
          });
        }
      } catch (e) {
        console.warn('Failed to insert remote audit log:', e);
      }
    }
    this.logAuditAction(action, entityType, entityId, metadata);
  }

  // Admin Tools Management (Synchronous memory accessor)
  public getAllToolsAdmin(): Tool[] {
    return [...this.tools];
  }

  public saveOrUpdateTool(toolData: Partial<Tool> & { name: string; website_url: string }): Tool {
    const normalizedDomain = normalizeDomain(toolData.website_url);
    const slug = toolData.slug || generateSlug(toolData.name);

    if (toolData.id) {
      const index = this.tools.findIndex(t => t.id === toolData.id);
      if (index !== -1) {
        const updated: Tool = {
          ...this.tools[index],
          ...toolData,
          normalized_domain: normalizedDomain,
          slug,
          updated_at: new Date().toISOString()
        };
        this.tools[index] = updated;
        this.saveTools();
        this.logAuditAction('update_tool', 'tool', updated.id, { name: updated.name, status: updated.publication_status });
        return updated;
      }
    }

    // Create new
    const newTool: Tool = {
      id: 'tool-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: toolData.name,
      slug,
      website_url: toolData.website_url,
      normalized_domain: normalizedDomain,
      short_description: toolData.short_description || '',
      full_description: toolData.full_description || toolData.short_description || '',
      logo_url: toolData.logo_url || '',
      pricing_type: toolData.pricing_type || 'unknown',
      starting_price: toolData.starting_price || 0,
      currency: toolData.currency || 'USD',
      affiliate_url: toolData.affiliate_url || '',
      official_source_url: toolData.official_source_url || toolData.website_url,
      data_source: toolData.data_source || 'manual_admin_entry',
      source_license: toolData.source_license || '',
      source_attribution: toolData.source_attribution || '',
      verification_status: toolData.verification_status || 'unverified',
      publication_status: toolData.publication_status || 'draft',
      featured: toolData.featured || false,
      sponsored: toolData.sponsored || false,
      upvotes: 0,
      views_count: 0,
      categories: toolData.categories || [this.categories[0]],
      pricing_plans: toolData.pricing_plans || [],
      features: toolData.features || [],
      alternatives: toolData.alternatives || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.tools.push(newTool);
    this.saveTools();
    this.logAuditAction('create_tool', 'tool', newTool.id, { name: newTool.name, status: newTool.publication_status });
    return newTool;
  }

  public deleteTool(id: string): boolean {
    const index = this.tools.findIndex(t => t.id === id);
    if (index !== -1) {
      const removed = this.tools.splice(index, 1)[0];
      this.saveTools();
      this.logAuditAction('delete_tool', 'tool', id, { name: removed.name });
      return true;
    }
    return false;
  }

  // Submissions Management
  public submitTool(submission: Omit<Submission, 'id' | 'status' | 'created_at'>): Submission {
    const newSubmission: Submission = {
      ...submission,
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    this.submissions.unshift(newSubmission);
    this.saveSubmissions();

    // Persist to Supabase submissions table if configured
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      client.from('submissions').insert({
        tool_name: submission.tool_name,
        website_url: submission.website_url,
        submitter_email: submission.submitter_email,
        description: submission.description,
        pricing_type: submission.pricing_type || 'unknown',
        source_information: submission.source_information || null,
        status: 'pending'
      }).then();
    }

    return newSubmission;
  }

  public getSubmissions(): Submission[] {
    return [...this.submissions];
  }

  public reviewSubmission(id: string, status: 'approved' | 'rejected', notes = ''): Submission | null {
    const sub = this.submissions.find(s => s.id === id);
    if (!sub) return null;

    sub.status = status;
    sub.admin_notes = notes;

    if (status === 'approved') {
      const category = this.categories.find(c => c.id === sub.category_id) || this.categories[0];
      this.saveOrUpdateTool({
        name: sub.tool_name,
        website_url: sub.website_url,
        short_description: sub.description.substring(0, 200),
        full_description: sub.description,
        pricing_type: sub.pricing_type,
        data_source: 'user_submission',
        source_attribution: 'Submitted by ' + sub.submitter_email,
        publication_status: 'draft',
        verification_status: 'pending_review',
        categories: [category]
      });
    }

    this.saveSubmissions();
    this.logAuditAction('review_submission', 'submission', sub.id, { tool_name: sub.tool_name, status });
    return sub;
  }

  // Bulk Import System Engine
  public parseAndValidateBatch(rawRows: Record<string, unknown>[]): {
    valid: Array<{ row: number; data: ReturnType<typeof ToolImportRowSchema.parse>; isDuplicate: boolean; duplicateReason?: string }>;
    errors: Array<{ row: number; error_code: string; message: string; original_data: Record<string, unknown> }>;
    duplicateCount: number;
  } {
    const valid: Array<{ row: number; data: ReturnType<typeof ToolImportRowSchema.parse>; isDuplicate: boolean; duplicateReason?: string }> = [];
    const errors: Array<{ row: number; error_code: string; message: string; original_data: Record<string, unknown> }> = [];
    let duplicateCount = 0;

    // Existing indices for rapid deduplication
    const existingDomains = new Set(this.tools.map(t => t.normalized_domain));
    const existingNames = new Set(this.tools.map(t => t.name.toLowerCase().trim()));
    const existingSlugs = new Set(this.tools.map(t => t.slug));

    const seenInBatchDomains = new Set<string>();

    rawRows.forEach((raw, idx) => {
      const rowNumber = idx + 1;
      const parseResult = ToolImportRowSchema.safeParse(raw);

      if (!parseResult.success) {
        const firstErr = parseResult.error.issues[0];
        errors.push({
          row: rowNumber,
          error_code: firstErr.code,
          message: `${firstErr.path.join('.')}: ${firstErr.message}`,
          original_data: raw
        });
        return;
      }

      const data = parseResult.data;
      const domain = normalizeDomain(data.website_url);
      const nameKey = data.name.toLowerCase().trim();
      const slug = generateSlug(data.name);

      let isDuplicate = false;
      let duplicateReason: string | undefined;

      if (existingDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Domain '${domain}' already exists in directory`;
      } else if (existingNames.has(nameKey) || existingSlugs.has(slug)) {
        isDuplicate = true;
        duplicateReason = `Tool name or slug '${data.name}' already exists`;
      } else if (seenInBatchDomains.has(domain)) {
        isDuplicate = true;
        duplicateReason = `Duplicate domain '${domain}' encountered inside same import file`;
      }

      if (isDuplicate) {
        duplicateCount++;
      } else {
        seenInBatchDomains.add(domain);
      }

      valid.push({
        row: rowNumber,
        data,
        isDuplicate,
        duplicateReason
      });
    });

    return { valid, errors, duplicateCount };
  }

  public executeBatchImport(
    batchMeta: { filename: string; source_name: string; source_type: 'csv' | 'json' | 'api' | 'manual' },
    validRows: Array<{ row: number; data: ReturnType<typeof ToolImportRowSchema.parse>; isDuplicate: boolean }>,
    errors: Array<{ row: number; error_code: string; message: string; original_data: Record<string, unknown> }>,
    options: { skipDuplicates: boolean; defaultStatus: 'draft' | 'pending' } = { skipDuplicates: true, defaultStatus: 'draft' }
  ): ImportBatch {
    const batchId = 'batch-' + Date.now();
    let inserted = 0;
    let duplicateSkipped = 0;

    const newTools: Tool[] = [];

    validRows.forEach(item => {
      if (item.isDuplicate && options.skipDuplicates) {
        duplicateSkipped++;
        return;
      }

      const d = item.data;
      const domain = normalizeDomain(d.website_url);
      const slug = generateSlug(d.name) + (item.isDuplicate ? '-' + Math.random().toString(36).substring(2, 5) : '');

      // Resolve or create category
      let category = this.categories.find(
        c => c.name.toLowerCase() === d.category.toLowerCase() || c.slug === generateSlug(d.category)
      );
      if (!category) {
        category = this.addCategory({
          name: d.category,
          slug: generateSlug(d.category),
          description: `Tools categorized under ${d.category}`
        });
      }

      const tool: Tool = {
        id: 'tool-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: d.name,
        slug,
        website_url: d.website_url,
        normalized_domain: domain,
        short_description: d.short_description,
        full_description: d.full_description,
        logo_url: d.logo_url || '',
        pricing_type: d.pricing_type as PricingType,
        starting_price: d.starting_price ?? null,
        currency: d.currency,
        affiliate_url: d.affiliate_url,
        official_source_url: d.official_source_url || d.website_url,
        data_source: d.data_source || batchMeta.source_name,
        source_license: d.source_license,
        source_attribution: d.source_attribution,
        verification_status: 'unverified',
        publication_status: options.defaultStatus,
        featured: false,
        sponsored: false,
        upvotes: 0,
        views_count: 0,
        categories: [category],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      newTools.push(tool);
      inserted++;
    });

    this.tools.push(...newTools);
    this.saveTools();

    // Store batch report
    const batchRecord: ImportBatch = {
      id: batchId,
      filename: batchMeta.filename,
      source_name: batchMeta.source_name,
      source_type: batchMeta.source_type,
      total_rows: validRows.length + errors.length,
      valid_rows: validRows.length,
      inserted_rows: inserted,
      updated_rows: 0,
      duplicate_rows: duplicateSkipped,
      rejected_rows: errors.length,
      status: errors.length > 0 && inserted > 0 ? 'partial' : errors.length > 0 ? 'failed' : 'completed',
      error_summary: errors.length > 0 ? `${errors.length} validation errors encountered` : undefined,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };

    this.importBatches.unshift(batchRecord);

    // Save batch errors
    const batchErrors: ImportError[] = errors.map(e => ({
      id: 'err-' + Math.random().toString(36).substring(2, 9),
      batch_id: batchId,
      row_number: e.row,
      error_code: e.error_code,
      error_message: e.message,
      original_data: e.original_data,
      created_at: new Date().toISOString()
    }));
    this.importErrors.unshift(...batchErrors);
    this.saveBatches();

    this.logAuditAction('execute_import_batch', 'import_batch', batchId, {
      filename: batchMeta.filename,
      inserted,
      duplicates: duplicateSkipped,
      errors: errors.length
    });

    return batchRecord;
  }

  public async executeBatchImportAdmin(
    batchMeta: { filename: string; source_name: string; source_type: 'csv' | 'json' | 'api' | 'manual' },
    validRows: Array<{ row: number; data: ReturnType<typeof ToolImportRowSchema.parse>; isDuplicate: boolean }>,
    errors: Array<{ row: number; error_code: string; message: string; original_data: Record<string, unknown> }>,
    options: { skipDuplicates: boolean; defaultStatus: 'draft' | 'pending' } = { skipDuplicates: true, defaultStatus: 'draft' }
  ): Promise<ImportBatch> {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      try {
        const { data: batchData, error: batchErr } = await client
          .from('import_batches')
          .insert({
            filename: batchMeta.filename,
            source_name: batchMeta.source_name,
            source_type: batchMeta.source_type,
            total_rows: validRows.length + errors.length,
            valid_rows: validRows.length,
            inserted_rows: 0,
            updated_rows: 0,
            duplicate_rows: 0,
            rejected_rows: errors.length,
            status: 'processing'
          })
          .select()
          .single();

        if (batchErr) throw batchErr;
        const batchId = batchData.id;

        let inserted = 0;
        let duplicateSkipped = 0;
        const insertedToolIds: string[] = [];

        for (const item of validRows) {
          if (item.isDuplicate && options.skipDuplicates) {
            duplicateSkipped++;
            continue;
          }

          const d = item.data;
          const domain = normalizeDomain(d.website_url);
          const slug = generateSlug(d.name) + (item.isDuplicate ? '-' + Math.random().toString(36).substring(2, 5) : '');

          const { data: newTool, error: insertErr } = await client
            .from('tools')
            .insert({
              name: d.name,
              slug,
              website_url: d.website_url,
              normalized_domain: domain,
              short_description: d.short_description,
              full_description: d.full_description,
              logo_url: d.logo_url || null,
              pricing_type: d.pricing_type as any,
              starting_price: d.starting_price,
              currency: d.currency,
              affiliate_url: d.affiliate_url || null,
              official_source_url: d.official_source_url || d.website_url,
              data_source: d.data_source || batchMeta.source_name,
              source_license: d.source_license || null,
              source_attribution: d.source_attribution || null,
              verification_status: 'unverified',
              publication_status: options.defaultStatus,
              featured: false,
              sponsored: false
            })
            .select('id')
            .single();

          if (!insertErr && newTool) {
            inserted++;
            insertedToolIds.push(newTool.id);
            const cat = this.categories.find(c => c.name.toLowerCase() === d.category.toLowerCase() || c.slug === generateSlug(d.category));
            if (cat && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat.id)) {
              await client.from('tool_categories').insert({
                tool_id: newTool.id,
                category_id: cat.id,
                is_primary: true
              });
            }
          } else if (insertErr) {
            console.error(`Supabase insert failed for tool "${d.name}":`, insertErr);
            errors.push({
              row: item.row,
              error_code: insertErr.code || 'SUPABASE_INSERT_ERROR',
              message: insertErr.message || `Failed saving tool "${d.name}" to Supabase database`,
              original_data: { name: d.name, website_url: d.website_url, details: insertErr.message }
            });
          }
        }

        if (errors.length > 0) {
          const errPayload = errors.map(e => ({
            batch_id: batchId,
            row_number: e.row,
            error_code: e.error_code,
            error_message: e.message,
            original_data: e.original_data
          }));
          await client.from('import_errors').insert(errPayload);
        }

        const finalStatus = errors.length > 0 && inserted > 0 ? 'partial' : errors.length > 0 ? 'failed' : 'completed';
        const batchSummaryPayload = JSON.stringify({
          summary: errors.length > 0 ? `${errors.length} errors encountered during import` : 'Completed successfully',
          created_tool_ids: insertedToolIds,
          error_messages: errors.map(e => `${e.error_code}: ${e.message}`)
        });

        const { data: finalBatch } = await client
          .from('import_batches')
          .update({
            inserted_rows: inserted,
            duplicate_rows: duplicateSkipped,
            rejected_rows: errors.length,
            status: finalStatus,
            error_summary: batchSummaryPayload,
            completed_at: new Date().toISOString()
          })
          .eq('id', batchId)
          .select()
          .single();

        await this.logAuditActionRemote('execute_import_batch', 'import_batch', batchId, {
          filename: batchMeta.filename,
          inserted,
          duplicates: duplicateSkipped,
          errors: errors.length,
          created_tool_ids: insertedToolIds
        });

        // If all rows failed, throw explicit error so the UI does not report false success
        if (inserted === 0 && validRows.length > 0) {
          const firstErr = errors[0]?.message || 'Unknown database rejection';
          throw new Error(`All ${validRows.length} tools failed to save in Supabase: ${firstErr}`);
        }

        return finalBatch as ImportBatch;
      } catch (e: any) {
        console.error('Supabase bulk import failed:', e);
        // Requirement 1: Do NOT claim success if saving in Supabase fails
        throw new Error(`Supabase import failed: ${e.message || 'Database connection or permission error'}`);
      }
    }

    return this.executeBatchImport(batchMeta, validRows, errors, options);
  }

  /**
   * Safe Rollback of an Import Batch
   * Only deletes tools that are:
   * 1. Created by this batch.
   * 2. Still in draft/pending status (never published).
   * 3. Never verified (verification_status !== 'verified').
   * 4. Unmodified since creation (updated_at <= created_at + 5s).
   * Published or modified tools are strictly protected and left untouched.
   */
  public async rollbackBatchAdmin(batchId: string): Promise<{
    success: boolean;
    deletedCount: number;
    protectedCount: number;
    message: string;
  }> {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      try {
        const { data: batch, error: batchErr } = await client
          .from('import_batches')
          .select('*')
          .eq('id', batchId)
          .single();

        if (batchErr || !batch) {
          throw new Error('Batch record not found');
        }

        if (batch.status === 'rolled_back') {
          return {
            success: false,
            deletedCount: 0,
            protectedCount: 0,
            message: 'This batch has already been rolled back.'
          };
        }

        let toolIds: string[] = [];

        // Check error_summary JSON
        if (batch.error_summary) {
          try {
            const parsed = JSON.parse(batch.error_summary);
            if (Array.isArray(parsed.created_tool_ids)) {
              toolIds = parsed.created_tool_ids;
            }
          } catch {
            const match = batch.error_summary.match(/\[TOOL_IDS:([^\]]+)\]/);
            if (match && match[1]) {
              toolIds = match[1].split(',').filter(Boolean);
            }
          }
        }

        // Fallback: check audit_logs
        if (toolIds.length === 0) {
          const { data: logs } = await client
            .from('audit_logs')
            .select('metadata')
            .eq('action', 'execute_import_batch')
            .eq('entity_id', batchId)
            .limit(1);

          if (logs && logs[0] && logs[0].metadata && Array.isArray((logs[0].metadata as any).created_tool_ids)) {
            toolIds = (logs[0].metadata as any).created_tool_ids;
          }
        }

        // Fallback: check by source_name and creation timeframe
        if (toolIds.length === 0 && batch.source_name) {
          const startTime = new Date(new Date(batch.created_at).getTime() - 15000).toISOString();
          const endTime = batch.completed_at
            ? new Date(new Date(batch.completed_at).getTime() + 15000).toISOString()
            : new Date(new Date(batch.created_at).getTime() + 120000).toISOString();

          const { data: matchedTools } = await client
            .from('tools')
            .select('id')
            .eq('data_source', batch.source_name)
            .gte('created_at', startTime)
            .lte('created_at', endTime);

          if (matchedTools) {
            toolIds = matchedTools.map((t: any) => t.id);
          }
        }

        if (toolIds.length === 0) {
          return {
            success: false,
            deletedCount: 0,
            protectedCount: 0,
            message: 'No tool records associated with this batch were found to roll back.'
          };
        }

        // Fetch current status of candidate tools
        const { data: candidateTools, error: toolFetchErr } = await client
          .from('tools')
          .select('id, name, publication_status, verification_status, created_at, updated_at')
          .in('id', toolIds);

        if (toolFetchErr) throw toolFetchErr;

        let deletedCount = 0;
        let protectedCount = 0;
        const toolsToDelete: string[] = [];

        for (const t of (candidateTools || [])) {
          const isPublished = t.publication_status === 'published';
          const isVerified = t.verification_status === 'verified';
          const wasModified = t.updated_at && t.created_at && (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() > 5000);

          if (isPublished || isVerified || wasModified) {
            protectedCount++;
          } else {
            toolsToDelete.push(t.id);
          }
        }

        if (toolsToDelete.length > 0) {
          const { error: delErr } = await client
            .from('tools')
            .delete()
            .in('id', toolsToDelete);

          if (delErr) throw delErr;
          deletedCount = toolsToDelete.length;

          this.tools = this.tools.filter(t => !toolsToDelete.includes(t.id));
          this.saveTools();
        }

        // Mark batch as rolled_back
        await client
          .from('import_batches')
          .update({
            status: 'rolled_back',
            error_summary: `Rolled back on ${new Date().toISOString()}. ${deletedCount} unedited tools removed, ${protectedCount} tools protected (published or modified).`
          })
          .eq('id', batchId);

        await this.logAuditActionRemote('rollback_import_batch', 'import_batch', batchId, {
          deleted_count: deletedCount,
          protected_count: protectedCount,
          total_batch_tools: toolIds.length
        });

        return {
          success: true,
          deletedCount,
          protectedCount,
          message: `Batch rolled back successfully: ${deletedCount} unedited draft tool${deletedCount === 1 ? '' : 's'} removed. ${protectedCount} tool${protectedCount === 1 ? ' was' : 's were'} protected (already published or edited).`
        };
      } catch (err: any) {
        console.error('Failed to rollback batch:', err);
        return {
          success: false,
          deletedCount: 0,
          protectedCount: 0,
          message: `Rollback failed: ${err.message}`
        };
      }
    }

    // Local in-memory fallback
    const batch = this.importBatches.find(b => b.id === batchId);
    if (!batch) return { success: false, deletedCount: 0, protectedCount: 0, message: 'Batch not found' };
    if (batch.status === 'rolled_back') return { success: false, deletedCount: 0, protectedCount: 0, message: 'Batch already rolled back' };

    let toolIds: string[] = [];
    if (batch.error_summary) {
      try {
        const parsed = JSON.parse(batch.error_summary);
        if (Array.isArray(parsed.created_tool_ids)) toolIds = parsed.created_tool_ids;
      } catch {}
    }

    let deleted = 0;
    let protectedCount = 0;
    this.tools = this.tools.filter(t => {
      if (toolIds.includes(t.id)) {
        if (t.publication_status === 'published' || t.verification_status === 'verified') {
          protectedCount++;
          return true;
        }
        deleted++;
        return false;
      }
      return true;
    });

    batch.status = 'rolled_back';
    this.saveTools();
    this.saveBatches();

    return {
      success: true,
      deletedCount: deleted,
      protectedCount,
      message: `Batch rolled back: ${deleted} tools removed, ${protectedCount} tools protected.`
    };
  }

  public getImportBatches(): ImportBatch[] {
    return [...this.importBatches];
  }

  public getImportErrors(batchId: string): ImportError[] {
    return this.importErrors.filter(e => e.batch_id === batchId);
  }

  /**
   * Fetch rejected rows/errors for a batch from public.import_errors via Supabase RLS
   * with fallback to local storage
   */
  public async fetchAdminImportErrors(batchId: string): Promise<ImportError[]> {
    const client = getSupabase();
    if (client && isSupabaseConfigured()) {
      try {
        const { data, error } = await client
          .from('import_errors')
          .select('*')
          .eq('batch_id', batchId)
          .order('row_number', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          return data as ImportError[];
        }
      } catch (err) {
        console.warn('Failed to fetch import errors from Supabase, falling back to local:', err);
      }
    }
    return this.getImportErrors(batchId);
  }

  // Bookmarking & Compare features
  public getBookmarks(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public toggleBookmark(toolId: string): boolean {
    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(toolId);
    let isBookmarked = false;
    if (index !== -1) {
      bookmarks.splice(index, 1);
      isBookmarked = false;
    } else {
      bookmarks.push(toolId);
      isBookmarked = true;
    }
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
    return isBookmarked;
  }

  public getCompareList(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COMPARE_LIST);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addToCompare(toolId: string): string[] {
    const list = this.getCompareList();
    if (!list.includes(toolId) && list.length < 4) {
      list.push(toolId);
      localStorage.setItem(STORAGE_KEYS.COMPARE_LIST, JSON.stringify(list));
    }
    return list;
  }

  public removeFromCompare(toolId: string): string[] {
    let list = this.getCompareList();
    list = list.filter(id => id !== toolId);
    localStorage.setItem(STORAGE_KEYS.COMPARE_LIST, JSON.stringify(list));
    return list;
  }

  public clearCompare(): void {
    localStorage.removeItem(STORAGE_KEYS.COMPARE_LIST);
  }
}

export const directoryStorage = new DirectoryStorageService();
