import { DiscoveredToolCandidate, SourceAdapter, DiscoverySourceMetadata } from './types';
import { normalizeDomain } from '../../lib/validation';
import { preflightCheckUrl } from '../urlVerifier';

/**
 * Distinguish actual AI software products from raw code libraries, benchmarks,
 * leaderboards, playbooks, model weight repositories, datasets, or research collections.
 */
export function classifySoftwareProduct(item: {
  name: string;
  description: string;
  homepage?: string;
  topics?: string[];
}): { is_product: boolean; reason?: string } {
  const name = item.name.toLowerCase();
  const normalizedName = name.replace(/[-_]+/g, ' ');
  const desc = (item.description || '').toLowerCase();
  const topics = (item.topics || []).map(t => t.toLowerCase());

  // Exclusion terms that indicate a non-product (papers, benchmarks, leaderboards, playbooks, lists, datasets)
  const nonProductPatterns = [
    /\b(awesome[-_ ]list|curated list|collection of|resources for|checklists?|roadmaps?)\b/i,
    /\b(paper|survey|benchmark|leader[-_ ]?board|evaluation suite|dataset|corpus|corpora|weights only)\b/i,
    /\b(sdk|library|wrapper|bindings|gem|pip package|npm package|ui component library)\b/i,
    /\b(tutorial|course|book|reading list|cheat sheet|play[-_ ]?book|handbook|for beginners|from scratch|prompt engineering guide)\b/i
  ];

  for (const pattern of nonProductPatterns) {
    if (pattern.test(name) || pattern.test(normalizedName) || pattern.test(desc)) {
      return { is_product: false, reason: `Classified as non-product / resource (${pattern.source})` };
    }
  }

  // Must have a valid, secure standalone HTTPS homepage (never github.com, redirect shorteners, or docs-only books)
  const trimmedHomepage = (item.homepage || '').trim();
  const hasExternalHomepage = Boolean(
    trimmedHomepage.startsWith('http') &&
    !trimmedHomepage.toLowerCase().includes('github.com')
  );

  if (!hasExternalHomepage) {
    return {
      is_product: false,
      reason: 'Lacks standalone official website; GitHub repository URL cannot substitute for an official product website.'
    };
  }

  const securityCheck = preflightCheckUrl(trimmedHomepage);
  if (!securityCheck.safe) {
    return {
      is_product: false,
      reason: `Homepage failed URL security preflight: ${securityCheck.error || 'HTTPS required'}`
    };
  }

  try {
    const host = new URL(trimmedHomepage).hostname.toLowerCase();
    if (/^(amzn\.to|aka\.ms|bit\.ly|t\.co|arxiv\.org)$/i.test(host)) {
      return {
        is_product: false,
        reason: `Homepage host "${host}" is a link shortener or academic archive, not a standalone software product site.`
      };
    }
  } catch {
    return { is_product: false, reason: 'Invalid homepage URL syntax' };
  }

  // Positive indicators for software applications
  const productKeywords = [
    'app', 'tool', 'editor', 'workspace', 'assistant', 'platform', 'generator',
    'interface', 'gui', 'desktop', 'web app', 'extension', 'agent', 'dashboard',
    'studio', 'workflow', 'builder', 'client', 'server', 'crawl', 'scrape', 'automation'
  ];

  const hasProductKeyword = productKeywords.some(kw =>
    desc.includes(kw) || topics.includes(kw) || normalizedName.includes(kw)
  );
  if (!hasProductKeyword) {
    return { is_product: false, reason: 'Lacks software product application keywords in description/topics' };
  }

  return { is_product: true };
}

/**
 * Adapter for GitHub Public Search API
 * Focuses on legitimate open-source AI applications with standalone official HTTPS websites.
 */
export class GitHubAiToolsAdapter implements SourceAdapter {
  public metadata: DiscoverySourceMetadata = {
    id: 'github_public_api',
    name: 'GitHub AI Applications (Public API)',
    description: 'Searches public GitHub repositories across AI application topics with standalone official HTTPS websites.',
    type: 'public_api',
    homepage_url: 'https://github.com',
    is_free: true,
    requires_auth: false,
    rate_limit_per_minute: 10,
    enabled: true
  };

  private static readonly DEFAULT_QUERIES = [
    'topic:ai-tool has:homepage stars:>200 archived:false',
    'topic:ai-agent has:homepage stars:>500 archived:false',
    'topic:llm has:homepage stars:>1000 archived:false',
    'topic:generative-ai has:homepage stars:>500 archived:false'
  ];

