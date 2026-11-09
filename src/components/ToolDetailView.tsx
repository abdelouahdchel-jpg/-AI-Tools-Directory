import React from 'react';
import {
  ExternalLink,
  ShieldCheck,
  Calendar,
  Check,
  Scale,
  ThumbsUp,
  ArrowLeft,
  DollarSign,
  Layers,
  FileText
} from 'lucide-react';
import { Tool } from '../types/database';
import { ToolLogo } from './ToolLogo';

interface ToolDetailViewProps {
  tool: Tool;
  onBack: () => void;
  onSelectAlternative: (toolSlug: string) => void;
  onToggleCompare: (toolId: string) => void;
  isCompared: boolean;
  onUpvote: (toolId: string) => void;
  allTools: Tool[];
  isPreviewMode?: boolean;
}

export const ToolDetailView: React.FC<ToolDetailViewProps> = ({
  tool,
  onBack,
  onSelectAlternative,
  onToggleCompare,
  isCompared,
  onUpvote,
  allTools,
  isPreviewMode = false
}) => {
  const primaryCategory = tool.categories[0]?.name || 'Artificial Intelligence';

  // Find alternative tools
  const alternatives = allTools.filter(t => 
    tool.alternatives?.includes(t.id) || tool.alternatives?.includes(t.slug)
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Administrator Preview Mode Notice Banner */}
      {isPreviewMode && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-4 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-amber-800">
                  Administrator Preview Mode
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                  tool.publication_status === 'published'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : tool.publication_status === 'draft'
                    ? 'bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  Status: {tool.publication_status}
                </span>
              </div>
              <p className="text-xs text-amber-700 mt-0.5">
                Viewing public detail presentation for {tool.name}. Status remains unmodified and draft tools are not publicly listed.
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Exit Preview
          </button>
        </div>
      )}
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6">
        <button
          onClick={onBack}
          className="hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Directory</span>
        </button>
        <span aria-hidden="true">/</span>
        <span>{primaryCategory}</span>
        <span aria-hidden="true">/</span>
        <span className="text-slate-800 font-medium">{tool.name}</span>
      </nav>

      {/* Main Tool Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <ToolLogo
              slug={tool.slug}
              name={tool.name}
              logoUrl={tool.logo_url}
              domain={tool.normalized_domain}
              className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center p-2 shrink-0"
              iconClassName="w-10 h-10"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {tool.name}
                </h1>
                {tool.verification_status === 'verified' && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified Official
                  </span>
                )}
                {tool.featured && (
                  <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Featured
                  </span>
                )}
              </div>

              {/* Unboxed metadata row */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{primaryCategory}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize font-mono">{tool.pricing_type.replace('_', ' ')}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{tool.starting_price > 0 ? `From $${tool.starting_price}/mo` : 'Free Tier Available'}</span>
                {tool.last_verified_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Verified {new Date(tool.last_verified_at).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onUpvote(tool.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="font-mono tabular-nums">{tool.upvotes || 0}</span>
            </button>

            <button
              onClick={() => onToggleCompare(tool.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer border ${
                isCompared
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{isCompared ? 'Comparing' : 'Compare'}</span>
            </button>

            <a
              href={tool.affiliate_url || tool.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-sm"
            >
              <span>Visit Official Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Short summary */}
        <p className="mt-6 text-sm sm:text-base text-slate-700 leading-relaxed border-t border-slate-100 pt-6">
          {tool.short_description}
        </p>
      </div>

      {/* Grid: Left Column (Full description + Pricing Plans + Features) & Right Column (Specs & Alternatives) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Full Editorial Overview */}
          <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Comprehensive Editorial Overview</span>
            </h2>
            <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-4">
              <p>{tool.full_description}</p>
            </div>
          </section>

          {/* Pricing Plans Breakdown */}
          {tool.pricing_plans && tool.pricing_plans.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                <span>Verified Pricing Tiers</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tool.pricing_plans.map(plan => (
                  <div key={plan.id} className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-sm text-slate-900">{plan.plan_name}</h3>
                        <span className="font-mono font-bold text-sm text-indigo-600">
                          {plan.price > 0 ? `$${plan.price}/mo` : 'Free'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-3">{plan.description}</p>
                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-1.5 mb-3">
                          {plan.features.map((feat, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Features Checklist */}
          {tool.features && tool.features.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Key Capabilities</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tool.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-medium">{feat}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Sidebar: Metadata Specs & Alternatives */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Technical Specifications
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Normalized Domain</span>
                <span className="font-mono text-slate-800">{tool.normalized_domain}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">License Type</span>
                <span className="text-slate-800">{tool.source_license || 'Commercial Proprietary'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Data Attribution</span>
                <span className="text-slate-800">{tool.source_attribution || 'Direct Official Source'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Editorial Verification</span>
                <span className="capitalize text-slate-800">{tool.verification_status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Publication State</span>
                <span className="capitalize text-slate-800">{tool.publication_status}</span>
              </div>
            </div>
          </div>

          {/* Alternatives Card */}
          {alternatives.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                Related Alternatives
              </h3>
              <div className="space-y-2.5">
                {alternatives.map(alt => (
                  <button
                    key={alt.id}
                    onClick={() => onSelectAlternative(alt.slug)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ToolLogo
                        slug={alt.slug}
                        name={alt.name}
                        logoUrl={alt.logo_url}
                        domain={alt.normalized_domain}
                        className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0"
                        iconClassName="w-4 h-4"
                      />
                      <div>
                        <span className="font-semibold text-xs text-slate-800 block">{alt.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono capitalize">{alt.pricing_type}</span>
                      </div>
                    </div>
                    <span className="text-xs text-indigo-600 font-medium">View</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
