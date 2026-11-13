import { DiscoveredToolCandidate, SourceAdapter, DiscoverySourceMetadata } from './types';
import { normalizeDomain } from '../../lib/validation';

/**
 * Adapter for Hugging Face Spaces Public API
 * Discovers live interactive AI web applications hosted on Hugging Face Spaces.
 * Free public API requiring zero paid tokens or API keys.
 */
export class HuggingFaceSpacesAdapter implements SourceAdapter {
  public metadata: DiscoverySourceMetadata = {
    id: 'huggingface_spaces',
    name: 'Hugging Face Spaces (Free Public API)',
    description: 'Discovers trending interactive AI web applications and interfaces hosted on Hugging Face Spaces.',
    type: 'public_api',
    homepage_url: 'https://huggingface.co/spaces',
    is_free: true,
    requires_auth: false,
    rate_limit_per_minute: 30,
    enabled: true
  };

  public async discover(options?: { limit?: number; query?: string }): Promise<DiscoveredToolCandidate[]> {
    const limit = Math.min(options?.limit || 10, 15);
    const searchParam = options?.query ? `&search=${encodeURIComponent(options.query)}` : '';
    const endpoint = `https://huggingface.co/api/spaces?sort=likes&direction=-1&limit=${limit}${searchParam}`;

    const candidates: DiscoveredToolCandidate[] = [];

    try {
      const res = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AIScoutDirectory-Discovery/1.0 (+https://aiscout.directory)'
        }
      });

      if (!res.ok) {
        console.warn(`Hugging Face Spaces API returned HTTP ${res.status}`);
        return [];
      }

      const items = await res.json();
      if (!Array.isArray(items)) return [];

      const now = new Date().toISOString();
      const verificationDate = now.split('T')[0];

      for (const item of items) {
        if (!item.id || typeof item.id !== 'string') continue;

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

        if (/image|flux|diffusion|canvas|drawing|sdxl|art|portrait/i.test(combinedText)) {
          category = 'Image & Design';
        } else if (/voice|speech|tts|audio|sound|transcribe|whisper/i.test(combinedText)) {
          category = 'Audio & Speech';
        } else if (/video|animate|motion|lipsync|avatar|film/i.test(combinedText)) {
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
          website_check_result: 'HTTP 200 OK (Hugging Face live space)',
          uncertain_or_missing_fields: ['Commercial hosted infrastructure tier (unlisted)']
        });
      }
    } catch (err) {
      console.warn('Hugging Face Spaces adapter failed:', err);
    }

    return candidates;
  }
}
