import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { Category, PricingType } from '../types/database';
import { directoryStorage } from '../services/storage';
import { PublicSubmissionSchema } from '../lib/validation';

interface SubmitToolViewProps {
  categories: Category[];
  onBack: () => void;
}

export const SubmitToolView: React.FC<SubmitToolViewProps> = ({ categories, onBack }) => {
  const [toolName, setToolName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [description, setDescription] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('freemium');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [sourceInformation, setSourceInformation] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const formData = {
      tool_name: toolName.trim(),
      website_url: websiteUrl.trim(),
      submitter_email: submitterEmail.trim(),
      description: description.trim(),
      pricing_type: pricingType,
      category_id: categoryId,
      source_information: sourceInformation.trim()
    };

    const validation = PublicSubmissionSchema.safeParse(formData);

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach(issue => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0].toString()] = issue.message;
        }
      });
      setErrors(fieldErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      directoryStorage.submitTool(formData);
      setIsSubmitted(true);
    } catch {
      setErrors({ form: 'An error occurred while saving your submission. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Submission Received</h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Thank you for submitting <strong>{toolName}</strong>. To maintain high catalog accuracy, all submissions undergo human editorial verification before publication. Public submissions are never automatically published.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              setIsSubmitted(false);
              setToolName('');
              setWebsiteUrl('');
              setDescription('');
              setSourceInformation('');
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
          >
            Submit Another Tool
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
          >
            Return to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Submit an AI Tool
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          Suggest a software tool or open-source model to be cataloged. Our editorial team reviews official sources, licensing terms, and pricing integrity prior to listing.
        </p>
      </div>

      {/* Editorial Notice Banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl mb-6 text-xs text-indigo-900">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block mb-0.5">Editorial Integrity Policy:</span>
          We do not publish duplicate entries, unverified claims, or tools lacking functional websites. All submissions enter a draft moderation queue.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
        {errors.form && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Tool or Service Name *
          </label>
          <input
            type="text"
            required
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="e.g. Claude, Cursor, Runway"
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {errors.tool_name && <p className="text-[11px] text-rose-600 mt-1">{errors.tool_name}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Official Website URL *
          </label>
          <input
            type="url"
            required
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {errors.website_url && <p className="text-[11px] text-rose-600 mt-1">{errors.website_url}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Primary Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Pricing Model
            </label>
            <select
              value={pricingType}
              onChange={(e) => setPricingType(e.target.value as PricingType)}
              className="w-full px-3 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="free">Free ($0.00)</option>
              <option value="freemium">Freemium (Free tier + paid upgrades)</option>
              <option value="paid">Paid Subscription</option>
              <option value="free_trial">Free Trial Available</option>
              <option value="open_source">Open Source</option>
              <option value="unknown">Unknown / Contact Sales</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Submitter Email (for editorial follow-up) *
          </label>
          <input
            type="email"
            required
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {errors.submitter_email && <p className="text-[11px] text-rose-600 mt-1">{errors.submitter_email}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Tool Description & Capabilities *
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Summarize what problem the tool solves, key features, and target audience (at least 30 characters)..."
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {errors.description && <p className="text-[11px] text-rose-600 mt-1">{errors.description}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Source & Documentation Links (Optional)
          </label>
          <input
            type="text"
            value={sourceInformation}
            onChange={(e) => setSourceInformation(e.target.value)}
            placeholder="e.g. GitHub repo URL, documentation, or public press release"
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Validating...' : 'Submit Tool for Review'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
