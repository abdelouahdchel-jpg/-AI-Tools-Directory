import React from 'react';
import { X, Scale, ExternalLink, Check, Minus } from 'lucide-react';
import { Tool } from '../types/database';
import { ToolLogo } from './ToolLogo';

interface ComparisonDrawerProps {
  comparedTools: Tool[];
  isOpen: boolean;
  onClose: () => void;
  onRemoveTool: (toolId: string) => void;
  onClearAll: () => void;
  onSelectTool: (tool: Tool) => void;
}

export const ComparisonDrawer: React.FC<ComparisonDrawerProps> = ({
  comparedTools,
  isOpen,
  onClose,
  onRemoveTool,
  onClearAll,
  onSelectTool
}) => {
  if (!isOpen || comparedTools.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <Scale className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Tool Comparison Matrix ({comparedTools.length} selected)
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClearAll}
              className="text-xs text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              Clear all
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Comparison Table Viewport */}
        <div className="overflow-x-auto p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                  Feature / Spec
                </th>
                {comparedTools.map(t => (
                  <th key={t.id} className="py-3 px-4 text-left w-1/4 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ToolLogo
                          slug={t.slug}
                          name={t.name}
                          logoUrl={t.logo_url}
                          domain={t.normalized_domain}
                          className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0"
                          iconClassName="w-4 h-4"
                        />
                        <button
                          onClick={() => {
                            onSelectTool(t);
                            onClose();
                          }}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-600 cursor-pointer"
                        >
                          {t.name}
                        </button>
                      </div>
                      <button
                        onClick={() => onRemoveTool(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove tool from comparison"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {/* Category */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">Category</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4 text-slate-800">
                    {t.categories.map(c => c.name).join(', ')}
                  </td>
                ))}
              </tr>

              {/* Pricing Type */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">Pricing Model</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4 font-mono font-medium capitalize text-slate-800">
                    {t.pricing_type.replace('_', ' ')}
                  </td>
                ))}
              </tr>

              {/* Starting Price */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">Starting Price</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4 font-mono font-semibold text-slate-900">
                    {t.starting_price !== null && t.starting_price > 0
                      ? `$${t.starting_price.toFixed(2)} / month`
                      : t.starting_price === 0
                      ? 'Free ($0.00)'
                      : 'Unlisted'}
                  </td>
                ))}
              </tr>

              {/* Verification Status */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">Editorial Status</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4">
                    <span className="capitalize text-slate-700">
                      {t.verification_status}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Core Features */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500 align-top">Core Capabilities</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4 align-top">
                    {t.features && t.features.length > 0 ? (
                      <ul className="space-y-1">
                        {t.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-slate-600">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-400">See full overview</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* License & Source */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">License / Origin</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4 text-slate-600">
                    {t.source_license || 'Commercial Proprietary'}
                  </td>
                ))}
              </tr>

              {/* Action Button */}
              <tr>
                <td className="py-3 px-4 font-medium text-slate-500">Action</td>
                {comparedTools.map(t => (
                  <td key={t.id} className="py-3 px-4">
                    <a
                      href={t.affiliate_url || t.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                      <span>Visit Site</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
