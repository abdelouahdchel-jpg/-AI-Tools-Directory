import { DiscoveredToolCandidate, SourceAdapter, DiscoverySourceMetadata } from './types';
import { normalizeDomain } from '../../lib/validation';

/**
 * Distinguish actual AI software products from raw code libraries, benchmarks,
 * model weight repositories, or research paper collections.
 */
export function classifySoftwareProduct(item: {
  name: string;
  description: string;
  homepage?: string;
  topics?: string[];
}): { is_product: boolean; reason?: string } {
  const name = item.name.toLowerCase();
  const desc = (item.description || '').toLowerCase();
  const topics = (item.topics || []).map(t => t.toLowerCase());

  // Exclusion terms that indicate a non-product (e.g. papers, benchmarks, lists, raw models)
  const nonProductPatterns = [
    /\b(awesome[-_ ]list|curated list|collection of|resources for)\b/i,
    /\b(paper|survey|benchmark|dataset|corpus|weights only)\b/i,
    /\b(sdk|library|wrapper|bindings|gem|pip package|npm package)\b/i,
    /\b(tutorial|course|book|reading list|cheat sheet)\b/i
  ];

  for (const pattern of nonProductPatterns) {
    if (pattern.test(name) || pattern.test(desc)) {
      return { is_product: false, reason: `Classified as non-product / resource (${pattern.source})` };
    }
  }

  // Positive indicators: must have an official standalone homepage (not github alone) or app keywords
  const productKeywords = [
    'app', 'tool', 'editor', 'workspace', 'assistant', 'platform', 'generator',
    'interface', 'gui', 'desktop', 'web app', 'extension', 'agent', 'dashboard'
  ];

  const hasProductKeyword = productKeywords.some(kw => desc.includes(kw) || topics.includes(kw) || name.includes(kw));
  const hasExternalHomepage = Boolean(item.homepage && item.homepage.startsWith('http') && !item.homepage.includes('github.com'));

  if (!hasExternalHomepage && !hasProductKeyword) {
    return { is_product: false, reason: 'Lacks external standalone product homepage or application keywords' };
  }

  return { is_product: true };
}

/**
 * Adapter for GitHub Public Search API
 * Focuses on legitimate open-source AI applications and GUI products.
 */
export class GitHubAiToolsAdapter implements SourceAdapter {
  public metadata: DiscoverySourceMetadata = {
    id: 'github_public_api',
    name: 'GitHub AI Applications (Public API)',
    description: 'Searches public GitHub repositories tagged with AI application topics and active product homepages.',
    type: 'public_api',
    homepage_url: 'https://github.com',
    is_free: true,
    requires_auth: false,
    rate_limit_per_minute: 10,
    enabled: true
  };

  public async discover(options?: { limit?: number; query?: string }): Promise<DiscoveredToolCandidate[]> {
    const limit = Math.min(options?.limit || 10, 15);
    // Explicit query strictly targeting standalone applications with homepages
    const q = options?.query || 'topic:ai-tool has:homepage stars:>200 archived:false';
    const endpoint = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limit}`;

    const candidates: DiscoveredToolCandidate[] = [];

    try {
      const res = await fetch(endpoint, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AIScoutDirectory-Discovery/1.0 (+https://aiscout.directory)'
        }
      });

      if (!res.ok) {
        console.warn(`GitHub discovery returned HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        const homepage = item.homepage && item.homepage.trim().startsWith('http') ? item.homepage.trim() : item.html_url;
        const classification = classifySoftwareProduct({
          name: item.name,
          description: item.description || '',
          homepage: item.homepage,
          topics: item.topics
        });

        // Infer primary category
        let category = 'Coding & Development';
        const text = `${item.name} ${item.description || ''} ${(item.topics || []).join(' ')}`.toLowerCase();
        if (/image|art|photo|visual|diffusion|canvas/i.test(text)) category = 'Image & Design';
        else if (/speech|audio|voice|tts|sound|podcast/i.test(text)) category = 'Audio & Speech';
        else if (/video|animation|clip|render/i.test(text)) category = 'Video & Animation';
        else if (/search|research|knowledge|rag|citation|wiki/i.test(text)) category = 'Research & Knowledge';
        else if (/chat|writer|text|summar|agent|prompt/i.test(text)) category = 'Text & Writing';

        // Calculate confidence score
        let score = 0.5;
        if (classification.is_product) score += 0.3;
        if (item.homepage && !item.homepage.includes('github.com')) score += 0.15;
        if (item.stargazers_count > 1000) score += 0.05;

        candidates.push({
          name: item.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          website_url: homepage,
          normalized_domain: normalizeDomain(homepage),
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
          website_check_result: 'Discovered via GitHub API endpoint',
          uncertain_or_missing_fields: ['Commercial pricing (unlisted)']
        });
      }
    } catch (err) {
      console.warn('Failed executing GitHub adapter:', err);
    }

    return candidates;
  }
}
