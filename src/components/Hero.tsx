import React from 'react';
import { Search, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Category } from '../types/database';

interface HeroProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
  totalToolsCount: number;
}

export const Hero: React.FC<HeroProps> = ({
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onSelectCategory,
  totalToolsCount
}) => {
  return (
    <div className="relative bg-gradient-to-b from-indigo-50/50 via-slate-50 to-slate-50 border-b border-slate-200/80 py-12 md:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {/* Subtle trust kicker (not a pill badge) */}
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Curated & Verified Software Index</span>
        </div>

        {/* Headline with text-wrap: balance */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4 text-balance">
          Discover the Right AI Tools for Your Workflow
        </h1>

        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
          Comprehensive directory of verified artificial intelligence software, models, and platforms. Compare real pricing, feature limits, and commercial licenses without fake metrics.
        </p>

        {/* Real-time search bar */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative flex items-center shadow-sm rounded-xl bg-white border border-slate-200 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <Search className="w-5 h-5 text-slate-400 ml-4 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by name, capability (e.g. voice cloning, code, video), or model..."
              className="w-full px-3 py-3.5 text-sm text-slate-900 placeholder-slate-400 bg-transparent focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-3 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Segmented Category Filter Bar (interactive functional buttons) */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-3xl mx-auto">
          <button
            onClick={() => onSelectCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Software ({totalToolsCount})
          </button>
          {categories.slice(0, 6).map(cat => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.slug)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
