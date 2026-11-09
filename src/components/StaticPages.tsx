import React, { useState } from 'react';
import { ShieldCheck, Mail, CheckCircle2, AlertCircle } from 'lucide-react';

interface StaticPageProps {
  pageId: 'about' | 'contact' | 'privacy' | 'terms' | 'affiliate-disclosure' | 'advertise';
  onNavigate: (view: string) => void;
}

export const StaticPages: React.FC<StaticPageProps> = ({ pageId, onNavigate }) => {
  // Contact & Advertise form states
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
  };

  if (pageId === 'about') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">
          About AI Tools Directory
        </h1>
        <div className="prose text-sm text-slate-600 leading-relaxed space-y-5">
          <p>
            AI Tools Directory is an independent directory of artificial intelligence software, models, developer tools, and workflow platforms. Our goal is to help users discover and compare AI tools through clear descriptions, transparent pricing information, and reliable source attribution.
          </p>

          <h2 className="text-lg font-bold text-slate-900 pt-3">Our Core Principles</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Fabricated Reviews or Ratings</h3>
              <p>
                We do not invent user reviews, aggregate ratings, popularity figures, or usage statistics. Information is presented based on available sources, not fabricated engagement metrics.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Transparent Verification</h3>
              <p>
                We distinguish between website availability checks and editorial verification. A successful website check confirms that an official website is reachable; it does not automatically confirm every product feature, pricing detail, or technical claim. Editorial verification requires reviewing relevant official sources.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Independent Editorial Policy</h3>
              <p>
                Affiliate links and paid sponsorships do not determine organic search rankings or editorial conclusions. Sponsored placements, when available, are clearly identified.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Source Attribution</h3>
              <p>
                We aim to identify official websites and relevant documentation as sources for tool information. Information may change, so users should consult the provider&apos;s official website for the latest features, terms, and pricing.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Scale and Performance</h3>
              <p>
                Our directory uses a structured database designed to organize and index a growing catalog of AI tools efficiently.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pageId === 'contact') {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Contact Editorial Staff
        </h1>
        <p className="text-xs text-slate-600 mb-8">
          Questions regarding data verification, corrections to listed tool specifications, or press inquiries.
        </p>

        {contactSent ? (
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h3 className="font-bold text-slate-900 text-sm mb-1">Message Sent</h3>
            <p className="text-xs text-slate-600">
              Thank you for contacting our team. An editor will review your inquiry within 2 business days.
            </p>
          </div>
        ) : (
          <form onSubmit={handleContactSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Name</label>
              <input
                type="text"
                required
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Email</label>
              <input
                type="email"
                required
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={contactMessage}
                onChange={e => setContactMessage(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
            >
              Send Message
            </button>
          </form>
        )}
      </div>
    );
  }

  if (pageId === 'affiliate-disclosure') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">
          Affiliate & Commercial Disclosure
        </h1>
        <div className="prose text-sm text-slate-600 leading-relaxed space-y-4">
          <p>
            In compliance with FTC guidelines and international transparency standards, please note that AI Tools Directory participates in various affiliate marketing programs.
          </p>
          <p>
            This means that when you click on certain outbound links to software vendors and purchase a subscription or license, we may receive a commission at no additional cost to you.
          </p>
          <h2 className="text-lg font-bold text-slate-900 pt-3">Editorial Guarantee</h2>
          <p>
            Affiliate compensation does not influence our evaluation criteria, inclusion decisions, or feature descriptions. Tools without affiliate programs receive identical objective coverage as tools with affiliate agreements. All tools undergo the exact same verification pipeline.
          </p>
        </div>
      </div>
    );
  }

  if (pageId === 'advertise') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Advertise With Us
        </h1>
        <p className="text-xs text-slate-600 mb-8">
          Reach developers, founders, researchers, and creative professionals looking for AI solutions.
        </p>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-sm font-bold text-slate-900">Sponsored Placements & Featured Listings</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            We offer transparent, clearly-labeled sponsored listings. All sponsored tools must pass our standard technical verification before any placement is approved. We never accept unlabelled promotional placements or covert endorsements.
          </p>
          <div className="p-4 bg-slate-50 rounded-lg text-xs space-y-2 border border-slate-100">
            <div className="font-semibold text-slate-800">Placement Options:</div>
            <div>• <strong>Featured Directory Slot:</strong> Pinned to top of relevant category with explicit "Featured" label.</div>
            <div>• <strong>Category Spotlight:</strong> High-visibility header mention on specific category index.</div>
          </div>
          <div>
            <button
              onClick={() => onNavigate('contact')}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
            >
              Submit Advertising Inquiry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pageId === 'privacy') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Privacy Policy</h1>
        <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-4">
          <p>Last updated: October 2026</p>
          <p>
            AI Tools Directory respects your privacy. We do not sell user personal information to third parties. We collect minimal telemetry strictly necessary to maintain search relevance and prevent malicious bulk abuse.
          </p>
          <h2 className="text-base font-bold text-slate-900 pt-2">Data We Collect</h2>
          <p>
            When submitting a tool, we collect the submitter's email address solely for moderation communications. When browsing the directory, anonymous search query keywords are aggregated to improve category indexing.
          </p>
        </div>
      </div>
    );
  }

  // Terms of Service
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-4">Terms of Service</h1>
      <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-4">
        <p>Last updated: October 2026</p>
        <p>
          By accessing AI Tools Directory, you agree to comply with all applicable copyright and trademark laws. Product names and logos are trademarks of their respective owners.
        </p>
        <p>
          Automated scraping of our directory records without written authorization is prohibited. Bulk import datasets must follow authorized licenses and explicit source attribution.
        </p>
      </div>
    </div>
  );
};
