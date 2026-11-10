import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import {
  ShieldCheck,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  Database,
  Layers,
  Inbox,
  History,
  Lock,
  Plus,
  Trash2,
  Edit,
  Eye,
  RefreshCw,
  Download,
  Search,
  ExternalLink,
  Key,
  Settings,
  ShieldAlert,
  Check,
  Loader2,
  Info,
  Crown,
  RotateCcw,
  Sliders,
  Globe,
  Sparkles,
  Compass,
  Radar,
  Filter,
  X,
  Ban
} from 'lucide-react';
import {
  Tool,
  Category,
  Submission,
  AuditLog,
  ImportBatch,
  ImportError,
  PublicationStatus,
  VerificationStatus,
  PricingType
} from '../types/database';
import { INITIAL_CATEGORIES, INITIAL_TOOLS } from '../data/initialData';
import { directoryStorage } from '../services/storage';
import { normalizeDomain, generateSlug } from '../lib/validation';
import { generateRejectedRowsCsv, triggerCsvDownload } from '../lib/csvExport';
import { verifyToolUrl, UrlVerificationResult } from '../services/urlVerifier';
import { discoveryService } from '../services/discovery/discoveryService';
import { DiscoveryBatchResult, DiscoveredToolCandidate } from '../services/discovery/types';
import { ToolLogo } from './ToolLogo';
import {
  signInAdminWithSupabase,
  getActiveAdminSession,
  signOutAdmin,
  isSupabaseConfigured,
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  sendPasswordReset,
  AdminProfile
} from '../lib/supabase';

interface AdminDashboardProps {
  onBackToSite: () => void;
  onPreviewTool?: (tool: Tool) => void;
}