  public async discover(options?: { limit?: number; query?: string }): Promise<DiscoveredToolCandidate[]> {
    const limit = Math.min(options?.limit || 10, 25);
    const queries = options?.query ? [options.query] : GitHubAiToolsAdapter.DEFAULT_QUERIES;
    const perQuery = Math.min(Math.max(Math.ceil(limit / queries.length) + 4, 8), 15);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AIScoutDirectory-Discovery/1.0 (+https://aiscout.directory)'
    };

    const envToken = typeof process !== 'undefined' && process.env?.GITHUB_TOKEN;
    if (envToken) {
      headers['Authorization'] = `Bearer ${envToken}`;
    }

    const candidates: DiscoveredToolCandidate[] = [];
    const seenRepoIds = new Set<string>();

    for (const q of queries) {
      if (candidates.length >= limit) break;

      const endpoint = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perQuery}`;

      try {
        const res = await fetch(endpoint, { headers });
        if (!res.ok) {
          console.warn(`GitHub discovery returned HTTP ${res.status} for query "${q}"`);
          continue;
        }

        const data = await res.json();
        const items = data.items || [];

        for (const item of items) {
          if (candidates.length >= limit) break;

          const repoKey = String(item.full_name || item.id || '').toLowerCase();
          if (!repoKey || seenRepoIds.has(repoKey)) continue;
          seenRepoIds.add(repoKey);

          const hasExternalHomepage = Boolean(
            item.homepage &&
            item.homepage.trim().startsWith('http') &&
            !item.homepage.toLowerCase().includes('github.com')
          );

          const classification = classifySoftwareProduct({
            name: item.name,
            description: item.description || '',
            homepage: item.homepage,
            topics: item.topics
          });

          const standaloneWebsite = hasExternalHomepage ? item.homepage.trim() : '';

          // Infer primary category
          let category = 'Coding & Development';
          const text = `${item.name} ${item.description || ''} ${(item.topics || []).join(' ')}`.toLowerCase();
          if (/image|art|photo|visual|diffusion|canvas/i.test(text)) category = 'Image & Design';
          else if (/speech|audio|voice|tts|sound|podcast/i.test(text)) category = 'Audio & Speech';
          else if (/video|animation|clip|render/i.test(text)) category = 'Video & Animation';
          else if (/search|research|knowledge|rag|citation|wiki/i.test(text)) category = 'Research & Knowledge';
          else if (/chat|writer|text|summar|prompt/i.test(text)) category = 'Text & Writing';
          else if (/workflow|automation|agent|productivity/i.test(text)) category = 'Productivity & Workflows';

          let score = 0.5;
          if (classification.is_product) score += 0.3;
          if (hasExternalHomepage) score += 0.15;
          if (item.stargazers_count > 1000) score += 0.05;

          candidates.push({
            name: item.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            website_url: standaloneWebsite || item.html_url,
            normalized_domain: standaloneWebsite ? normalizeDomain(standaloneWebsite) : 'github.com',
            short_description: (item.description || 'Open-source artificial intelligence application.').slice(0, 250),
            full_description: `${item.description || ''}\n\nOpen-source AI software repository maintained by ${item.owner?.login || 'the community'}. Stargazers: ${item.stargazers_count}. License: ${item.license?.spdx_id || 'Open Source'}.`,
            category,
            pricing_type: 'open_source',
            starting_price: null,
            currency: 'USD',
            data_source: 'github_public_api',
            official_source_url: item.html_url,
            source_license: item.license?.spdx_id || 'Open Source',
            source_attribution: `Discovered from GitHub public repository ${item.full_name} under ${item.license?.spdx_id || 'open-source license'}`,
            discovered_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString().split('T')[0],
            confidence_score: Math.min(score, 1.0),
            is_software_product: classification.is_product,
            rejection_reason: classification.reason,
            evaluation_status: classification.is_product ? 'Ready for Draft Import' : 'Rejected — Not a Software Product',
            website_check_result: hasExternalHomepage ? 'Pending live HTTPS reachability check' : 'No standalone product website (GitHub repo only)',
            uncertain_or_missing_fields: ['Commercial pricing (unlisted)']
          });
        }
      } catch (err) {
        console.warn(`Failed executing GitHub adapter for query "${q}":`, err);
      }
    }

    return candidates;
  }
}
