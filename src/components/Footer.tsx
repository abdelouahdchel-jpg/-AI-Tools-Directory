import React from 'react';

interface FooterProps {
  onNavigate: (view: string, param?: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-20 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Column 1: Identity & Editorial Mission */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                AI
              </div>
              <span className="font-bold text-slate-900 tracking-tight">AI Tools Directory</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mb-4">
              An independent, verified directory of artificial intelligence tools, models, and workflows. Zero fabricated ratings, transparent pricing, and strict editorial attribution.
            </p>
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} AI Tools Directory. All rights reserved.
            </p>
          </div>

          {/* Column 2: Directory Navigation */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Explore</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <button onClick={() => onNavigate('all-tools')} className="hover:text-indigo-600 cursor-pointer">
                  All AI Tools
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('categories')} className="hover:text-indigo-600 cursor-pointer">
                  Browse by Category
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('all-tools', 'featured')} className="hover:text-indigo-600 cursor-pointer">
                  Featured Software
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('all-tools', 'free')} className="hover:text-indigo-600 cursor-pointer">
                  Free & Open Source
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('blog')} className="hover:text-indigo-600 cursor-pointer">
                  Editorial Guides & Blog
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Commercial & Partnerships */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Partnerships</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <button onClick={() => onNavigate('submit')} className="hover:text-indigo-600 cursor-pointer">
                  Submit a Tool
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('advertise')} className="hover:text-indigo-600 cursor-pointer">
                  Advertise With Us
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('affiliate-disclosure')} className="hover:text-indigo-600 cursor-pointer">
                  Affiliate Disclosure
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('admin')} className="hover:text-indigo-600 cursor-pointer">
                  Administrator Portal
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Trust, Safety & Legal */}
          <div>
            <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Trust & Legal</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-indigo-600 cursor-pointer">
                  About Our Research
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-indigo-600 cursor-pointer">
                  Contact Editorial Staff
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('privacy')} className="hover:text-indigo-600 cursor-pointer">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('terms')} className="hover:text-indigo-600 cursor-pointer">
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Affiliate & Legal Notice Bar */}
        <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            Notice: Some outbound links may contain affiliate tracking codes that generate editorial commissions at no additional cost to you.
          </p>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[11px] text-slate-400">PostgreSQL Schema v1.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
