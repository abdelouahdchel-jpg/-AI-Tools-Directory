import { DiscoveredToolCandidate, SourceAdapter, DiscoverySourceMetadata } from './types';
import { normalizeDomain } from '../../lib/validation';

/**
 * Classifies whether a Hugging Face Space represents an interactive AI software tool/app
 * rather than a leaderboard, benchmark, playbook/handbook, blog post, or dataset repository.
 */
export function classifyHuggingFaceSpace(item: {
  id: string;
  title?: string;
  shortDescription?: string;
  tags?: string[];
}): { is_product: boolean; reason?: string } {
  const idParts = (item.id || '').split('/');
  const repoSegment = idParts[1] || idParts[0] || '';
  const normalizedIdText = (item.id || '').replace(/[-_./]+/g, ' ').toLowerCase();
  const normalizedRepoText = repoSegment.replace(/[-_]+/g, ' ').toLowerCase();
  const titleText = (item.title || '').replace(/[-_]+/g, ' ').toLowerCase();
  const descText = (item.shortDescription || '').replace(/[-_]+/g, ' ').toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags.map(t => String(t).toLowerCase()) : [];
  const combinedText = `${normalizedIdText} ${titleText} ${descText} ${tags.join(' ')}`;

  const nonProductTagSet = new Set(['leaderboard', 'benchmark', 'benchmarks', 'dataset', 'datasets', 'evaluation']);
  for (const tag of tags) {
    if (nonProductTagSet.has(tag)) {
      return { is_product: false, reason: `Excluded Hugging Face Space tagged as "${tag}" rather than a standalone software tool` };
    }
  }

  const exclusionPatterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\b(leader\s*boards?|elo\s*rating|model\s*rankings?)\b/i, label: 'leaderboard' },
    { regex: /\b(bench\s*marks?|eval(?:uation)?\s*(?:suite|harness)|cwe\s*bench|mmlu|gsm8k|humaneval)\b/i, label: 'benchmark / evaluation' },
    { regex: /\b(play\s*books?|handbooks?|cheat\s*sheets?|awesome\s*lists?|blog\s*posts?|paper\s*pages?|reading\s*lists?|tutorials?|courses?)\b/i, label: 'playbook / handbook / educational resource' },
    { regex: /\b(datasets?|corpora|corpus|weights\s*only|model\s*weights|checkpoints?)\b/i, label: 'dataset / raw weights' }
  ];

  for (const { regex, label } of exclusionPatterns) {
    if (regex.test(normalizedRepoText) || regex.test(titleText) || regex.test(combinedText)) {
      return {
        is_product: false,
        reason: `Excluded Hugging Face Space (${label}) — not a standalone AI software application`
      };
    }
  }

  return { is_product: true };
}

/**
 * Adapter for Hugging Face Spaces Public API
 * Discovers live interactive AI web applications hosted on Hugging Face Spaces.
 * Free public API requiring zero paid tokens or API keys.
 */
export class HuggingFaceSpacesAdapter implements SourceAdapter {
  public metadata: DiscoverySourceMetadata = {
    id: 'huggingface_spaces',
    name: 'Hugging Face Spaces (Free Public API)',
    description: 'Discovers trending and popular interactive AI web applications hosted on Hugging Face Spaces.',
    type: 'public_api',
    homepage_url: 'https://huggingface.co/spaces',
    is_free: true,
    requires_auth: false,
    rate_limit_per_minute: 30,
    enabled: true
  };