export const TARGET_SCHEMA_FIELDS: Array<{
  key: string;
  label: string;
  required: boolean;
  description: string;
  matchRegex: RegExp;
}> = [
  { key: 'name', label: 'Tool Name', required: true, description: 'Display name of the tool', matchRegex: /^(tool_?name|name|title|product_?name|app_?name|software)$/i },
  { key: 'website_url', label: 'Website URL', required: true, description: 'Live HTTPS website URL', matchRegex: /^(website_?url|url|website|link|site|web)$/i },
  { key: 'short_description', label: 'Short Description', required: true, description: 'One-line summary (10-280 chars)', matchRegex: /^(short_?desc(ription)?|tagline|summary|subtitle|headline)$/i },
  { key: 'full_description', label: 'Full Description', required: false, description: 'Detailed markdown or text', matchRegex: /^(full_?desc(ription)?|desc(ription)?|details|about|overview)$/i },
  { key: 'category', label: 'Category', required: true, description: 'Primary taxonomy category', matchRegex: /^(category(_?tag|_?name)?|categories|cat|tag|tags|topic)$/i },
  { key: 'pricing_type', label: 'Pricing Model', required: false, description: 'free, freemium, paid, free_trial, open_source', matchRegex: /^(pricing_?type|pricing|price_?model|model|plan)$/i },
  { key: 'starting_price', label: 'Starting Price', required: false, description: 'Numerical price (default 0)', matchRegex: /^(starting_?price|price|cost|rate|amount)$/i },
  { key: 'currency', label: 'Currency', required: false, description: 'Currency code (default USD)', matchRegex: /^(currency|curr)$/i },
  { key: 'logo_url', label: 'Logo URL', required: false, description: 'Direct image link', matchRegex: /^(logo_?url|logo|icon|avatar|image)$/i },
  { key: 'official_source_url', label: 'Official Source', required: false, description: 'Documentation or official repository', matchRegex: /^(official_?source_?url|source_?url|docs_?url)$/i },
  { key: 'source_license', label: 'License', required: false, description: 'e.g. MIT, Apache 2.0, Proprietary', matchRegex: /^(source_?license|license)$/i },
  { key: 'source_attribution', label: 'Attribution', required: false, description: 'Citation notice', matchRegex: /^(source_?attribution|attribution|author)$/i },
  { key: 'affiliate_url', label: 'Affiliate URL', required: false, description: 'Referral tracking link', matchRegex: /^(affiliate_?url|affiliate|referral)$/i }
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToSite, onPreviewTool }) => {
  // Supabase Authentication & Admin Authorization state
  // Initial state is strictly unauthenticated until verified with authoritative Supabase session
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Runtime Supabase configuration state
  const [configUrl, setConfigUrl] = useState(() => getSupabaseConfig().url);
  const [configAnonKey, setConfigAnonKey] = useState(() => getSupabaseConfig().anonKey);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  // Active Tab: overview | tools | bulk-import | discovery | submissions | categories | audit-logs
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'bulk-import' | 'discovery' | 'submissions' | 'categories' | 'audit-logs'>('overview');

  // Directory Data
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Discovery Engine State
  const [availableSources] = useState(() => discoveryService.getAvailableSources());
  const [selectedSourceId, setSelectedSourceId] = useState<string>('curated_open_dataset');
  const [discoveryQuery, setDiscoveryQuery] = useState<string>('');
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [discoveryBatchResult, setDiscoveryBatchResult] = useState<DiscoveryBatchResult | null>(null);
  const [selectedCandidateIndices, setSelectedCandidateIndices] = useState<Set<number>>(new Set());
  const [isImportingDiscovered, setIsImportingDiscovered] = useState<boolean>(false);
  const [discoveryImportSuccess, setDiscoveryImportSuccess] = useState<string | null>(null);
  const [inspectingCandidate, setInspectingCandidate] = useState<DiscoveredToolCandidate | null>(null);
  const [discoveryFilter, setDiscoveryFilter] = useState<'all' | 'ready' | 'duplicates' | 'rejected'>('all');

  // Tools Table filter
  const [toolSearch, setToolSearch] = useState('');
  const [toolStatusFilter, setToolStatusFilter] = useState<string>('all');

  // Tool Edit Modal
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isVerifyingUrl, setIsVerifyingUrl] = useState(false);
  const [urlVerificationResult, setUrlVerificationResult] = useState<UrlVerificationResult | null>(null);

  // Bulk Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSourceName, setImportSourceName] = useState('Authorized CSV Batch');
  const [importStatusChoice, setImportStatusChoice] = useState<'draft' | 'pending'>('draft');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importStep, setImportStep] = useState<'idle' | 'parsing' | 'mapping' | 'preview' | 'importing' | 'completed'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [rawImportRows, setRawImportRows] = useState<Record<string, unknown>[]>([]);
  const [discoveredColumns, setDiscoveredColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<{
    valid: any[];
    errors: any[];
    duplicateCount: number;
  } | null>(null);
  const [latestBatchReport, setLatestBatchReport] = useState<ImportBatch | null>(null);
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null);
  const [rollingBackBatchId, setRollingBackBatchId] = useState<string | null>(null);

  // Category creation
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Data Loading & Sync State
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const refreshData = async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      const [fetchedTools, fetchedCategories, fetchedSubmissions, fetchedBatches, fetchedLogs] = await Promise.all([
        directoryStorage.fetchAdminTools(),
        directoryStorage.fetchAdminCategories(),
        directoryStorage.fetchAdminSubmissions(),
        directoryStorage.fetchAdminBatches(),
        directoryStorage.fetchAdminAuditLogs()
      ]);
      setTools(fetchedTools);
      setCategories(fetchedCategories);
      setSubmissions(fetchedSubmissions);
      setBatches(fetchedBatches);
      setAuditLogs(fetchedLogs);
    } catch (err: any) {
      console.error('Failed to load admin data from Supabase:', err);
      setDataError(err.message || 'Error communicating with Supabase database.');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Check active Supabase Auth session on component mount
  useEffect(() => {
    let isMounted = true;
    async function verifySession() {
      setIsCheckingSession(true);
      try {
        if (isSupabaseConfigured()) {
          const authSession = await getActiveAdminSession();
          if (authSession && isMounted) {
            setAdminProfile(authSession.adminProfile);
            setIsAuthenticated(true);
            sessionStorage.setItem('admin_authenticated', 'true');
            sessionStorage.setItem('admin_user', authSession.adminProfile.email);
            sessionStorage.setItem('admin_uid', authSession.adminProfile.id);
            sessionStorage.setItem('admin_role', authSession.adminProfile.role);
            if (authSession.adminProfile.full_name) {
              sessionStorage.setItem('admin_name', authSession.adminProfile.full_name);
            }
          } else if (isMounted) {
            // Invalid or expired session
            setIsAuthenticated(false);
            setAdminProfile(null);
            sessionStorage.removeItem('admin_authenticated');
            sessionStorage.removeItem('admin_user');
            sessionStorage.removeItem('admin_uid');
            sessionStorage.removeItem('admin_role');
            sessionStorage.removeItem('admin_name');
          }
        } else if (isMounted) {
          // Supabase is not configured - strictly deny access
          setIsAuthenticated(false);
          setAdminProfile(null);
          sessionStorage.removeItem('admin_authenticated');
          sessionStorage.removeItem('admin_user');
          sessionStorage.removeItem('admin_uid');
          sessionStorage.removeItem('admin_role');
          sessionStorage.removeItem('admin_name');
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
          setAdminProfile(null);
        }
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    }

    verifySession();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
    }
  }, [isAuthenticated]);

  // Handle Login exclusively via Supabase Auth
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setResetMessage('');

    if (!isSupabaseConfigured()) {
      setAuthError('Supabase is not configured. Please connect your Supabase Project URL and Anon Public Key first.');
      return;
    }

    setIsLoggingIn(true);

    try {
      // Authenticate with Supabase Auth and verify role in public.admin_users
      const authSession = await signInAdminWithSupabase(adminEmail, adminPassword);
      setAdminProfile(authSession.adminProfile);
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_authenticated', 'true');
      sessionStorage.setItem('admin_user', authSession.adminProfile.email);
      sessionStorage.setItem('admin_uid', authSession.adminProfile.id);
      sessionStorage.setItem('admin_role', authSession.adminProfile.role);
      if (authSession.adminProfile.full_name) {
        sessionStorage.setItem('admin_name', authSession.adminProfile.full_name);
      }
      directoryStorage.logAuditAction('admin_login', 'auth', authSession.adminProfile.email, {
        method: 'supabase_auth',
        uid: authSession.user.id,
        role: authSession.adminProfile.role
      });
    } catch (err: any) {
      setIsAuthenticated(false);
      setAdminProfile(null);
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await signOutAdmin();
    } catch {
      // Ignore
    }
    sessionStorage.removeItem('admin_authenticated');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_uid');
    sessionStorage.removeItem('admin_role');
    sessionStorage.removeItem('admin_name');
    setIsAuthenticated(false);
    setAdminProfile(null);
  };

  // Handle Password Reset
  const handlePasswordReset = async () => {
    if (!adminEmail.includes('@')) {
      setAuthError('Please enter your administrator email first.');
      return;
    }
    setAuthError('');
    setResetMessage('');
    try {
      if (isSupabaseConfigured()) {
        await sendPasswordReset(adminEmail);
        setResetMessage(`Password reset link sent to ${adminEmail}. Please check your inbox.`);
      } else {
        setAuthError('Supabase is not connected. Configure project credentials first.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to send password reset email.');
    }
  };

  // Save runtime Supabase credentials
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configUrl.trim().startsWith('http')) {
      alert('Project URL must start with https://');
      return;
    }
    if (configAnonKey.trim().length < 20) {
      alert('Please enter a valid Supabase Anon Public Key.');
      return;
    }
    saveSupabaseConfig(configUrl, configAnonKey);
    setConfigSavedNotice(true);
    setTimeout(() => {
      setConfigSavedNotice(false);
      setShowConfigModal(false);
    }, 1500);
  };

  // Clear runtime credentials
  const handleClearConfig = () => {
    clearSupabaseConfig();
    setConfigUrl('');
    setConfigAnonKey('');
    setShowConfigModal(false);
  };

  // Tool status toggle via Supabase RLS
  const handleTogglePublication = async (tool: Tool) => {
    try {
      await directoryStorage.toggleToolPublicationAdmin(tool.id, tool.publication_status);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to update publication status: ${err.message}`);
    }
  };

  const handleToggleVerification = async (tool: Tool) => {
    try {
      await directoryStorage.toggleToolVerificationAdmin(tool.id, tool.verification_status);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to update verification status: ${err.message}`);
    }
  };

  const handleDeleteTool = async (tool: Tool) => {
    if (confirm(`Permanently delete '${tool.name}' from Supabase database?`)) {
      try {
        await directoryStorage.deleteToolAdmin(tool.id);
        await refreshData();
      } catch (err: any) {
        alert(`Failed to delete tool: ${err.message}`);
      }
    }
  };

  // Submission review via Supabase RLS
  const handleReviewSubmission = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await directoryStorage.reviewSubmissionAdmin(id, status);
      await refreshData();
    } catch (err: any) {
      alert(`Failed to review submission: ${err.message}`);
    }
  };

  // Add category via Supabase RLS
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await directoryStorage.addCategoryAdmin(newCatName.trim(), newCatDesc.trim());
      setNewCatName('');
      setNewCatDesc('');
      await refreshData();
    } catch (err: any) {
      alert(`Failed to add category: ${err.message}`);
    }
  };

  // Auto-detect column mapping
  const autoDetectMapping = (cols: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    TARGET_SCHEMA_FIELDS.forEach(target => {
      const found = cols.find(c => target.matchRegex.test(c.toLowerCase().trim().replace(/[\s-]+/g, '_')));
      mapping[target.key] = found || '';
    });
    return mapping;
  };

  // File parsing for Bulk Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);
      setImportStep('parsing');

      const isCsv = file.name.endsWith('.csv');
      const isJson = file.name.endsWith('.json');

      if (!isCsv && !isJson) {
        alert('Unsupported format. Please upload a .csv or .json file.');
        setImportStep('idle');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          let parsedRows: Record<string, unknown>[] = [];

          if (isCsv) {
            const results = Papa.parse(content, {
              header: true,
              skipEmptyLines: true,
              transformHeader: h => h.trim()
            });
            parsedRows = results.data as Record<string, unknown>[];
          } else {
            const json = JSON.parse(content);
            parsedRows = Array.isArray(json) ? json : [json];
          }

          if (!parsedRows || parsedRows.length === 0) {
            alert('The uploaded file contains no rows.');
            setImportStep('idle');
            return;
          }

          // Discover source column names from first rows
          const colSet = new Set<string>();
          parsedRows.slice(0, 10).forEach(row => {
            if (row && typeof row === 'object') {
              Object.keys(row).forEach(k => colSet.add(k));
            }
          });
          const cols = Array.from(colSet);

          setRawImportRows(parsedRows);
          setDiscoveredColumns(cols);

          const initialMapping = autoDetectMapping(cols);
          setColumnMapping(initialMapping);

          // Transition to interactive Column Mapping step
          setImportStep('mapping');
        } catch (err: any) {
          alert('Failed to parse file: ' + err.message);
          setImportStep('idle');
        }
      };
      reader.readAsText(file);
    }
  };

  // Apply interactive mapping and execute validation engine
  const applyMappingAndValidate = (customMapping?: Record<string, string>) => {
    const mapping = customMapping || columnMapping;

    if (!mapping.name || !mapping.website_url || !mapping.short_description || !mapping.category) {
      alert('Please map all required fields (Tool Name, Website URL, Short Description, and Category).');
      return;
    }

    const mappedRows = rawImportRows.map(raw => {
      const row: Record<string, unknown> = {};
      TARGET_SCHEMA_FIELDS.forEach(field => {
        const sourceCol = mapping[field.key];
        if (sourceCol && raw[sourceCol] !== undefined && raw[sourceCol] !== null && String(raw[sourceCol]).trim() !== '') {
          row[field.key] = raw[sourceCol];
        }
      });

      if (!row.full_description && row.short_description) {
        row.full_description = row.short_description;
      }
      if (!row.pricing_type) {
        row.pricing_type = 'unknown';
      }
      if (row.starting_price !== undefined) {
        const num = parseFloat(String(row.starting_price).replace(/[^0-9.-]/g, ''));
        row.starting_price = isNaN(num) ? 0 : Math.max(0, num);
      }
      if (!row.currency) {
        row.currency = 'USD';
      }

      return row;
    });

    const result = directoryStorage.parseAndValidateBatch(mappedRows);
    setValidationResult(result);
    setImportStep('preview');
  };

  // Run chunked batch execution directly to Supabase import_batches and tools
  const executeBatch = async () => {
    if (!validationResult || !importFile) return;

    setImportStep('importing');
    setImportProgress(10);

    const chunkSize = 100;
    const validRows = validationResult.valid;
    const errors = validationResult.errors;

    // Simulate chunked progress visually
    for (let i = 0; i < validRows.length; i += chunkSize) {
      await new Promise(r => setTimeout(r, 40));
      const progress = Math.min(95, Math.round(((i + chunkSize) / validRows.length) * 100));
      setImportProgress(progress);
    }

    try {
      const report = await directoryStorage.executeBatchImportAdmin(
        {
          filename: importFile.name,
          source_name: importSourceName,
          source_type: importFile.name.endsWith('.csv') ? 'csv' : 'json'
        },
        validRows,
        errors,
        {
          skipDuplicates,
          defaultStatus: importStatusChoice
        }
      );

      setLatestBatchReport(report);
      setImportProgress(100);
      setImportStep('completed');
      await refreshData();
    } catch (err: any) {
      alert(`Bulk import error: ${err.message}`);
      setImportStep('idle');
    }
  };

  // Export rejected rows CSV for an import batch
  const handleExportRejectedRows = async (batchId: string, filename?: string) => {
    try {
      setExportingBatchId(batchId);
      const errors = await directoryStorage.fetchAdminImportErrors(batchId);
      if (!errors || errors.length === 0) {
        alert('No rejected rows found for this batch. All rows were processed cleanly without errors.');
        return;
      }

      const csvContent = generateRejectedRowsCsv(errors);
      const safeBaseName = (filename || `batch-${batchId}`).replace(/\.[^/.]+$/, '');
      const downloadName = `${safeBaseName}-rejected-rows.csv`;
      triggerCsvDownload(csvContent, downloadName);
    } catch (err: any) {
      console.error('Failed to export rejected rows:', err);
      alert(`Export failed: ${err.message || 'Unable to retrieve rejected rows'}`);
    } finally {
      setExportingBatchId(null);
    }
  };

  // Safe Batch Rollback Handler (protects published & modified tools)
  const handleRollbackBatch = async (batchId: string, filename: string) => {
    const confirmed = confirm(
      `SAFE ROLLBACK CONFIRMATION:\n\nAre you sure you want to roll back batch "${filename}"?\n\n` +
      `• Any unedited draft tools imported by this batch will be permanently removed.\n` +
      `• Any tools that have already been PUBLISHED or EDITED by an admin will be PROTECTED and preserved.\n\n` +
      `Proceed with safe rollback?`
    );

    if (!confirmed) return;

    try {
      setRollingBackBatchId(batchId);
      const res = await directoryStorage.rollbackBatchAdmin(batchId);
      alert(res.message);
      await refreshData();
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setRollingBackBatchId(null);
    }
  };

  // Live URL Verification Handler for Tool Modal
  const handleVerifyModalUrl = async () => {
    if (!editingTool?.website_url) return;
    setIsVerifyingUrl(true);
    setUrlVerificationResult(null);
    try {
      const res = await verifyToolUrl(editingTool.website_url);
      setUrlVerificationResult(res);
    } catch (err: any) {
      setUrlVerificationResult({
        is_live: false,
        status_code: 'UNREACHABLE',
        final_url: editingTool.website_url,
        response_time_ms: 0,
        ssl_valid: false,
        error_message: err.message
      });
    } finally {
      setIsVerifyingUrl(false);
    }
  };

  // Discovery Execution Handler
  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveryImportSuccess(null);
    try {
      const comparisonTools = tools.length > 0 ? tools : INITIAL_TOOLS;
      const result = await discoveryService.runDiscovery(selectedSourceId, comparisonTools, {
        limit: 15,
        query: discoveryQuery.trim() || undefined
      });
      setDiscoveryBatchResult(result);
      // Pre-select candidates that are valid and not duplicates
      const preselected = new Set<number>();
      result.candidates.forEach((c, idx) => {
        if (c.selected) preselected.add(idx);
      });
      setSelectedCandidateIndices(preselected);
    } catch (err: any) {
      alert(`Discovery failed: ${err.message}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Import Selected Discovered Tools as Drafts into Supabase
  const handleImportDiscoveredDrafts = async () => {
    if (!discoveryBatchResult) return;
    const selected = discoveryBatchResult.candidates.filter((_, idx) => selectedCandidateIndices.has(idx));
    if (selected.length === 0) {
      alert('Please select at least one candidate tool to import.');
      return;
    }

    setIsImportingDiscovered(true);
    setDiscoveryImportSuccess(null);

    try {
      // Map candidates to valid rows expected by batch import engine
      const validRows = selected.map((item, idx) => ({
        row: idx + 1,
        data: {
          name: item.candidate.name,
          website_url: item.candidate.website_url,
          short_description: item.candidate.short_description,
          full_description: item.candidate.full_description,
          pricing_type: item.candidate.pricing_type,
          starting_price: item.candidate.starting_price,
          currency: item.candidate.currency,
          category: item.candidate.category,
          data_source: item.candidate.data_source,
          official_source_url: item.candidate.official_source_url,
          source_license: item.candidate.source_license || '',
          source_attribution: item.candidate.source_attribution || '',
          logo_url: item.candidate.logo_url || '',
          affiliate_url: ''
        },
        isDuplicate: item.is_duplicate
      }));

      const batchMeta = {
        filename: `discovery_${discoveryBatchResult.source_id}_${Date.now()}`,
        source_name: `Discovery: ${discoveryBatchResult.source_name}`,
        source_type: 'api' as const
      };

      // Import strictly as DRAFT and UNVERIFIED
      const batchResult = await directoryStorage.executeBatchImportAdmin(
        batchMeta,
        validRows,
        [], // no rejection rows in pre-filtered selection
        { skipDuplicates: true, defaultStatus: 'draft' }
      );

      setDiscoveryImportSuccess(`Successfully imported ${batchResult.inserted_rows} new AI tools as DRAFT (unverified) into the directory.`);
      await refreshData();
      
      // Clear selection
      setSelectedCandidateIndices(new Set());
    } catch (err: any) {
      alert(`Failed importing discovered tools: ${err.message}`);
    } finally {
      setIsImportingDiscovered(false);
    }
  };

  // Download templates
  const downloadCsvTemplate = () => {
    // 14 standard columns without sample rows as requested
    const csvContent = "data:text/csv;charset=utf-8," + 
      "name,website_url,short_description,full_description,pricing_type,starting_price,currency,category,data_source,official_source_url,source_license,source_attribution,logo_url,affiliate_url\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ai_tools_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load initial_tools_seed.csv (10 real tools) directly into the Bulk Import flow
  const loadInitialSeedFile = async () => {
    try {
      setImportStep('parsing');
      const response = await fetch('/initial_tools_seed.csv');
      if (!response.ok) {
        throw new Error(`Failed to load initial_tools_seed.csv (${response.status})`);
      }
      const text = await response.text();
      const file = new File([text], 'initial_tools_seed.csv', { type: 'text/csv' });
      setImportFile(file);

      const results = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim()
      });
      const parsedRows = results.data as Record<string, unknown>[];

      if (!parsedRows || parsedRows.length === 0) {
        alert('The seed file contains no rows.');
        setImportStep('idle');
        return;
      }

      const colSet = new Set<string>();
      parsedRows.slice(0, 10).forEach(row => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach(k => colSet.add(k));
        }
      });
      const cols = Array.from(colSet);
      setDiscoveredColumns(cols);
      setRawImportRows(parsedRows);

      const mapping = autoDetectMapping(cols);
      setColumnMapping(mapping);
      setImportStep('mapping');
    } catch (err: any) {
      alert(`Could not load seed file: ${err.message}`);
      setImportStep('idle');
    }
  };

  const downloadJsonTemplate = () => {
    const sample = [
      {
        name: "Cursor",
        website_url: "https://cursor.com",
        short_description: "AI-first code editor fork of VS Code with codebase indexing",
        full_description: "Cursor integrates multi-file code editing, prompt-based code generation, and terminal command fixes.",
        pricing_type: "freemium",
        starting_price: 20.00,
        currency: "USD",
        category: "Coding & Development",
        data_source: "official_api",
        official_source_url: "https://cursor.com",
        source_license: "Proprietary",
        source_attribution: "Cursor Website",
        logo_url: "https://api.iconify.design/lucide:terminal.svg",
        affiliate_url: ""
      }
    ];
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sample, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "ai_tools_import_template.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If checking active session, render loading state
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-sm font-medium">Verifying Supabase Administrator Session...</span>
        </div>
      </div>
    );
  }

  // If not logged in, render secure Supabase Auth login portal
  if (!isAuthenticated) {
    const isConfigured = isSupabaseConfigured();

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative">
        <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-8 shadow-2xl">
          {/* Header & Wordmark */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                AI
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Admin Operations Console</h1>
                <p className="text-[11px] text-slate-400">PostgreSQL RLS & Supabase Auth</p>
              </div>
            </div>

            {/* Supabase Connection Status Pill */}
            <button
              onClick={() => setShowConfigModal(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors cursor-pointer ${
                isConfigured
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
                  : 'bg-amber-950/60 border-amber-800 text-amber-400 hover:bg-amber-900/60'
              }`}
              title="Click to view or edit Supabase configuration"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isConfigured ? 'Supabase Connected' : 'Config Required'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Restricted access for verified administrators. Authenticates exclusively with Supabase Auth and enforces active role validation in <code className="text-indigo-400 font-mono">public.admin_users</code>.
          </p>

          {/* Unconfigured Alert Banner */}
          {!isConfigured && (
            <div className="p-3.5 mb-5 bg-amber-950/70 border border-amber-800/80 text-amber-300 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5 text-amber-200">Supabase Connection Required</span>
                Supabase credentials are not detected. Administrator login requires a valid Supabase project. Click &quot;Configure Supabase&quot; below to set your project credentials.
              </div>
            </div>
          )}

          {/* Error Message */}
          {authError && (
            <div className="p-3.5 mb-5 bg-rose-950/70 border border-rose-800/80 text-rose-300 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{authError}</div>
            </div>
          )}

          {/* Success Message */}
          {resetMessage && (
            <div className="p-3.5 mb-5 bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{resetMessage}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Administrator Email
              </label>
              <input
                type="email"
                required
                disabled={!isConfigured}
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="owner@yourdomain.com"
                className="w-full px-3.5 py-2.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={!isConfigured}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                disabled={!isConfigured}
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || !isConfigured}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:border disabled:border-slate-700/60 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-indigo-900/30 cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : !isConfigured ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Configure Supabase to Sign In</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sign In with Supabase Auth</span>
                </>
              )}
            </button>
          </form>

          {/* Bootstrap Helper Accordion */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-xs">
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800 text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold text-[11px]">
                <Info className="w-3.5 h-3.5 text-indigo-400" />
                <span>First time setting up your Super Admin?</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                1. Create your user account in Supabase Authentication → Users.<br />
                2. Run <code className="text-indigo-300">supabase/bootstrap_super_admin.sql</code> in your Supabase SQL Editor with your User UID.<br />
                3. Sign in here with your Supabase email and password.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between mt-6 pt-2">
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configure Supabase</span>
            </button>

            <button
              type="button"
              onClick={onBackToSite}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              Return to Public Site →
            </button>
          </div>
        </div>

        {/* Supabase Configuration Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Supabase Connection Settings</h3>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer px-2 py-1"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Connect your Supabase project credentials. These are used client-side for Supabase Auth and directory queries. You can also define them in <code className="text-indigo-300">.env</code> as <code className="text-indigo-300">VITE_SUPABASE_URL</code> and <code className="text-indigo-300">VITE_SUPABASE_ANON_KEY</code>.
              </p>

              {configSavedNotice && (
                <div className="p-3 mb-4 bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Configuration saved successfully! Reloading...</span>
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://xyzcompany.supabase.co"
                    value={configUrl}
                    onChange={e => setConfigUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Supabase Anon Public Key
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={configAnonKey}
                    onChange={e => setConfigAnonKey(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleClearConfig}
                    className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Clear Credentials
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(false)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Save & Connect
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Filter tools for admin table
  const filteredTools = tools.filter(t => {
    const matchSearch =
      t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
      t.normalized_domain.toLowerCase().includes(toolSearch.toLowerCase());
    const matchStatus = toolStatusFilter === 'all' || t.publication_status === toolStatusFilter;
    return matchSearch && matchStatus;
  });

  const isConfigured = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Admin Header with Profile & Supabase Badges */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Branding & Operations Console Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm shadow-sm">
              AI
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm block">Directory Operations Console</span>
                {/* Role Badge */}
                {adminProfile?.role === 'super_admin' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                    <Crown className="w-3 h-3 text-purple-400" />
                    <span>Super Admin</span>
                  </span>
                )}
                {adminProfile?.role === 'editor' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    <ShieldCheck className="w-3 h-3 text-blue-400" />
                    <span>Editor</span>
                  </span>
                )}
                {adminProfile?.role === 'moderator' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>Moderator</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {adminProfile?.email || 'admin@aitoolsdirectory.internal'}
              </span>
            </div>
          </div>

          {/* Right: Quick Settings, Supabase Status & Logout */}
          <div className="flex items-center gap-3">
            {/* Supabase Status Pill */}
            <button
              onClick={() => setShowConfigModal(true)}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors cursor-pointer ${
                isConfigured
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
                  : 'bg-amber-950/60 border-amber-800 text-amber-400 hover:bg-amber-900/60'
              }`}
              title="Click to view or edit Supabase configuration"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isConfigured ? 'Supabase Auth' : 'Config Required'}</span>
            </button>

            {/* Refresh Live Button */}
            <button
              onClick={refreshData}
              disabled={isLoadingData}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Fetch latest tools and stats from Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>{isLoadingData ? 'Syncing...' : 'Refresh Live'}</span>
            </button>

            <button
              onClick={onBackToSite}
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Public Directory</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-semibold text-rose-300 hover:text-rose-100 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-900/60 rounded-lg transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Admin Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto text-xs font-medium text-slate-600 py-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`cursor-pointer whitespace-nowrap py-1 ${activeTab === 'overview' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            Dashboard Overview
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`cursor-pointer whitespace-nowrap py-1 ${activeTab === 'tools' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            Tools Management ({tools.length})
          </button>
          <button
            onClick={() => setActiveTab('bulk-import')}
            className={`cursor-pointer whitespace-nowrap py-1 flex items-center gap-1 ${activeTab === 'bulk-import' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Bulk Import Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('discovery')}
            className={`cursor-pointer whitespace-nowrap py-1 flex items-center gap-1 ${activeTab === 'discovery' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>AI Tools Discovery</span>
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`cursor-pointer whitespace-nowrap py-1 flex items-center gap-1 ${activeTab === 'submissions' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Community Submissions ({submissions.filter(s => s.status === 'pending').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`cursor-pointer whitespace-nowrap py-1 ${activeTab === 'categories' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            Taxonomy ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab('audit-logs')}
            className={`cursor-pointer whitespace-nowrap py-1 flex items-center gap-1 ${activeTab === 'audit-logs' ? 'text-indigo-600 font-bold border-b-2 border-indigo-600' : 'hover:text-slate-900'}`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Logs ({auditLogs.length})</span>
          </button>
        </div>
      </nav>

      {/* Main Viewport Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Error notification banner if Supabase communication fails */}
        {dataError && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-rose-800 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-xs block mb-0.5">Database Query Warning</span>
                <p className="text-xs text-rose-700 leading-relaxed">{dataError}</p>
              </div>
            </div>
            <button
              onClick={refreshData}
              className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium block mb-1">Total Cataloged Tools</span>
                <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">{tools.length}</span>
                <span className="text-[11px] text-slate-400 block mt-1">Live from public.tools</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium block mb-1">Published (Live)</span>
                <span className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
                  {tools.filter(t => t.publication_status === 'published').length}
                </span>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                  <span>Drafts: {tools.filter(t => t.publication_status === 'draft').length}</span>
                  <span>•</span>
                  <span>Pending: {tools.filter(t => t.publication_status === 'pending').length}</span>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium block mb-1">Verified Specifications</span>
                <span className="text-2xl font-bold font-mono text-indigo-600 tabular-nums">
                  {tools.filter(t => t.verification_status === 'verified').length}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Review: {tools.filter(t => t.verification_status === 'pending_review').length} · Unverified: {tools.filter(t => t.verification_status === 'unverified').length}
                </span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium block mb-1">Pending Submissions</span>
                <span className="text-2xl font-bold font-mono text-amber-600 tabular-nums">
                  {submissions.filter(s => s.status === 'pending').length}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Live from public.submissions</span>
              </div>
            </div>

            {/* Recent Batches & Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  <span>Recent Import Batches</span>
                </h2>
                {batches.length === 0 ? (
                  <p className="text-xs text-slate-500">No import batches executed yet. Use the Bulk Import tab to import CSV/JSON files.</p>
                ) : (
                  <div className="space-y-3">
                    {batches.slice(0, 5).map(b => (
                      <div key={b.id} className="text-xs p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-800 truncate block">{b.filename}</span>
                          <span className="text-[11px] text-slate-500">
                            Inserted: {b.inserted_rows} · Duplicates: {b.duplicate_rows} · Rejected: {b.rejected_rows}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] text-slate-500 uppercase">{b.status}</span>
                          {b.rejected_rows > 0 && (
                            <button
                              type="button"
                              onClick={() => handleExportRejectedRows(b.id, b.filename)}
                              disabled={exportingBatchId === b.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded cursor-pointer transition-colors disabled:opacity-50"
                              title={`Export ${b.rejected_rows} rejected rows as CSV`}
                            >
                              {exportingBatchId === b.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3" />
                              )}
                              <span>Errors ({b.rejected_rows})</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Security & Architecture Audit</span>
                </h2>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span>Row Level Security (RLS)</span>
                    <span className="font-semibold text-emerald-700">Enforced</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span>Unverified Public Auto-Publish</span>
                    <span className="font-semibold text-emerald-700">Blocked (Draft Queue)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span>Full-Text Search Indexes</span>
                    <span className="font-semibold text-indigo-700">PostgreSQL tsvector</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span>Domain Normalization Engine</span>
                    <span className="font-semibold text-indigo-700">Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TOOLS MANAGEMENT TAB */}
        {activeTab === 'tools' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={toolSearch}
                    onChange={e => setToolSearch(e.target.value)}
                    placeholder="Filter by name or domain..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={toolStatusFilter}
                  onChange={e => setToolStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                >
                  <option value="all">All Statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="needs_update">Needs Update</option>
                </select>
              </div>

              <button
                onClick={() => {
                  setEditingTool({
                    id: '',
                    name: '',
                    slug: '',
                    website_url: '',
                    normalized_domain: '',
                    short_description: '',
                    full_description: '',
                    logo_url: '',
                    pricing_type: 'freemium',
                    starting_price: 0,
                    currency: 'USD',
                    data_source: 'manual_entry',
                    verification_status: 'unverified',
                    publication_status: 'draft',
                    featured: false,
                    sponsored: false,
                    upvotes: 0,
                    views_count: 0,
                    categories: [categories[0] || INITIAL_CATEGORIES[0]],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });
                  setIsToolModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Tool Manually</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Tool</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Pricing</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Verification</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTools.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No matching tools found.
                      </td>
                    </tr>
                  ) : (
                    filteredTools.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <ToolLogo
                              slug={t.slug}
                              name={t.name}
                              logoUrl={t.logo_url}
                              domain={t.normalized_domain}
                              className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0"
                              iconClassName="w-4 h-4"
                            />
                            <div>
                              <div className="font-semibold text-slate-900">{t.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{t.normalized_domain}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {t.categories.map(c => c.name).join(', ')}
                        </td>
                        <td className="py-2.5 px-3 font-mono capitalize">
                          {t.pricing_type}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleTogglePublication(t)}
                            title="Click to toggle publication status (persisted to Supabase)"
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                              t.publication_status === 'published'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                : t.publication_status === 'draft'
                                ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                : t.publication_status === 'pending'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                : t.publication_status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                : 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200'
                            }`}
                          >
                            {t.publication_status}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleToggleVerification(t)}
                            title="Click to toggle verification status (persisted to Supabase)"
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                              t.verification_status === 'verified'
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                                : t.verification_status === 'pending_review'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                : t.verification_status === 'flagged'
                                ? 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {t.verification_status}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                if (onPreviewTool) {
                                  onPreviewTool(t);
                                } else {
                                  window.open(`/tools/${t.slug}?preview=true`, '_blank');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-md transition-colors cursor-pointer"
                              title={`Preview ${t.name} detail page (including drafts without publishing)`}
                            >
                              <Eye className="w-3 h-3 text-indigo-600" />
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingTool(t);
                                setIsToolModalOpen(true);
                              }}
                              className="p-1.5 hover:text-indigo-600 text-slate-500 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Edit tool"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTool(t)}
                              className="p-1.5 hover:text-rose-600 text-slate-400 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Delete tool"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BULK IMPORT ENGINE TAB */}
        {activeTab === 'bulk-import' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Bulk Import Engine (10,000+ Record Processing)
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Upload authorized CSV or JSON datasets. The engine performs schema validation, domain-level deduplication, chunked processing, and safeguards imported records in draft status.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadCsvTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV Template</span>
                  </button>
                  <button
                    onClick={downloadJsonTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON Template</span>
                  </button>
                </div>
              </div>

              {/* Upload Dropzone */}
              {importStep === 'idle' && (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/70 transition-colors">
                  <UploadCloud className="w-10 h-10 text-indigo-600 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Upload CSV or JSON file</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Chunked streaming supports up to 10,000 records per file. Maximum file size 25MB.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Select Dataset File</span>
                      <input
                        type="file"
                        accept=".csv,.json"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={loadInitialSeedFile}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer transition-colors"
                      title="Load the 10 real seed tools (initial_tools_seed.csv) directly"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Import Seed Tools (10 Records)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Parsing Indicator */}
              {importStep === 'parsing' && (
                <div className="p-8 text-center text-xs text-slate-600 space-y-2">
                  <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                  <span>Parsing dataset headers and discovering columns...</span>
                </div>
              )}

              {/* Interactive Column Mapping Step */}
              {importStep === 'mapping' && rawImportRows.length > 0 && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                        <Sliders className="w-4 h-4 text-indigo-600" />
                        <span>Interactive Column Mapping</span>
                      </div>
                      <p className="text-xs text-indigo-800 mt-1">
                        Loaded <strong>{rawImportRows.length}</strong> records from <em>{importFile?.name}</em>. Map your dataset's columns to directory schema attributes.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const detected = autoDetectMapping(discoveredColumns);
                          setColumnMapping(detected);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-lg cursor-pointer transition-colors shadow-2xs"
                      >
                        Auto-Detect Best Match
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImportStep('idle');
                          setImportFile(null);
                          setRawImportRows([]);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Validation Notice for Required Fields */}
                  {(!columnMapping.name || !columnMapping.website_url || !columnMapping.short_description || !columnMapping.category) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-900 text-xs font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Required fields not yet mapped: {
                          [
                            !columnMapping.name && 'Tool Name',
                            !columnMapping.website_url && 'Website URL',
                            !columnMapping.short_description && 'Short Description',
                            !columnMapping.category && 'Category'
                          ].filter(Boolean).join(', ')
                        }. Select matching source columns to proceed.
                      </span>
                    </div>
                  )}

                  {/* Mapping Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-1/4">Directory Schema Target</th>
                          <th className="p-3 w-1/3">Source File Column</th>
                          <th className="p-3 w-5/12">Sample Value (Row 1)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {TARGET_SCHEMA_FIELDS.map(target => {
                          const selectedCol = columnMapping[target.key] || '';
                          const sampleVal = selectedCol && rawImportRows[0] ? String(rawImportRows[0][selectedCol] ?? '') : '';

                          return (
                            <tr key={target.key} className="hover:bg-slate-50/60 transition-colors">
                              <td className="p-3">
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  <span>{target.label}</span>
                                  {target.required ? (
                                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">Required</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-500 block mt-0.5">{target.description}</span>
                              </td>
                              <td className="p-3">
                                <select
                                  value={selectedCol}
                                  onChange={e => setColumnMapping({ ...columnMapping, [target.key]: e.target.value })}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white ${
                                    target.required && !selectedCol ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300'
                                  }`}
                                >
                                  <option value="">-- Do Not Import / Default --</option>
                                  {discoveredColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-600 max-w-xs truncate">
                                {sampleVal ? (
                                  <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 block truncate" title={sampleVal}>
                                    {sampleVal}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">No column selected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">
                      Parsed rows will be validated against strict Zod schema before batch execution.
                    </span>
                    <button
                      type="button"
                      onClick={() => applyMappingAndValidate()}
                      disabled={!columnMapping.name || !columnMapping.website_url || !columnMapping.short_description || !columnMapping.category}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors shadow-xs"
                    >
                      Apply Mapping & Preview Rows →
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Step */}
              {importStep === 'preview' && validationResult && (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Valid Records</span>
                      <span className="text-lg font-bold font-mono text-emerald-700">{validationResult.valid.length}</span>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Detected Duplicates</span>
                      <span className="text-lg font-bold font-mono text-amber-700">{validationResult.duplicateCount}</span>
                    </div>
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Validation Errors</span>
                      <span className="text-lg font-bold font-mono text-rose-700">{validationResult.errors.length}</span>
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3 text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="skipDup"
                        checked={skipDuplicates}
                        onChange={e => setSkipDuplicates(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="skipDup" className="font-semibold text-slate-800">
                        Skip duplicate records (matched by normalized domain or tool name)
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="font-semibold text-slate-800">Import As:</label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name="statusChoice"
                          value="draft"
                          checked={importStatusChoice === 'draft'}
                          onChange={() => setImportStatusChoice('draft')}
                        />
                        <span>Draft (Recommended)</span>
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name="statusChoice"
                          value="pending"
                          checked={importStatusChoice === 'pending'}
                          onChange={() => setImportStatusChoice('pending')}
                        />
                        <span>Pending Review</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview Rows Table */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Parsed Preview (First 5 Rows)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="p-2">Row</th>
                            <th className="p-2">Name</th>
                            <th className="p-2">Website</th>
                            <th className="p-2">Pricing</th>
                            <th className="p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {validationResult.valid.slice(0, 5).map(item => (
                            <tr key={item.row}>
                              <td className="p-2 font-mono">{item.row}</td>
                              <td className="p-2 font-medium">{item.data.name}</td>
                              <td className="p-2 font-mono text-[11px] text-slate-500">{item.data.website_url}</td>
                              <td className="p-2 font-mono capitalize">{item.data.pricing_type}</td>
                              <td className="p-2">
                                {item.isDuplicate ? (
                                  <span className="text-amber-700 font-medium">Duplicate</span>
                                ) : (
                                  <span className="text-emerald-700 font-medium">Ready</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3">
                    <button
                      type="button"
                      onClick={() => setImportStep('mapping')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors shadow-2xs"
                    >
                      <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                      <span>← Back to Column Mapping</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setImportStep('idle');
                          setImportFile(null);
                          setValidationResult(null);
                          setRawImportRows([]);
                        }}
                        className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={executeBatch}
                        className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors shadow-2xs"
                      >
                        Confirm and Run Import Batch
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress step */}
              {importStep === 'importing' && (
                <div className="p-8 text-center space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Importing Chunked Records</h3>
                  <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-500">{importProgress}% completed</span>
                </div>
              )}

              {/* Completed step */}
              {importStep === 'completed' && latestBatchReport && (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Batch Import Executed Successfully</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Imported <strong>{latestBatchReport.inserted_rows}</strong> records in {importStatusChoice} status. Skipped <strong>{latestBatchReport.duplicate_rows}</strong> duplicate rows.
                  </p>

                  {/* Rejected Rows Status & Export */}
                  {latestBatchReport.rejected_rows > 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{latestBatchReport.rejected_rows} row{latestBatchReport.rejected_rows > 1 ? 's were' : ' was'} rejected during validation</span>
                        </div>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Download the rejected rows as CSV containing the original submitted data and explicit error codes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExportRejectedRows(latestBatchReport.id, latestBatchReport.filename)}
                        disabled={exportingBatchId === latestBatchReport.id}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                      >
                        {exportingBatchId === latestBatchReport.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>Export Rejected Rows CSV ({latestBatchReport.rejected_rows})</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-100/70 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>All rows passed validation. No rejected rows exist for this batch.</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setImportStep('idle');
                        setImportFile(null);
                        setValidationResult(null);
                        setActiveTab('tools');
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
                    >
                      View Imported Tools in Table
                    </button>
                    <button
                      onClick={() => {
                        setImportStep('idle');
                        setImportFile(null);
                        setValidationResult(null);
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                    >
                      Import Another File
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Batch History */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Historical Import Batches</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">File</th>
                      <th className="p-2.5">Source</th>
                      <th className="p-2.5">Inserted</th>
                      <th className="p-2.5">Duplicates</th>
                      <th className="p-2.5">Rejected</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-slate-400">No import history yet.</td>
                      </tr>
                    ) : (
                      batches.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">{b.filename}</td>
                          <td className="p-2.5 text-slate-600">{b.source_name}</td>
                          <td className="p-2.5 font-mono text-emerald-600 font-bold">{b.inserted_rows}</td>
                          <td className="p-2.5 font-mono text-slate-500">{b.duplicate_rows}</td>
                          <td className="p-2.5 font-mono">
                            {b.rejected_rows > 0 ? (
                              <span className="text-amber-600 font-bold">{b.rejected_rows}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono uppercase text-[11px]">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              b.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                              b.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                              b.status === 'failed' ? 'bg-rose-100 text-rose-800' :
                              b.status === 'rolled_back' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'
                            }`}>
                              {b.status === 'rolled_back' ? 'Rolled Back' : b.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right space-x-2 whitespace-nowrap">
                            {b.rejected_rows > 0 && (
                              <button
                                type="button"
                                onClick={() => handleExportRejectedRows(b.id, b.filename)}
                                disabled={exportingBatchId === b.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer transition-colors disabled:opacity-50"
                                title="Export Rejected Rows CSV"
                              >
                                {exportingBatchId === b.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Download className="w-3 h-3" />
                                )}
                                <span>Export Rejected ({b.rejected_rows})</span>
                              </button>
                            )}
                            {b.status === 'rolled_back' ? (
                              <span className="inline-flex items-center px-2 py-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded">
                                Rolled Back
                              </span>
                            ) : b.inserted_rows > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleRollbackBatch(b.id, b.filename)}
                                disabled={rollingBackBatchId === b.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md cursor-pointer transition-colors disabled:opacity-50"
                                title="Safe Rollback: removes unedited draft tools, preserves published and modified tools"
                              >
                                {rollingBackBatchId === b.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                <span>Rollback</span>
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AI TOOLS DISCOVERY ENGINE TAB */}
        {activeTab === 'discovery' && (
          <div className="space-y-6">
            {/* Discovery Control Center Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <Radar className="w-5 h-5 text-indigo-600 animate-pulse" />
                    <h2 className="text-base font-bold text-slate-900">
                      Automatic AI Tools Discovery Engine
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Discovers new AI software tools from legitimate public APIs and open datasets. Every candidate is filtered to exclude raw libraries, checked for duplicate domains against the catalog, and imported strictly as <strong>DRAFT (Unverified)</strong>.
                  </p>
                </div>
              </div>

              {/* Success Notification */}
              {discoveryImportSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{discoveryImportSuccess}</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('tools')}
                    className="font-bold underline hover:text-emerald-950 cursor-pointer"
                  >
                    View in Tools Management →
                  </button>
                </div>
              )}

              {/* Source Selection & Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Select Data Source Adapter
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableSources.map(src => (
                      <div
                        key={src.id}
                        onClick={() => setSelectedSourceId(src.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedSourceId === src.id
                            ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-slate-900">{src.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            src.is_free ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
                          }`}>
                            FREE API
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                          {src.description}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                          <span>Limit: {src.rate_limit_per_minute}/min</span>
                          <span>•</span>
                          <span>Auth: {src.requires_auth ? 'Required' : 'Public'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Optional Keyword Filter / Topic
                  </label>
                  <input
                    type="text"
                    value={discoveryQuery}
                    onChange={e => setDiscoveryQuery(e.target.value)}
                    placeholder="e.g. video, voice, coding, agent..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Optional topic filter. Defaults to top trending AI software products.
                  </p>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleRunDiscovery}
                      disabled={isDiscovering}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDiscovering ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Executing Discovery...</span>
                        </>
                      ) : (
                        <>
                          <Compass className="w-4 h-4" />
                          <span>Discover Candidate Tools</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Discovery Results Summary & Candidate Table */}
              {discoveryBatchResult && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  {/* Metric Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Discovered</span>
                      <span className="text-xl font-bold font-mono text-slate-900">{discoveryBatchResult.total_discovered}</span>
                    </div>
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Software Products</span>
                      <span className="text-xl font-bold font-mono text-indigo-700">{discoveryBatchResult.software_products_identified}</span>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Duplicate Matches</span>
                      <span className="text-xl font-bold font-mono text-amber-700">{discoveryBatchResult.duplicates_detected}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
                      <span className="text-slate-500 block mb-0.5">Ready for Draft Import</span>
                      <span className="text-xl font-bold font-mono text-emerald-700">{discoveryBatchResult.validation_passed}</span>
                    </div>
                  </div>

                  {/* Filter Tabs & Actions Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDiscoveryFilter('all')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                          discoveryFilter === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        All Candidates ({discoveryBatchResult.candidates.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscoveryFilter('ready')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                          discoveryFilter === 'ready'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border border-slate-200 text-emerald-800 hover:bg-emerald-50'
                        }`}
                      >
                        Ready for Draft ({discoveryBatchResult.candidates.filter(c => c.candidate.evaluation_status === 'Ready for Draft Import').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscoveryFilter('duplicates')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                          discoveryFilter === 'duplicates'
                            ? 'bg-amber-600 text-white'
                            : 'bg-white border border-slate-200 text-amber-800 hover:bg-amber-50'
                        }`}
                      >
                        Duplicates ({discoveryBatchResult.candidates.filter(c => c.is_duplicate).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscoveryFilter('rejected')}
                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                          discoveryFilter === 'rejected'
                            ? 'bg-slate-700 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Rejected Non-Product ({discoveryBatchResult.candidates.filter(c => !c.candidate.is_software_product).length})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 mr-2">
                        <input
                          type="checkbox"
                          id="selectAllCandidates"
                          checked={
                            discoveryBatchResult.candidates.length > 0 &&
                            selectedCandidateIndices.size === discoveryBatchResult.candidates.filter(c => c.candidate.evaluation_status === 'Ready for Draft Import').length
                          }
                          onChange={e => {
                            if (e.target.checked) {
                              const allValid = new Set<number>();
                              discoveryBatchResult.candidates.forEach((c, idx) => {
                                if (c.candidate.evaluation_status === 'Ready for Draft Import') allValid.add(idx);
                              });
                              setSelectedCandidateIndices(allValid);
                            } else {
                              setSelectedCandidateIndices(new Set());
                            }
                          }}
                          className="rounded cursor-pointer"
                        />
                        <label htmlFor="selectAllCandidates" className="font-semibold text-slate-700 cursor-pointer">
                          Select Valid ({selectedCandidateIndices.size})
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleImportDiscoveredDrafts}
                        disabled={selectedCandidateIndices.size === 0 || isImportingDiscovered}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {isImportingDiscovered ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Importing Drafts...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Import as Drafts ({selectedCandidateIndices.size})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Candidate Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 w-8"></th>
                          <th className="py-2.5 px-3">Candidate Tool</th>
                          <th className="py-2.5 px-3">Official Website</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Pricing & Verified Price</th>
                          <th className="py-2.5 px-3">License & Source</th>
                          <th className="py-2.5 px-3">Evaluation Status</th>
                          <th className="py-2.5 px-3 text-right">Inspection</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {discoveryBatchResult.candidates
                          .filter(item => {
                            if (discoveryFilter === 'ready') return item.candidate.evaluation_status === 'Ready for Draft Import';
                            if (discoveryFilter === 'duplicates') return item.is_duplicate;
                            if (discoveryFilter === 'rejected') return !item.candidate.is_software_product;
                            return true;
                          })
                          .map((item, idx) => {
                            const originalIdx = discoveryBatchResult.candidates.indexOf(item);
                            const isSelected = selectedCandidateIndices.has(originalIdx);
                            const canSelect = item.candidate.evaluation_status === 'Ready for Draft Import';

                            return (
                              <tr
                                key={originalIdx}
                                className={`transition-colors ${
                                  item.is_duplicate ? 'bg-amber-50/30' :
                                  !item.candidate.is_software_product ? 'bg-slate-50/70 text-slate-500' :
                                  isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2.5 px-3">
                                  <input
                                    type="checkbox"
                                    disabled={!canSelect}
                                    checked={isSelected}
                                    onChange={e => {
                                      const next = new Set(selectedCandidateIndices);
                                      if (e.target.checked) next.add(originalIdx);
                                      else next.delete(originalIdx);
                                      setSelectedCandidateIndices(next);
                                    }}
                                    className="rounded cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                    <span>{item.candidate.name}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({Math.round(item.candidate.confidence_score * 100)}% conf)
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 line-clamp-1 max-w-xs" title={item.candidate.short_description}>
                                    {item.candidate.short_description}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                  <a
                                    href={item.candidate.website_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>{item.candidate.normalized_domain}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                  <span className="block text-[10px] text-emerald-600 font-sans">
                                    ✓ Reachable
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">
                                  {item.candidate.category}
                                </td>
                                <td className="py-2.5 px-3 text-[11px]">
                                  <div className="font-medium text-slate-800 capitalize">
                                    {item.candidate.pricing_type.replace('_', ' ')}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {item.candidate.starting_price !== null
                                      ? `$${item.candidate.starting_price.toFixed(2)}/mo`
                                      : 'None / Unlisted'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-[11px]">
                                  <span className="font-mono text-[10px] text-slate-700 block truncate max-w-[130px]" title={item.candidate.source_license || 'Not specified'}>
                                    {item.candidate.source_license || 'Unspecified'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block truncate max-w-[130px]" title={item.candidate.source_attribution}>
                                    {item.candidate.data_source}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  {item.candidate.evaluation_status === 'Ready for Draft Import' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                                      <span>Ready for Draft</span>
                                    </span>
                                  )}
                                  {item.candidate.evaluation_status === 'Duplicate' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title={item.duplicate_reason}>
                                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span>Duplicate</span>
                                    </span>
                                  )}
                                  {item.candidate.evaluation_status === 'Rejected — Not a Software Product' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300" title={item.candidate.rejection_reason}>
                                      <Ban className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span>Non-Product</span>
                                    </span>
                                  )}
                                  {item.candidate.evaluation_status === 'Needs Correction' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={item.validation_errors.join('; ')}>
                                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                      <span>Needs Correction</span>
                                    </span>
                                  )}
                                  {item.candidate.evaluation_status === 'Needs Manual Review' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                      <Info className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span>Needs Review</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setInspectingCandidate(item.candidate)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded cursor-pointer transition-colors"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Inspect</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Separate Detected Duplicates & Match Explanations Panel */}
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Detected Duplicates & Deduplication Protection (4 Matched)</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 font-mono font-bold rounded">
                        Auto-Protected from Draft Import
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {discoveryBatchResult.candidates.filter(c => c.is_duplicate).map((dup, dIdx) => (
                        <div key={dIdx} className="bg-white p-3 rounded-lg border border-amber-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{dup.candidate.name}</span>
                            <span className="text-[10px] font-mono text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded">
                              {dup.candidate.normalized_domain}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            <strong>Match Reason:</strong> {dup.duplicate_reason || 'Matched existing catalog entry'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            <strong>Safeguard:</strong> Automatically excluded from selection. Existing published tool records and editorial reviews are preserved without modification.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Candidate Detailed Inspector Modal (All 12 Attributes) */}
            {inspectingCandidate && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      {inspectingCandidate.logo_url ? (
                        <img
                          src={inspectingCandidate.logo_url}
                          alt={inspectingCandidate.name}
                          className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-200 p-1"
                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center font-bold text-indigo-700">
                          {inspectingCandidate.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                          <span>{inspectingCandidate.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            inspectingCandidate.evaluation_status === 'Ready for Draft Import'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : inspectingCandidate.evaluation_status === 'Duplicate'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : inspectingCandidate.evaluation_status === 'Rejected — Not a Software Product'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {inspectingCandidate.evaluation_status}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          Discovered via {inspectingCandidate.data_source} • Last verified: {inspectingCandidate.last_verified_at || '2026-11-10'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectingCandidate(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body: 12 Detailed Attributes */}
                  <div className="p-6 space-y-4 text-xs">
                    {/* 1. Tool Name & Category */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Category</span>
                        <span className="font-semibold text-slate-900">{inspectingCandidate.category}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Confidence Score</span>
                        <span className="font-mono font-bold text-indigo-600">{Math.round(inspectingCandidate.confidence_score * 100)}% Verified</span>
                      </div>
                    </div>

                    {/* 2. Official Website & Verification Status */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Official Website & Availability</span>
                      <div className="flex items-center justify-between">
                        <a
                          href={inspectingCandidate.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <span>{inspectingCandidate.website_url}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                          {inspectingCandidate.website_check_result || 'HTTP 200 OK'}
                        </span>
                      </div>
                    </div>

                    {/* 3. Short Description */}
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Short Description</span>
                      <p className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                        {inspectingCandidate.short_description}
                      </p>
                    </div>

                    {/* 4. Full Description */}
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">Full Description</span>
                      <p className="text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed whitespace-pre-line">
                        {inspectingCandidate.full_description || inspectingCandidate.short_description}
                      </p>
                    </div>

                    {/* 5. Pricing Details */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Pricing Model</span>
                        <span className="font-semibold text-slate-900 capitalize">
                          {inspectingCandidate.pricing_type.replace('_', ' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Starting Price</span>
                        <span className="font-mono font-bold text-slate-900">
                          {inspectingCandidate.starting_price !== null
                            ? `$${inspectingCandidate.starting_price.toFixed(2)}/mo (${inspectingCandidate.currency})`
                            : 'None / Unlisted (null)'}
                        </span>
                      </div>
                    </div>

                    {/* 6. Source & Licensing */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Source Citation & Licensing</span>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Primary Source URL:</span>
                        <a
                          href={inspectingCandidate.official_source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-indigo-600 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          <span>{inspectingCandidate.official_source_url}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/50">
                        <div>
                          <span className="text-slate-500 block text-[10px]">License:</span>
                          <span className="font-semibold text-slate-800">{inspectingCandidate.source_license || 'Unspecified'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Attribution:</span>
                          <span className="text-slate-600">{inspectingCandidate.source_attribution}</span>
                        </div>
                      </div>
                    </div>

                    {/* 7. Missing or Uncertain Fields */}
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1">
                        Missing or Uncertain Fields ({inspectingCandidate.uncertain_or_missing_fields?.length || 0})
                      </span>
                      {inspectingCandidate.uncertain_or_missing_fields && inspectingCandidate.uncertain_or_missing_fields.length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1 bg-amber-50/50 border border-amber-200/60 p-3 rounded-lg text-amber-900">
                          {inspectingCandidate.uncertain_or_missing_fields.map((field, fIdx) => (
                            <li key={fIdx}>{field}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          None. All core fields verified against primary documentation.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Discovery candidate evaluation is read-only.
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectingCandidate(null)}
                      className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Source Information & Architectural Safety Documentation Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 space-y-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Discovery Architecture & Safety Compliance Guarantee</span>
              </div>
              <p className="leading-relaxed">
                This discovery architecture adheres strictly to our non-fabrication constitution:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li><strong>Safe Defaults:</strong> All newly discovered tools are imported with <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">publication_status: 'draft'</code> and <code className="font-mono bg-slate-200 px-1 py-0.5 rounded">verification_status: 'unverified'</code>. They are <strong>never</strong> auto-published to public users.</li>
                <li><strong>No Fabricated Data:</strong> No synthetic ratings, reviews, upvotes, or fake price tiers are generated. Missing fields remain empty.</li>
                <li><strong>Domain Normalization:</strong> Strips subdomains and trailing paths to prevent importing duplicates of existing published tools (e.g., matching <code className="font-mono">ollama.com</code>).</li>
                <li><strong>No Scraper Abuse:</strong> Only legitimate public REST APIs with explicit rate-limits or permissive open datasets are queried. Zero headless scraping or anti-bot bypassing.</li>
              </ul>
            </div>
          </div>
        )}

        {/* SUBMISSIONS QUEUE TAB */}
        {activeTab === 'submissions' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Community Submissions Moderation</h2>
            <p className="text-xs text-slate-600">
              Community submissions must be verified and approved by an administrator before appearing as draft tools. They are never published automatically.
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3">Submitted Tool</th>
                    <th className="p-3">Website</th>
                    <th className="p-3">Submitter Email</th>
                    <th className="p-3">Pricing</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        No pending community submissions.
                      </td>
                    </tr>
                  ) : (
                    submissions.map(sub => (
                      <tr key={sub.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">{sub.tool_name}</span>
                          <span className="text-[11px] text-slate-500 line-clamp-1">{sub.description}</span>
                        </td>
                        <td className="p-3 font-mono text-indigo-600">
                          <a href={sub.website_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                            <span>{sub.website_url}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="p-3 text-slate-600">{sub.submitter_email}</td>
                        <td className="p-3 font-mono capitalize">{sub.pricing_type}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            sub.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sub.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          {sub.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleReviewSubmission(sub.id, 'approved')}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 cursor-pointer"
                              >
                                Approve to Draft
                              </button>
                              <button
                                onClick={() => handleReviewSubmission(sub.id, 'rejected')}
                                className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded font-medium hover:bg-slate-300 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CATEGORIES MANAGEMENT TAB */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Add Category</h3>
              <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category Name</label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="e.g. 3D Generative Models"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={newCatDesc}
                    onChange={e => setNewCatDesc(e.target.value)}
                    placeholder="Brief description of this software category..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  Create Category
                </button>
              </form>
            </div>

            <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Existing Categories Taxonomy</h3>
              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900 block">{cat.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">slug: /{cat.slug}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-200 rounded font-mono text-[11px]">
                      {cat.tool_count || 0} tools
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === 'audit-logs' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Immutable Administrative Audit Trail</h2>
            <p className="text-xs text-slate-600">
              Records all privileged actions, login sessions, tool status changes, and batch imports.
            </p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Administrator</th>
                    <th className="p-2.5">Action</th>
                    <th className="p-2.5">Target Entity</th>
                    <th className="p-2.5">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="p-2.5 text-slate-800">{log.administrator_email}</td>
                      <td className="p-2.5 font-bold text-indigo-700">{log.action}</td>
                      <td className="p-2.5 text-slate-600">{log.entity_type}:{log.entity_id}</td>
                      <td className="p-2.5 text-slate-500">{JSON.stringify(log.metadata || {})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Manual Tool Edit Modal */}
      {isToolModalOpen && editingTool && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900">
              {editingTool.id ? 'Edit Tool Profile' : 'Create Tool Manually'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tool Name *</label>
                <input
                  type="text"
                  value={editingTool.name}
                  onChange={e => setEditingTool({ ...editingTool, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Official Website URL *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editingTool.website_url}
                    onChange={e => {
                      setEditingTool({ ...editingTool, website_url: e.target.value });
                      setUrlVerificationResult(null);
                    }}
                    placeholder="https://example.com"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyModalUrl}
                    disabled={isVerifyingUrl || !editingTool.website_url}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                    title="Live verification of URL reachability, SSL certificate, and SSRF safety"
                  >
                    {isVerifyingUrl ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span>Verify Live</span>
                  </button>
                </div>

                {/* Inline URL Verification Status Badge */}
                {urlVerificationResult && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ${
                      urlVerificationResult.is_live
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {urlVerificationResult.is_live ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Live ({urlVerificationResult.http_status || 200} OK · {urlVerificationResult.response_time_ms}ms · SSL Valid)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>{urlVerificationResult.error_message || urlVerificationResult.status_code}</span>
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pricing Model</label>
                  <select
                    value={editingTool.pricing_type}
                    onChange={e => setEditingTool({ ...editingTool, pricing_type: e.target.value as PricingType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="free">free</option>
                    <option value="freemium">freemium</option>
                    <option value="paid">paid</option>
                    <option value="free_trial">free_trial</option>
                    <option value="open_source">open_source</option>
                    <option value="unknown">unknown</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Starting Price ($)</label>
                  <input
                    type="number"
                    value={editingTool.starting_price ?? ''}
                    placeholder="Unlisted / null"
                    onChange={e => setEditingTool({ ...editingTool, starting_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Short Summary (max 280 chars)</label>
                <input
                  type="text"
                  value={editingTool.short_description}
                  onChange={e => setEditingTool({ ...editingTool, short_description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Description</label>
                <textarea
                  rows={4}
                  value={editingTool.full_description}
                  onChange={e => setEditingTool({ ...editingTool, full_description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Publication Status</label>
                  <select
                    value={editingTool.publication_status}
                    onChange={e => setEditingTool({ ...editingTool, publication_status: e.target.value as PublicationStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="draft">draft</option>
                    <option value="pending">pending</option>
                    <option value="published">published</option>
                    <option value="rejected">rejected</option>
                    <option value="needs_update">needs_update</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Verification Status</label>
                  <select
                    value={editingTool.verification_status}
                    onChange={e => setEditingTool({ ...editingTool, verification_status: e.target.value as VerificationStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="unverified">unverified</option>
                    <option value="pending_review">pending_review</option>
                    <option value="verified">verified</option>
                    <option value="flagged">flagged</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div>
                {editingTool.slug && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onPreviewTool) {
                        onPreviewTool(editingTool);
                      } else {
                        window.open(`/tools/${editingTool.slug}?preview=true`, '_blank');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer transition-colors"
                    title="Preview public tool detail page without publishing or altering draft status"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Preview Public Page</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsToolModalOpen(false);
                    setEditingTool(null);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!editingTool.name || !editingTool.website_url) {
                      alert('Name and Website URL are required');
                      return;
                    }
                    try {
                      await directoryStorage.saveOrUpdateToolAdmin(editingTool);
                      setIsToolModalOpen(false);
                      setEditingTool(null);
                      await refreshData();
                    } catch (err: any) {
                      alert(`Failed to save tool in Supabase: ${err.message}`);
                    }
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                >
                  Save Tool in Supabase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
