import {
  Tool,
  Category,
  Submission,
  AuditLog,
  ImportBatch,
  ImportError,
  DirectoryFilters,
  PricingType
} from '../types/database';
import { INITIAL_CATEGORIES, INITIAL_TOOLS } from '../data/initialData';
import { normalizeDomain, generateSlug, ToolImportRowSchema } from '../lib/validation';

const STORAGE_KEYS = {
  TOOLS: 'ai_dir_tools_v1',
  CATEGORIES: 'ai_dir_categories_v1',
  SUBMISSIONS: 'ai_dir_submissions_v1',
  AUDIT_LOGS: 'ai_dir_audit_logs_v1',
  IMPORT_BATCHES: 'ai_dir_import_batches_v1',
  IMPORT_ERRORS: 'ai_dir_import_errors_v1',
  BOOKMARKS: 'ai_dir_bookmarks_v1',
  COMPARE_LIST: 'ai_dir_compare_v1'
};

class DirectoryStorageService {
  private tools: Tool[] = [];
  private categories: Category[] = [];
  private submissions: Submission[] = [];
  private auditLogs: AuditLog[] = [];
  private importBatches: ImportBatch[] = [];
  private importErrors: ImportError[] = [];

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

  // Categories
  public getCategories(): Category[] {
    // augment with tool counts
    return this.categories.map(cat => ({
      ...cat,
      tool_count: this.tools.filter(t => 
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
    let result = this.tools.filter(t => t.publication_status === 'published');

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
        result.sort((a, b) => a.starting_price - b.starting_price);
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
    return this.tools.find(t => t.slug === slug);
  }

  public getToolById(id: string): Tool | undefined {
    return this.tools.find(t => t.id === id);
  }

  public getRelatedTools(tool: Tool, limit = 4): Tool[] {
    const categorySlugs = new Set(tool.categories.map(c => c.slug));
    return this.tools
      .filter(t => t.id !== tool.id && t.publication_status === 'published')
      .filter(t => t.categories.some(c => categorySlugs.has(c.slug)))
      .slice(0, limit);
  }

  public recordToolView(toolId: string) {
    const tool = this.tools.find(t => t.id === toolId);
    if (tool) {
      tool.views_count = (tool.views_count || 0) + 1;
      this.saveTools();
    }
  }

  public toggleUpvote(toolId: string): number {
    const tool = this.tools.find(t => t.id === toolId);
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
      return tool.upvotes;
    }
    return 0;
  }

  // Admin Tools Management
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
      // Create pending draft tool
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
    batchMeta: { filename: string; source_name: string; source_type: 'csv' | 'json' },
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
        starting_price: d.starting_price,
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

  public getImportBatches(): ImportBatch[] {
    return [...this.importBatches];
  }

  public getImportErrors(batchId: string): ImportError[] {
    return this.importErrors.filter(e => e.batch_id === batchId);
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
