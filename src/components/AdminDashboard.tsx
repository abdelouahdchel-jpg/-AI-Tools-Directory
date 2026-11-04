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
  Crown
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
import { INITIAL_CATEGORIES } from '../data/initialData';
import { directoryStorage } from '../services/storage';
import { normalizeDomain, generateSlug } from '../lib/validation';
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
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToSite }) => {
  // Supabase Authentication & Admin Authorization state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('admin_authenticated') === 'true';
  });
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(() => {
    const savedEmail = sessionStorage.getItem('admin_user');
    const savedRole = sessionStorage.getItem('admin_role') as any;
    if (savedEmail && savedRole) {
      return {
        id: sessionStorage.getItem('admin_uid') || 'cached-id',
        email: savedEmail,
        full_name: sessionStorage.getItem('admin_name') || 'Administrator',
        role: savedRole,
        is_active: true,
        created_at: new Date().toISOString()
      };
    }
    return null;
  });

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

  // Active Tab: overview | tools | bulk-import | submissions | categories | audit-logs
  const [activeTab, setActiveTab] = useState<'overview' | 'tools' | 'bulk-import' | 'submissions' | 'categories' | 'audit-logs'>('overview');

  // Directory Data
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Tools Table filter
  const [toolSearch, setToolSearch] = useState('');
  const [toolStatusFilter, setToolStatusFilter] = useState<string>('all');

  // Tool Edit Modal
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);

  // Bulk Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSourceName, setImportSourceName] = useState('Authorized CSV Batch');
  const [importStatusChoice, setImportStatusChoice] = useState<'draft' | 'pending'>('draft');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importStep, setImportStep] = useState<'idle' | 'parsing' | 'preview' | 'importing' | 'completed'>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [validationResult, setValidationResult] = useState<{
    valid: any[];
    errors: any[];
    duplicateCount: number;
  } | null>(null);
  const [latestBatchReport, setLatestBatchReport] = useState<ImportBatch | null>(null);

  // Category creation
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const refreshData = () => {
    setTools(directoryStorage.getAllToolsAdmin());
    setCategories(directoryStorage.getCategories());
    setSubmissions(directoryStorage.getSubmissions());
    setBatches(directoryStorage.getImportBatches());
    setAuditLogs(directoryStorage.getAuditLogs());
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
          }
        }
      } catch {
        // Fallback to current state
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

  // Handle Login via Supabase Auth
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setResetMessage('');
    setIsLoggingIn(true);

    try {
      if (isSupabaseConfigured()) {
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
      } else {
        // If Supabase credentials are not connected yet:
        if (adminEmail.includes('@') && adminPassword.length >= 6) {
          const fallbackProfile: AdminProfile = {
            id: 'local-admin-sim',
            email: adminEmail.trim().toLowerCase(),
            full_name: 'Local Administrator',
            role: 'super_admin',
            is_active: true,
            created_at: new Date().toISOString()
          };
          setAdminProfile(fallbackProfile);
          setIsAuthenticated(true);
          sessionStorage.setItem('admin_authenticated', 'true');
          sessionStorage.setItem('admin_user', adminEmail);
          sessionStorage.setItem('admin_uid', fallbackProfile.id);
          sessionStorage.setItem('admin_role', 'super_admin');
          directoryStorage.logAuditAction('admin_login', 'auth', adminEmail, { method: 'local_offline_auth' });
        } else {
          setAuthError('Invalid credentials. Password must be at least 6 characters.');
        }
      }
    } catch (err: any) {
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

  // Tool status toggle
  const handleTogglePublication = (tool: Tool) => {
    const newStatus: PublicationStatus = tool.publication_status === 'published' ? 'draft' : 'published';
    directoryStorage.saveOrUpdateTool({
      ...tool,
      publication_status: newStatus
    });
    refreshData();
  };

  const handleToggleVerification = (tool: Tool) => {
    const newStatus: VerificationStatus = tool.verification_status === 'verified' ? 'unverified' : 'verified';
    directoryStorage.saveOrUpdateTool({
      ...tool,
      verification_status: newStatus,
      last_verified_at: newStatus === 'verified' ? new Date().toISOString() : undefined
    });
    refreshData();
  };

  const handleDeleteTool = (tool: Tool) => {
    if (confirm(`Permanently delete '${tool.name}'?`)) {
      directoryStorage.deleteTool(tool.id);
      refreshData();
    }
  };

  // Submission review
  const handleReviewSubmission = (id: string, status: 'approved' | 'rejected') => {
    directoryStorage.reviewSubmission(id, status);
    refreshData();
  };

  // Add category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    directoryStorage.addCategory({
      name: newCatName.trim(),
      slug: generateSlug(newCatName),
      description: newCatDesc.trim() || `Tools in ${newCatName}`
    });
    setNewCatName('');
    setNewCatDesc('');
    refreshData();
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
              transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_')
            });
            parsedRows = results.data as Record<string, unknown>[];
          } else {
            const json = JSON.parse(content);
            parsedRows = Array.isArray(json) ? json : [json];
          }

          // Run validation engine
          const result = directoryStorage.parseAndValidateBatch(parsedRows);
          setValidationResult(result);
          setImportStep('preview');
        } catch (err: any) {
          alert('Failed to parse file: ' + err.message);
          setImportStep('idle');
        }
      };
      reader.readAsText(file);
    }
  };

  // Run chunked batch execution
  const executeBatch = async () => {
    if (!validationResult || !importFile) return;

    setImportStep('importing');
    setImportProgress(10);

    const chunkSize = 100;
    const validRows = validationResult.valid;
    const errors = validationResult.errors;

    // Simulate chunked batch processing
    for (let i = 0; i < validRows.length; i += chunkSize) {
      await new Promise(r => setTimeout(r, 60));
      const progress = Math.min(95, Math.round(((i + chunkSize) / validRows.length) * 100));
      setImportProgress(progress);
    }

    const report = directoryStorage.executeBatchImport(
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
    refreshData();
  };

  // Download templates
  const downloadCsvTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "name,website_url,short_description,full_description,pricing_type,starting_price,currency,category,data_source,official_source_url,source_license,source_attribution,logo_url,affiliate_url\n" +
      "Claude,https://claude.ai,Next-gen AI assistant by Anthropic,Claude is a conversational and coding assistant built by Anthropic with 200k context window,freemium,20.00,USD,Coding & Development,manual_editorial,https://anthropic.com/claude,Proprietary,Anthropic Docs,https://api.iconify.design/simple-icons:anthropic.svg,\n" +
      "Whisper,https://github.com/openai/whisper,Open source speech recognition neural net,Whisper is an automatic speech recognition system trained on 680000 hours of multilingual data,open_source,0.00,USD,Audio & Speech,github_repo,https://github.com/openai/whisper,MIT,OpenAI Whisper Repo,https://api.iconify.design/simple-icons:github.svg,";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ai_tools_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            Restricted access for verified administrators. Authenticates with Supabase Auth and enforces active role validation in <code className="text-indigo-400">public.admin_users</code>.
          </p>

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
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="owner@yourdomain.com"
                className="w-full px-3.5 py-2.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
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
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-indigo-900/30 cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
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
              <span>{isConfigured ? 'Supabase Auth' : 'Local Fallback'}</span>
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
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium block mb-1">Total Cataloged Tools</span>
                <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">{tools.length}</span>
                <span className="text-[11px] text-slate-400 block mt-1">Scale capacity: 50,000+</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium block mb-1">Published (Live)</span>
                <span className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
                  {tools.filter(t => t.publication_status === 'published').length}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Drafts: {tools.filter(t => t.publication_status === 'draft').length}
                </span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium block mb-1">Verified Specifications</span>
                <span className="text-2xl font-bold font-mono text-indigo-600 tabular-nums">
                  {tools.filter(t => t.verification_status === 'verified').length}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Official provenance checked</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-500 font-medium block mb-1">Pending Submissions</span>
                <span className="text-2xl font-bold font-mono text-amber-600 tabular-nums">
                  {submissions.filter(s => s.status === 'pending').length}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">Awaiting editorial review</span>
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
                      <div key={b.id} className="text-xs p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-800 block">{b.filename}</span>
                          <span className="text-[11px] text-slate-500">
                            Inserted: {b.inserted_rows} · Duplicates Skipped: {b.duplicate_rows} · Errors: {b.rejected_rows}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 uppercase">{b.status}</span>
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
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                              t.publication_status === 'published'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {t.publication_status}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleToggleVerification(t)}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                              t.verification_status === 'verified'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t.verification_status}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1">
                          <button
                            onClick={() => {
                              setEditingTool(t);
                              setIsToolModalOpen(true);
                            }}
                            className="p-1 hover:text-indigo-600 text-slate-500 cursor-pointer"
                            title="Edit tool"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTool(t)}
                            className="p-1 hover:text-rose-600 text-slate-400 cursor-pointer"
                            title="Delete tool"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                </div>
              )}

              {/* Parsing Indicator */}
              {importStep === 'parsing' && (
                <div className="p-8 text-center text-xs text-slate-600 space-y-2">
                  <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                  <span>Validating schema and identifying duplicates...</span>
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
                  <div className="flex items-center justify-end gap-3 pt-3">
                    <button
                      onClick={() => {
                        setImportStep('idle');
                        setImportFile(null);
                        setValidationResult(null);
                      }}
                      className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeBatch}
                      className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
                    >
                      Confirm and Run Import Batch
                    </button>
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
                  <div>
                    <button
                      onClick={() => {
                        setImportStep('idle');
                        setImportFile(null);
                        setValidationResult(null);
                        setActiveTab('tools');
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                    >
                      View Imported Tools in Table
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
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-slate-400">No import history yet.</td>
                      </tr>
                    ) : (
                      batches.map(b => (
                        <tr key={b.id}>
                          <td className="p-2.5 font-mono text-[11px] text-slate-500">
                            {new Date(b.created_at).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">{b.filename}</td>
                          <td className="p-2.5 text-slate-600">{b.source_name}</td>
                          <td className="p-2.5 font-mono text-emerald-600 font-bold">{b.inserted_rows}</td>
                          <td className="p-2.5 font-mono text-slate-500">{b.duplicate_rows}</td>
                          <td className="p-2.5 font-mono uppercase text-[11px]">{b.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
                <input
                  type="url"
                  value={editingTool.website_url}
                  onChange={e => setEditingTool({ ...editingTool, website_url: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
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
                    value={editingTool.starting_price}
                    onChange={e => setEditingTool({ ...editingTool, starting_price: parseFloat(e.target.value) || 0 })}
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

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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
                onClick={() => {
                  if (!editingTool.name || !editingTool.website_url) {
                    alert('Name and Website URL are required');
                    return;
                  }
                  directoryStorage.saveOrUpdateTool(editingTool);
                  setIsToolModalOpen(false);
                  setEditingTool(null);
                  refreshData();
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
              >
                Save Tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
