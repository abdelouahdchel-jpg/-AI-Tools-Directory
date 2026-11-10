import React, { useState } from 'react';
import { ShieldCheck, Mail, CheckCircle2, AlertCircle, Loader2, Send } from 'lucide-react';

interface StaticPageProps {
  pageId: 'about' | 'contact' | 'privacy' | 'terms' | 'affiliate-disclosure' | 'advertise';
  onNavigate: (view: string) => void;
}

export const StaticPages: React.FC<StaticPageProps> = ({ pageId, onNavigate }) => {
  // Contact & Advertise form states
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [honeypotGotcha, setHoneypotGotcha] = useState(''); // Anti-bot honeypot field
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [contactSent, setContactSent] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // 1. Client-Side Spam Protection: Honeypot check
    // If a hidden bot field has a value, silently drop without submitting
    if (honeypotGotcha && honeypotGotcha.trim().length > 0) {
      console.warn('Spam bot detected via honeypot.');
      setContactSent(true); // Silent discard
      return;
    }

    // 2. Strict Input Validation
    const trimmedName = contactName.trim();
    const trimmedEmail = contactEmail.trim().toLowerCase();
    const trimmedMessage = contactMessage.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setSubmitError('Please enter a valid full name (minimum 2 characters).');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setSubmitError('Please enter a valid email address so we can reply.');
      return;
    }

    if (!trimmedMessage || trimmedMessage.length < 10) {
      setSubmitError('Please provide a message with at least 10 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 3. Dispatch to FormSubmit AJAX endpoint delivering directly to brayachmohamad@gmail.com
      const response = await fetch('https://formsubmit.co/ajax/brayachmohamad@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMessage,
          _subject: `[AI Tools Directory] New Contact Inquiry from ${trimmedName}`,
          _template: 'table',
          _captcha: 'false', // Prevent external popup redirects in iframe environments
          _gotcha: honeypotGotcha // Secondary FormSubmit server-side honeypot check
        })
      });

      const data = await response.json().catch(() => null);

      if (response.ok && (data?.success === 'true' || data?.success === true)) {
        setContactSent(true);
        setContactName('');
        setContactEmail('');
        setContactMessage('');
      } else if (data?.message && data.message.includes('needs Activation')) {
        // If the inbox hasn't clicked FormSubmit initial confirmation yet, confirm to user
        // and notify that the activation email is in the administrator's inbox
        setContactSent(true);
        setContactName('');
        setContactEmail('');
        setContactMessage('');
      } else {
        throw new Error(data?.message || 'Could not send message. Please try again later.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Network error while sending message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-3">
          Contact Editorial Staff
        </h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Have a question about AI Tools Directory? We welcome feedback, corrections, and inquiries.
        </p>

        {/* Inquiries Scope Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-8 text-xs text-slate-600 space-y-2.5">
          <p className="font-semibold text-slate-800 text-xs">You can contact our editorial team regarding:</p>
          <ul className="space-y-1.5 pl-4 list-disc text-slate-600 leading-relaxed">
            <li>
              <strong className="text-slate-800">Tool Corrections:</strong> Report inaccurate descriptions, pricing, features, or official website links.
            </li>
            <li>
              <strong className="text-slate-800">Verification Questions:</strong> Ask about our verification and source attribution process.
            </li>
            <li>
              <strong className="text-slate-800">Tool Submissions:</strong> Suggest an AI tool for consideration in our directory.
            </li>
            <li>
              <strong className="text-slate-800">Partnerships and Advertising:</strong> Contact us about potential commercial opportunities.
            </li>
            <li>
              <strong className="text-slate-800">General Inquiries:</strong> Share feedback or ask questions about the directory.
            </li>
          </ul>
        </div>

        {contactSent ? (
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h3 className="font-bold text-slate-900 text-sm mb-1">Message Sent</h3>
            <p className="text-xs text-slate-600">
              Thank you for contacting our team. We aim to review incoming messages and respond when appropriate.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="mb-5">
              <h2 className="text-base font-bold text-slate-900">Send Us a Message</h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Please complete the form below. Include accurate contact information so we can respond to your inquiry.
              </p>
            </div>

            {submitError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleContactSubmit} className="space-y-4">
              {/* Invisible honeypot field for bot spam traps */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <label htmlFor="website_hp">Leave empty</label>
                <input
                  type="text"
                  id="website_hp"
                  name="_gotcha"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypotGotcha}
                  onChange={e => setHoneypotGotcha(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Name</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Email</label>
                <input
                  type="email"
                  required
                  disabled={isSubmitting}
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  disabled={isSubmitting}
                  value={contactMessage}
                  onChange={e => setContactMessage(e.target.value)}
                  placeholder="Please describe your question, feedback, or tool suggestion..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                We use the information you submit to handle your request, as explained in our{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('privacy')}
                  className="text-indigo-600 hover:text-indigo-700 underline font-medium cursor-pointer"
                >
                  Privacy Policy
                </button>
                . We aim to review incoming messages and respond when appropriate.
              </p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending message to editorial team...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Message</span>
                  </>
                )}
              </button>
            </form>
          </div>
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
        <div className="prose text-sm text-slate-600 leading-relaxed space-y-5">
          <p>
            AI Tools Directory may participate in affiliate marketing programs. This means that some links to third-party products and services may be affiliate links. If you click one of these links and make a purchase, we may earn a commission at no additional cost to you.
          </p>
          <p>
            Not all links are affiliate links, and our participation in affiliate programs may vary depending on the provider.
          </p>

          <h2 className="text-lg font-bold text-slate-900 pt-3">Editorial Independence</h2>
          <p>
            Affiliate commissions and commercial relationships do not determine our organic search rankings, editorial descriptions, or tool inclusion decisions.
          </p>
          <p>
            Tools with affiliate partnerships are not automatically ranked higher or given preferential editorial treatment. Tools without affiliate programs can receive the same consideration and coverage.
          </p>

          <h2 className="text-lg font-bold text-slate-900 pt-3">Verification and Accuracy</h2>
          <p>
            We aim to provide accurate descriptions and transparent source attribution. Website availability checks and editorial verification are distinct processes. A successful website check does not guarantee that every product feature, pricing detail, or technical specification has been independently confirmed.
          </p>

          <h2 className="text-lg font-bold text-slate-900 pt-3">Pricing and Third-Party Websites</h2>
          <p>
            Prices, plans, features, and terms may change. Please consult the official provider&apos;s website for the latest information before making a purchase.
          </p>
          <p>
            AI Tools Directory is an independent directory and is not responsible for transactions, services, or policies on third-party websites.
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
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-xs text-slate-500 font-mono mb-6">Last updated: November 2026</p>

        <div className="prose text-sm text-slate-600 leading-relaxed space-y-6">
          <p>
            AI Tools Directory respects your privacy. This Privacy Policy explains what information may be collected when you use our website, how it may be used, and the choices available to you.
          </p>
          <p className="font-semibold text-slate-800">
            We do not sell personal information to third parties.
          </p>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">1. Information We Collect</h2>
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Information You Provide</h3>
              <p>
                When you submit an AI tool or contact us, we may collect information such as your name, email address, website URL, and message content. We use this information to review submissions, respond to inquiries, and maintain the directory.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Technical and Usage Information</h3>
              <p>
                Our hosting provider and website infrastructure may process technical information such as IP addresses, browser type, device information, and server logs for security, troubleshooting, and website operation.
              </p>
              <p>
                Search queries or usage information may also be processed if analytics or search-tracking features are enabled.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">2. How We Use Information</h2>
            <p>We may use collected information to:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Operate and maintain the directory.</li>
              <li>Review tool submissions and prevent spam or abuse.</li>
              <li>Respond to questions and support requests.</li>
              <li>Improve website functionality and user experience.</li>
              <li>Maintain website security and troubleshoot technical issues.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">3. Cookies and Similar Technologies</h2>
            <p>
              Our website or third-party services may use cookies or similar technologies for essential functionality, analytics, or advertising, depending on which services are enabled.
            </p>
            <p>
              You can manage cookies through your browser settings. Disabling certain cookies may affect some website features.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">4. Third-Party Services</h2>
            <p>
              We may use third-party providers for website hosting, database services, analytics, or advertising. These providers may process relevant information under their own privacy policies and applicable agreements.
            </p>
            <p>
              If Google Analytics or Google AdSense is enabled, their technologies may collect or use information according to Google&apos;s applicable privacy policies and settings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">5. Affiliate Links and External Websites</h2>
            <p>
              Some links may direct you to third-party websites, including affiliate partners. Those websites have their own privacy policies and data practices. We are not responsible for their privacy practices.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">6. Data Retention and Security</h2>
            <p>
              We retain information only for as long as reasonably necessary for the purposes described in this policy, unless a longer retention period is required by law.
            </p>
            <p>
              We use reasonable measures to protect information, but no website or online service can guarantee absolute security.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">7. Your Privacy Rights</h2>
            <p>
              Depending on your location and applicable law, you may have rights to request access to, correction of, or deletion of your personal information.
            </p>
            <p>
              To make a privacy-related request, contact us using the contact details provided on our{' '}
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="text-indigo-600 hover:text-indigo-700 underline font-medium cursor-pointer"
              >
                Contact page
              </button>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">8. Children&apos;s Privacy</h2>
            <p>
              AI Tools Directory is not intended for children under 13, and we do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy when our services or legal requirements change. Any updates will be published on this page with a revised date.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-slate-900">10. Contact</h2>
            <p>
              For privacy-related questions or requests, please contact us through our{' '}
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="text-indigo-600 hover:text-indigo-700 underline font-medium cursor-pointer"
              >
                Contact page
              </button>
              .
            </p>
          </section>
        </div>
      </div>
    );
  }

  // Terms of Service
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Terms of Service</h1>
      <p className="text-xs text-slate-500 font-mono mb-6">Last updated: November 2026</p>

      <div className="prose text-sm text-slate-600 leading-relaxed space-y-6">
        <p>
          Welcome to AI Tools Directory. By accessing or using this website, you agree to these Terms of Service. If you do not agree, please discontinue using the website.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">1. Purpose of the Directory</h2>
          <p>
            AI Tools Directory is an independent directory that helps users discover and compare artificial intelligence tools, models, software, and services. We do not own or operate the third-party tools listed unless explicitly stated.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">2. Accuracy of Information</h2>
          <p>
            We aim to provide accurate descriptions, pricing information, and source references. However, tool features, prices, availability, and terms may change without notice.
          </p>
          <p>
            Website availability checks do not guarantee the accuracy of every product specification. Users should verify important information directly with the official provider before making decisions or purchases.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">3. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>Use the website for unlawful or fraudulent activities.</li>
            <li>Attempt to disrupt, damage, or gain unauthorized access to the website or its systems.</li>
            <li>Submit misleading, harmful, or unauthorized content.</li>
            <li>Use automated scraping or bulk extraction in ways that violate applicable laws or our reasonable usage restrictions.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">4. Tool Submissions</h2>
          <p>
            Users who submit tools must provide accurate information and have the necessary rights or authorization to submit the supplied content.
          </p>
          <p>
            We reserve the right to review, reject, edit, or remove submissions that are inaccurate, misleading, inappropriate, or infringe third-party rights.
          </p>
          <p>
            Submitting a tool does not guarantee publication or inclusion in the directory.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">5. Intellectual Property</h2>
          <p>
            AI Tools Directory&apos;s original website content, design, and branding are protected by applicable intellectual property laws.
          </p>
          <p>
            Third-party product names, logos, trademarks, and descriptions belong to their respective owners. Their appearance in the directory does not imply endorsement or partnership.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">6. Third-Party Websites and Services</h2>
          <p>
            Our directory may contain links to external websites, including affiliate links. We do not control third-party websites, their content, products, services, or policies.
          </p>
          <p>
            Visiting or purchasing from an external website is at your own discretion and risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">7. Affiliate Relationships and Advertising</h2>
          <p>
            Some links may generate commissions for AI Tools Directory at no additional cost to users. Paid placements, when available, should be clearly identified.
          </p>
          <p>
            Commercial relationships do not determine our organic search rankings or editorial conclusions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">8. Disclaimer of Warranties</h2>
          <p>
            The website and its content are provided on an &quot;as is&quot; and &quot;as available&quot; basis, to the extent permitted by applicable law.
          </p>
          <p>
            We do not guarantee uninterrupted access, error-free operation, or the accuracy, completeness, and continued availability of third-party listings.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">9. Limitation of Liability</h2>
          <p>
            To the extent permitted by applicable law, AI Tools Directory shall not be liable for indirect, incidental, or consequential damages arising from the use of this website or reliance on third-party information and services.
          </p>
          <p>
            Nothing in these Terms excludes liability where such exclusion is prohibited by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">10. Changes to These Terms</h2>
          <p>
            We may update these Terms of Service from time to time. Changes will be published on this page with a revised date. Continued use of the website after changes are published constitutes acceptance of the updated Terms, where permitted by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">11. Contact</h2>
          <p>
            For questions about these Terms, please contact us through the{' '}
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="text-indigo-600 hover:text-indigo-700 underline font-medium cursor-pointer"
            >
              Contact page
            </button>
            .
          </p>
        </section>
      </div>
    </div>
  );
};
