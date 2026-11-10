import React from 'react';
import { ExternalLink, Check, Scale, ThumbsUp, ShieldCheck } from 'lucide-react';
import { Tool } from '../types/database';
import { ToolLogo } from './ToolLogo';

interface ToolCardProps {
  tool: Tool;
  onSelect: (tool: Tool) => void;
  onToggleCompare: (toolId: string) => void;
  isCompared: boolean;
  onUpvote: (toolId: string) => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  onSelect,
  onToggleCompare,
  isCompared,
  onUpvote
}) => {
  const primaryCategory = tool.categories[0]?.name || 'Artificial Intelligence';

  // Format pricing display cleanly
  const formatPricing = () => {
    switch (tool.pricing_type) {
      case 'free':
        return 'Free';
      case 'open_source':
        return 'Open Source';
      case 'freemium':
        return tool.starting_price !== null && tool.starting_price > 0 ? `Freemium (from $${tool.starting_price}/mo)` : 'Freemium';
      case 'paid':
        return tool.starting_price !== null ? `Paid (from $${tool.starting_price}/mo)` : 'Paid';
      case 'free_trial':
        return 'Free Trial';
      default:
        return 'Contact for Pricing';
    }
  };

  return (
    <div className="group relative flex flex-col justify-between bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all p-5">
      <div>
        {/* Top bar inside card: Logo, Name, Verification, Compare toggle */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <ToolLogo
              slug={tool.slug}
              name={tool.name}
              logoUrl={tool.logo_url}
              domain={tool.normalized_domain}
              className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0"
              iconClassName="w-6 h-6"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onSelect(tool)}
                  className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors text-left cursor-pointer"
                >
                  {tool.name}
                </button>
                {tool.verification_status === 'verified' && (
                  <span title="Verified Official Listing" className="text-emerald-600 flex items-center">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                )}
                {tool.featured && (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    Featured
                  </span>
                )}
              </div>
              {/* Unboxed metadata line with typographic separators (anti-slop rule) */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                <span>{primaryCategory}</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono text-[11px] text-slate-600">{formatPricing()}</span>
              </div>
            </div>
          </div>

          {/* Compare toggle button */}
          <button
            onClick={() => onToggleCompare(tool.id)}
            title={isCompared ? 'Remove from comparison' : 'Compare with other tools'}
            className={`p-1.5 rounded text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              isCompared
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Short description */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-4">
          {tool.short_description}
        </p>

        {/* Feature bullets if available (unboxed text) */}
        {tool.features && tool.features.length > 0 && (
          <div className="space-y-1 mb-4">
            {tool.features.slice(0, 2).map((feat, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{feat}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card Action Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
        {/* Upvotes counter with tabular figures */}
        <button
          onClick={() => onUpvote(tool.id)}
          className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded transition-colors cursor-pointer"
          title="Upvote tool"
        >
          <ThumbsUp className="w-3 h-3" />
          <span className="font-mono tabular-nums text-[11px]">{tool.upvotes || 0}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(tool)}
            className="text-xs font-medium text-slate-600 hover:text-indigo-600 cursor-pointer"
          >
            View Details
          </button>
          <a
            href={tool.affiliate_url || tool.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            <span>Visit</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </div>
      </div>
    </div>
  );
};
