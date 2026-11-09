import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Layers,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  Scale,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Database,
  Settings
} from 'lucide-react';
import { Tool, Category, PricingType } from './types/database';
import { directoryStorage } from './services/storage';
import { isSupabaseConfigured } from './lib/supabase';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { ToolCard } from './components/ToolCard';
import { ToolDetailView } from './components/ToolDetailView';
import { SubmitToolView } from './components/SubmitToolView';
import { BlogView } from './components/BlogView';
import { StaticPages } from './components/StaticPages';
import { ComparisonDrawer } from './components/ComparisonDrawer';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  // Navigation & View State - Initialize from URL pathname or hash (e.g. /admin or #/admin)
  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/admin' || hash === '#/admin' || window.location.search.includes('view=admin')) {
        return 'admin';
      }
    }
    return 'home';
  });

  const [selectedToolSlug, setSelectedToolSlug] = useState<string | null>(null);
  const [selectedBlogSlug, setSelectedBlogSlug] = useState<string | undefined>(undefined);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  // Supabase Data Fetching & Sync State
  const [dataFetchState, setDataFetchState] = useState<{
    status: 'loading' | 'live' | 'cached' | 'error' | 'empty' | 'unconfigured';
    error?: string;
    cacheTimestamp?: string;
  }>({ status: 'loading' });

  // Timestamp trigger for memo recalculations when live tools arrive
  const [dataVersion, setDataVersion] = useState<number>(0);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPricing, setSelectedPricing] = useState<PricingType[]>([]);
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'popular' | 'recent' | 'name-asc' | 'price-asc'>('featured');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;

  // Comparison State
  const [compareList, setCompareList] = useState<string[]>(() => directoryStorage.getCompareList());
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Categories list
  const [categories, setCategories] = useState<Category[]>(() => directoryStorage.getCategories());

  // Fetch published tools strictly from Supabase
  const loadPublishedTools = async () => {
    setDataFetchState(prev => ({ ...prev, status: 'loading', error: undefined }));
    try {
      if (!isSupabaseConfigured()) {
        const cached = directoryStorage.getCachedPublishedTools();
        if (cached && cached.tools.length > 0) {
          directoryStorage.setPublishedTools(cached.tools, cached.categories);
          setCategories(directoryStorage.getCategories());
          setDataVersion(v => v + 1);
          setDataFetchState({
            status: 'cached',
            cacheTimestamp: cached.timestamp,
            error: 'Supabase credentials are not configured. Displaying local offline cache snapshot.'
          });
        } else {
          directoryStorage.setPublishedTools([]);
          setCategories(directoryStorage.getCategories());
          setDataVersion(v => v + 1);
          setDataFetchState({
            status: 'unconfigured',
            error: 'Supabase credentials are not configured. Configure your project in Admin Console.'
          });
        }
        return;
      }

      const res = await directoryStorage.fetchPublishedTools();
      setCategories(directoryStorage.getCategories());
      setDataVersion(v => v + 1);

      if (res.tools.length === 0) {
        setDataFetchState({ status: 'empty' });
      } else if (res.fromCache) {
        setDataFetchState({
          status: 'cached',
          cacheTimestamp: res.cacheTimestamp,
          error: res.error || 'Connection to Supabase failed. Displaying local offline cache snapshot.'
        });
      } else {
        setDataFetchState({ status: 'live' });
      }
    } catch (err: any) {
      console.warn('Failed to load published tools from Supabase:', err);
      const cached = directoryStorage.getCachedPublishedTools();
      if (cached && cached.tools.length > 0) {
        directoryStorage.setPublishedTools(cached.tools, cached.categories);
        setCategories(directoryStorage.getCategories());
        setDataVersion(v => v + 1);
        setDataFetchState({
          status: 'cached',
          cacheTimestamp: cached.timestamp,
          error: err.message || 'Connection to Supabase failed. Displaying local offline cache snapshot.'
        });
      } else {
        directoryStorage.setPublishedTools([]);
        setCategories(directoryStorage.getCategories());
        setDataVersion(v => v + 1);
        setDataFetchState({
          status: 'error',
          error: err.message || 'Failed to connect to Supabase database.'
        });
      }
    }
  };

  useEffect(() => {
    loadPublishedTools();
  }, []);

  // Listen to browser back/forward and URL changes
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/admin' || hash === '#/admin' || window.location.search.includes('view=admin')) {
        setCurrentView('admin');
      } else if (currentView === 'admin' && path !== '/admin' && hash !== '#/admin') {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [currentView]);

  // Listen to comparison list changes
  const handleToggleCompare = (toolId: string) => {
    if (compareList.includes(toolId)) {
      const updated = directoryStorage.removeFromCompare(toolId);
      setCompareList([...updated]);
    } else {
      if (compareList.length >= 4) {
        alert('You can compare a maximum of 4 tools at once.');
        return;
      }
      const updated = directoryStorage.addToCompare(toolId);
      setCompareList([...updated]);
    }
  };

  const handleClearCompare = () => {
    directoryStorage.clearCompare();
    setCompareList([]);
  };

  // Upvote tool
  const handleUpvote = (toolId: string) => {
    directoryStorage.toggleUpvote(toolId);
    // Force re-query
    setCurrentPage(p => p);
  };

  // Navigation router helper with URL synchronization
  const handleNavigate = (view: string, param?: string) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (view === 'admin') {
      try {
        window.history.pushState(null, '', '/admin');
      } catch {
        window.location.hash = '/admin';
      }
    } else {
      if (window.location.pathname === '/admin' || window.location.hash === '#/admin') {
        try {
          window.history.pushState(null, '', '/');
        } catch {
          window.location.hash = '';
        }
      }
    }

    if (view === 'all-tools') {
      if (param === 'featured') {
        setOnlyFeatured(true);
        setSelectedPricing([]);
        setSelectedCategory('all');
      } else if (param === 'free') {
        setSelectedPricing(['free', 'open_source']);
        setOnlyFeatured(false);
        setSelectedCategory('all');
      } else {
        setOnlyFeatured(false);
        setSelectedPricing([]);
      }
    }
  };

  const handleSelectTool = (tool: Tool) => {
    setSelectedToolSlug(tool.slug);
    directoryStorage.recordToolView(tool.id);
    setCurrentView('tool-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Query paginated tools from Storage Service
  const queryResult = useMemo(() => {
    return directoryStorage.queryTools({
      searchQuery,
      categorySlug: selectedCategory,
      pricingTypes: selectedPricing,
      onlyFeatured,
      onlyVerified,
      sortBy,
      page: currentPage,
      pageSize
    });
  }, [searchQuery, selectedCategory, selectedPricing, onlyFeatured, onlyVerified, sortBy, currentPage, dataVersion]);

  const allTools = useMemo(() => directoryStorage.getAllToolsAdmin(), [currentPage, dataVersion]);

  // Selected Tool for detail view
  const currentTool = useMemo(() => {
    if (!selectedToolSlug) return null;
    return directoryStorage.getToolBySlug(selectedToolSlug) || null;
  }, [selectedToolSlug, allTools, dataVersion]);

  // Tools currently in comparison
  const comparedTools = useMemo(() => {
    return compareList.map(id => directoryStorage.getToolById(id)).filter(Boolean) as Tool[];
  }, [compareList, allTools, dataVersion]);

  // Pricing filter toggle helper
  const togglePricingFilter = (type: PricingType) => {
    setCurrentPage(1);
    setSelectedPricing(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // If inside Admin Console, render dedicated admin view
  if (currentView === 'admin') {
    return (
      <AdminDashboard
        onBackToSite={() => {
          setIsPreviewMode(false);
          handleNavigate('home');
        }}
        onPreviewTool={(tool: Tool) => {
          setSelectedToolSlug(tool.slug);
          setIsPreviewMode(true);
          setCurrentView('tool-detail');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Bar */}
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        compareCount={compareList.length}
        onOpenCompare={() => setIsCompareModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1">
        {/* HOMEPAGE & ALL TOOLS VIEW */}
        {(currentView === 'home' || currentView === 'all-tools') && (
          <div>
            {currentView === 'home' && (
              <Hero
                searchQuery={searchQuery}
                onSearchChange={(q) => {
                  setSearchQuery(q);
                  setCurrentPage(1);
                }}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={(slug) => {
                  setSelectedCategory(slug);
                  setCurrentPage(1);
                }}
                totalToolsCount={queryResult.total}
              />
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              {/* Prominent Offline Cache Warning Banner */}
              {dataFetchState.status === 'cached' && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs uppercase tracking-wider text-amber-800">
                          Offline Cache Mode (نسخة مخبأة محلياً)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                          Snapshot: {dataFetchState.cacheTimestamp ? new Date(dataFetchState.cacheTimestamp).toLocaleString() : 'Saved locally'}
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Direct connection to Supabase failed. Tools displayed are from a local cache snapshot and may not reflect real-time updates.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={loadPublishedTools}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Connection</span>
                  </button>
                </div>
              )}

              {/* Directory Filter Bar & Controls */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 mb-8 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Search input if in all-tools view or filter tags */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mr-2">
                      <Filter className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Pricing Filter:</span>
                    </span>

                    {(['free', 'open_source', 'freemium', 'paid', 'free_trial'] as PricingType[]).map(pt => {
                      const isActive = selectedPricing.includes(pt);
                      return (
                        <button
                          key={pt}
                          onClick={() => togglePricingFilter(pt)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer capitalize ${
                            isActive
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {pt.replace('_', ' ')}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => {
                        setOnlyFeatured(!onlyFeatured);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        onlyFeatured ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Featured Only
                    </button>

                    <button
                      onClick={() => {
                        setOnlyVerified(!onlyVerified);
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        onlyVerified ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Verified Only
                    </button>

                    {(selectedPricing.length > 0 || onlyFeatured || onlyVerified || searchQuery || selectedCategory !== 'all') && (
                      <button
                        onClick={() => {
                          setSelectedPricing([]);
                          setOnlyFeatured(false);
                          setOnlyVerified(false);
                          setSearchQuery('');
                          setSelectedCategory('all');
                          setCurrentPage(1);
                        }}
                        className="text-xs text-rose-600 hover:underline px-2 cursor-pointer font-medium"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  {/* Right: Sort Dropdown, Result Count & Supabase Sync Badge */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {queryResult.total} {queryResult.total === 1 ? 'tool' : 'tools'} listed
                      </span>
                      {dataFetchState.status === 'live' && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Supabase Live</span>
                        </span>
                      )}
                      {dataFetchState.status === 'cached' && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Cached</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          setSortBy(e.target.value as any);
                          setCurrentPage(1);
                        }}
                        className="bg-transparent border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="featured">Featured First</option>
                        <option value="popular">Most Popular</option>
                        <option value="recent">Recently Added</option>
                        <option value="name-asc">Alphabetical (A-Z)</option>
                        <option value="price-asc">Starting Price (Low-High)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* State-Aware Content Area */}
              {dataFetchState.status === 'loading' ? (
                /* LOADING SKELETON STATE */
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Connecting to Supabase and retrieving published tools...</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-slate-200 rounded w-2/3" />
                            <div className="h-3 bg-slate-100 rounded w-1/3" />
                          </div>
                        </div>
                        <div className="space-y-2 pt-2">
                          <div className="h-3 bg-slate-100 rounded w-full" />
                          <div className="h-3 bg-slate-100 rounded w-4/5" />
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div className="h-5 bg-slate-100 rounded w-16" />
                          <div className="h-5 bg-slate-100 rounded w-12" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : dataFetchState.status === 'unconfigured' ? (
                /* UNCONFIGURED DATABASE STATE */
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-lg mx-auto my-8 shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                    <Database className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Supabase Database Connection Required</h3>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    The public AI Tools Directory is configured to read published tools directly from Supabase via PostgreSQL RLS. Connect your Supabase project credentials in the Admin Console or define environment variables.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => handleNavigate('admin')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Open Admin Console</span>
                    </button>
                    <button
                      onClick={loadPublishedTools}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Check Again</span>
                    </button>
                  </div>
                </div>
              ) : dataFetchState.status === 'error' ? (
                /* DATABASE CONNECTION ERROR STATE */
                <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center max-w-lg mx-auto my-8 shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Database Connection Failed</h3>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Unable to retrieve published tools from Supabase. {dataFetchState.error || 'Please check network connectivity or database service availability.'}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={loadPublishedTools}
                      className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Connection</span>
                    </button>
                    <button
                      onClick={() => handleNavigate('admin')}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Admin Console
                    </button>
                  </div>
                </div>
              ) : dataFetchState.status === 'empty' ? (
                /* EMPTY DATABASE STATE */
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-lg mx-auto my-8 shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">No Published Tools in Supabase</h3>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Supabase is connected, but no tools have been set to &quot;published&quot; status yet. You can seed initial tools or publish drafts in the Admin Console.
                  </p>
                  <button
                    onClick={() => handleNavigate('admin')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Open Admin Console
                  </button>
                </div>
              ) : queryResult.tools.length === 0 ? (
                /* SEARCH / FILTER EMPTY STATE */
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto">
                  <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-900 mb-1">No AI Tools Match Your Query</h3>
                  <p className="text-xs text-slate-500 mb-6">
                    Try broadening your search term or clearing active filters to see all verified entries.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedPricing([]);
                      setOnlyFeatured(false);
                      setOnlyVerified(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                /* NORMAL TOOLS GRID */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {queryResult.tools.map(tool => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onSelect={handleSelectTool}
                      onToggleCompare={handleToggleCompare}
                      isCompared={compareList.includes(tool.id)}
                      onUpvote={handleUpvote}
                    />
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              {queryResult.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentPage(p => Math.max(1, p - 1));
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    disabled={currentPage <= 1}
                    className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-mono text-slate-600 px-3 tabular-nums">
                    Page {currentPage} of {queryResult.totalPages}
                  </span>

                  <button
                    onClick={() => {
                      setCurrentPage(p => Math.min(queryResult.totalPages, p + 1));
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    disabled={currentPage >= queryResult.totalPages}
                    className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CATEGORIES TAXONOMY VIEW */}
        {currentView === 'categories' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="max-w-2xl mb-10">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
                AI Software Categories
              </h1>
              <p className="text-xs sm:text-sm text-slate-600">
                Explore tools organized by technological capability, workflow domain, and deployment model.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.slug);
                    setCurrentView('all-tools');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="group bg-white rounded-xl border border-slate-200 hover:border-indigo-400 p-6 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {cat.name}
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {cat.tool_count || 0} tools
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {cat.description}
                  </p>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-semibold">
                    <span>Browse Category</span>
                    <span>→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOOL DETAIL VIEW */}
        {currentView === 'tool-detail' && currentTool && (
          <ToolDetailView
            tool={currentTool}
            onBack={() => {
              if (isPreviewMode) {
                setIsPreviewMode(false);
                handleNavigate('admin');
              } else {
                setCurrentView('all-tools');
              }
            }}
            onSelectAlternative={(slug) => {
              setSelectedToolSlug(slug);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onToggleCompare={handleToggleCompare}
            isCompared={compareList.includes(currentTool.id)}
            onUpvote={handleUpvote}
            allTools={allTools}
            isPreviewMode={isPreviewMode}
          />
        )}

        {/* SUBMIT TOOL VIEW */}
        {currentView === 'submit' && (
          <SubmitToolView
            categories={categories}
            onBack={() => setCurrentView('home')}
          />
        )}

        {/* BLOG & GUIDES VIEW */}
        {currentView === 'blog' && (
          <BlogView
            selectedArticleSlug={selectedBlogSlug}
            onNavigateArticle={(slug) => setSelectedBlogSlug(slug)}
            onSelectTool={(slug) => {
              setSelectedToolSlug(slug);
              setCurrentView('tool-detail');
            }}
          />
        )}

        {/* STATIC PAGES */}
        {['about', 'contact', 'privacy', 'terms', 'affiliate-disclosure', 'advertise'].includes(currentView) && (
          <StaticPages
            pageId={currentView as any}
            onNavigate={handleNavigate}
          />
        )}
      </div>

      {/* Floating Compare Notification Bar if items in compare */}
      {compareList.length > 0 && !isCompareModalOpen && currentView !== 'admin' && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-4 border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 text-xs">
            <Scale className="w-4 h-4 text-indigo-400" />
            <span><strong>{compareList.length}</strong> {compareList.length === 1 ? 'tool' : 'tools'} selected for comparison</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCompareModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
            >
              Compare Side-by-Side
            </button>
            <button
              onClick={handleClearCompare}
              className="text-xs text-slate-400 hover:text-white px-2 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Comparison Matrix Modal */}
      <ComparisonDrawer
        comparedTools={comparedTools}
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        onRemoveTool={handleToggleCompare}
        onClearAll={handleClearCompare}
        onSelectTool={handleSelectTool}
      />

      {/* Footer */}
      {currentView !== 'admin' && <Footer onNavigate={handleNavigate} />}
    </div>
  );
}