  private async fetchSpacesEndpoint(endpoint: string): Promise<any[]> {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AIScoutDirectory-Discovery/1.0 (+https://aiscout.directory)'
        }
      });

      if (!res.ok) {
        console.warn(`Hugging Face Spaces API returned HTTP ${res.status} for ${endpoint}`);
        return [];
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`Hugging Face Spaces endpoint failed (${endpoint}):`, err);
      return [];
    }
  }

  public async discover(options?: { limit?: number; query?: string }): Promise<DiscoveredToolCandidate[]> {
    const limit = Math.min(options?.limit || 10, 30);
    const fetchLimit = Math.min(Math.max(limit * 2, 25), 50);

    let mergedRaw: any[] = [];
    if (options?.query) {
      const endpoint = `https://huggingface.co/api/spaces?sort=likes&direction=-1&limit=${fetchLimit}&search=${encodeURIComponent(options.query)}`;
      mergedRaw = await this.fetchSpacesEndpoint(endpoint);
    } else {
      // Combine both popular (likes) and actively trending (trendingScore) spaces to surface new tools
      const [popularItems, trendingItems] = await Promise.all([
        this.fetchSpacesEndpoint(`https://huggingface.co/api/spaces?sort=likes&direction=-1&limit=${fetchLimit}`),
        this.fetchSpacesEndpoint(`https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=${fetchLimit}`)
      ]);

      const maxLen = Math.max(popularItems.length, trendingItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < popularItems.length) mergedRaw.push(popularItems[i]);
        if (i < trendingItems.length) mergedRaw.push(trendingItems[i]);
      }
    }

    const candidates: DiscoveredToolCandidate[] = [];
    const seenIds = new Set<string>();
    const now = new Date().toISOString();
    const verificationDate = now.split('T')[0];

    for (const item of mergedRaw) {
      if (candidates.length >= limit) break;
      if (!item?.id || typeof item.id !== 'string') continue;

      const idKey = item.id.toLowerCase().trim();
      if (seenIds.has(idKey)) continue;
      seenIds.add(idKey);

      const classification = classifyHuggingFaceSpace({
        id: item.id,
        title: item.cardData?.title,
        shortDescription: item.cardData?.short_description,
        tags: item.tags
      });
      if (!classification.is_product) continue;

      // Clean tool name from author/space-name
      const parts = item.id.split('/');
      const author = parts[0] || 'Community';
      const rawName = parts[1] || parts[0];
      const cleanName = rawName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());

      const spaceUrl = `https://huggingface.co/spaces/${item.id}`;
      const likes = typeof item.likes === 'number' ? item.likes : 0;
      const sdk = item.sdk || 'web';

      // Infer primary category
      let category = 'Coding & Development';
      const cardTitle = item.cardData?.title || '';
      const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
      const combinedText = `${cleanName} ${cardTitle} ${tags} ${sdk}`.toLowerCase();

      if (/image|flux|diffusion|canvas|drawing|sdxl|art|portrait|swap|try-on/i.test(combinedText)) {
        category = 'Image & Design';
      } else if (/voice|speech|tts|audio|sound|transcribe|whisper|music/i.test(combinedText)) {
        category = 'Audio & Speech';
      } else if (/video|animate|motion|lipsync|avatar|film|i2v|t2v/i.test(combinedText)) {
        category = 'Video & Animation';
      } else if (/search|research|rag|knowledge|paper|document/i.test(combinedText)) {
        category = 'Research & Knowledge';
      } else if (/chat|writer|text|llm|summary|grammar/i.test(combinedText)) {
        category = 'Text & Writing';
      } else if (/productivity|workflow|task|agent|automation/i.test(combinedText)) {
        category = 'Productivity & Workflows';
      }

      const shortDesc = (item.cardData?.short_description || item.cardData?.title || `${cleanName} is an interactive AI application built with ${sdk} on Hugging Face Spaces.`).slice(0, 260);
      const fullDesc = `${cleanName} is a live interactive artificial intelligence web application developed by ${author} and hosted on Hugging Face Spaces using the ${sdk} application runtime.\n\nCommunity Likes: ${likes.toLocaleString()}.\nPrimary Runtime SDK: ${sdk}.`;

      const license = item.cardData?.license || 'Open Access (Community Space)';

      candidates.push({
        name: cleanName,
        website_url: spaceUrl,
        normalized_domain: normalizeDomain(spaceUrl),
        short_description: shortDesc,
        full_description: fullDesc,
        category,
        pricing_type: 'free',
        starting_price: null, // Free community access; no assumption of paid tier
        currency: 'USD',
        data_source: 'huggingface_spaces',
        official_source_url: spaceUrl,
        source_license: license,
        source_attribution: `Hosted on Hugging Face Spaces by @${author} (${spaceUrl})`,
        discovered_at: now,
        last_verified_at: verificationDate,
        confidence_score: 0.92,
        is_software_product: true,
        evaluation_status: 'Ready for Draft Import',
        website_check_result: 'Pending live HTTPS reachability check (Hugging Face Space)',
        uncertain_or_missing_fields: ['Commercial hosted infrastructure tier (unlisted)']
      });
    }

    return candidates;
  }
}
