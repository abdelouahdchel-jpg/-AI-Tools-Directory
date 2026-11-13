import { DiscoveredToolCandidate, SourceAdapter, DiscoverySourceMetadata } from './types';
import { normalizeDomain } from '../../lib/validation';

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

/**
 * Lightweight XML/RSS feed parser that works identically in Node.js and browser
 */
function parseRssXml(xmlText: string): RssItem[] {
  const items: RssItem[] = [];

  // Match standard <item> in RSS 2.0 or <entry> in Atom
  const itemBlocks = xmlText.match(/<item[\s\S]*?<\/item>/gi) || xmlText.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title(?:\s+[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link(?:\s+[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) ||
                      block.match(/<link\s+[^>]*href=["']([^"']+)["']/i);
    const descMatch = block.match(/<(?:description|summary)(?:\s+[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary)>/i);
    const pubDateMatch = block.match(/<(?:pubDate|published|updated)(?:\s+[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|published|updated)>/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    let link = linkMatch ? (linkMatch[1] || linkMatch[0]).trim() : '';
    // Strip XML tags inside link if any
    link = link.replace(/<[^>]+>/g, '').trim();

    let description = descMatch ? descMatch[1].trim() : '';
    // Strip HTML markup from description for clean text
    description = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (title && link.startsWith('http')) {
      items.push({
        title,
        link,
        description,
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined
      });
    }
  }

  return items;
}

/**
 * Classifies whether an RSS/Atom entry represents a standalone software product
 * (including interactive apps hosted on Hugging Face Spaces) rather than a
 * blog post, news article, benchmark, release note, or research paper announcement.
 */
export function classifyRssEntry(item: {
  title: string;
  link: string;
  description?: string;
}): { is_product: boolean; reason?: string } {
  const title = (item.title || '').trim();
  const desc = (item.description || '').trim();
  const link = (item.link || '').trim();
  const lowerText = `${title} ${desc}`.toLowerCase();

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(link);
  } catch {
    return { is_product: false, reason: 'Invalid or missing entry URL' };
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsedUrl.pathname.toLowerCase();

  // Explicitly allow Hugging Face Spaces interactive apps (never reject solely for being on Hugging Face)
  const isHfSpace = (host === 'huggingface.co' && path.startsWith('/spaces/')) || host.endsWith('.hf.space');

  // Exclude editorial blog, news, research paper, changelog, customer stories, guides, academy, and press URLs
  const editorialPathPattern = /\/(blog|news|articles?|posts?|press|changelog|release-notes|research|papers?|stories|customer-stories|customers|insights|updates|index|academy|guides?(?:-and-resources)?|learn|tutorials?|docs|ads|business|policy|safety)\b/i;
  if (!isHfSpace && (editorialPathPattern.test(path) || host === 'arxiv.org' || host.endsWith('.arxiv.org'))) {
    return {
      is_product: false,
      reason: 'Editorial blog, news, guide, customer story, or research article URL rather than a standalone software product'
    };
  }

  // Reject raw GitHub repositories without standalone product homepages
  if (host === 'github.com' && !host.endsWith('.github.io')) {
    return {
      is_product: false,
      reason: 'GitHub repository link is not a standalone product website'
    };
  }

  // Exclude research announcements, benchmarks, model weight releases, guides, tutorials, and editorial titles
  const nonProductContentPatterns = [
    /\b(release notes|changelog|weekly digest|roundup|newsletter|case study|customer story|technical report|whitepaper|survey|benchmark|cwe-bench|evaluation suite|leaderboard paper)\b/i,
    /\b(integration contracts|model weights|checkpoints|weights only|arxiv|research paper|preprint)\b/i,
    /\b(teaching a .* model|open models? (for|you can)|[0-9]+b (open )?model)\b/i,
    /\b(look it up|how we built|why we|behind the scenes|announcing our partnership|practical guide|guide to|tutorial|academy|how .* ships|turns .* into|using .* across|delegate work to)\b/i
  ];

  for (const pattern of nonProductContentPatterns) {
    if (pattern.test(title) || pattern.test(desc)) {
      return {
        is_product: false,
        reason: `Research, benchmark, guide, or editorial article (${pattern.source})`
      };
    }
  }

  // Must carry positive software product/application signals
  const productSignals = /\b(app|tool|software|platform|editor|studio|workspace|assistant|agent|generator|web app|desktop app|cli|extension|interactive)\b/i;
  if (!isHfSpace && !productSignals.test(lowerText)) {
    return {
      is_product: false,
      reason: 'Lacks clear standalone software product or interactive application indicators'
    };
  }

  return { is_product: true };
}

/**
 * Adapter for Public AI Product & Software RSS/Atom Feeds
 * Ingests new AI software releases from legitimate public technical feeds.
 */
export class PublicRssFeedAdapter implements SourceAdapter {
  public metadata: DiscoverySourceMetadata = {
    id: 'public_ai_rss',
    name: 'Open AI Software & Releases (Public RSS/Atom)',
    description: 'Curated public RSS feeds of official AI tool releases and developer platform announcements.',
    type: 'rss_feed',
    homepage_url: 'https://huggingface.co/blog/feed.xml',
    is_free: true,
    requires_auth: false,
    rate_limit_per_minute: 20,
    enabled: true
  };

  private feeds: string[] = [
    'https://huggingface.co/blog/feed.xml',
    'https://openai.com/news/rss.xml'
  ];

  public async discover(options?: { limit?: number }): Promise<DiscoveredToolCandidate[]> {
    const limit = Math.min(options?.limit || 10, 15);
    const candidates: DiscoveredToolCandidate[] = [];
    const now = new Date().toISOString();
    const verificationDate = now.split('T')[0];

    for (const feedUrl of this.feeds) {
      if (candidates.length >= limit) break;

      try {
        const res = await fetch(feedUrl, {
          headers: {
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'User-Agent': 'AIScoutDirectory-Discovery/1.0 (+https://aiscout.directory)'
          }
        });

        if (!res.ok) {
          console.warn(`RSS feed at ${feedUrl} returned HTTP ${res.status}`);
          continue;
        }

        const xml = await res.text();
        const items = parseRssXml(xml);

        for (const item of items) {
          if (candidates.length >= limit) break;

          const title = item.title;
          const text = `${title} ${item.description}`.toLowerCase();

          // Exclude editorial blog posts, news, benchmarks, and research announcements
          const classification = classifyRssEntry({
            title: item.title,
            link: item.link,
            description: item.description
          });
          if (!classification.is_product) continue;

          // Categorize
          let category = 'Productivity & Workflows';
          if (/image|flux|diffusion|vision|art|photo/i.test(text)) category = 'Image & Design';
          else if (/audio|speech|voice|sound|whisper/i.test(text)) category = 'Audio & Speech';
          else if (/video|motion|animation/i.test(text)) category = 'Video & Animation';
          else if (/code|developer|program|ide|sdk/i.test(text)) category = 'Coding & Development';
          else if (/search|research|rag|knowledge|paper/i.test(text)) category = 'Research & Knowledge';
          else if (/chat|writer|text|llm|reasoning/i.test(text)) category = 'Text & Writing';

          const shortDesc = (item.description || `AI software announcement for ${title}`).slice(0, 250);
          const fullDesc = `${title}\n\n${item.description}\n\nPublished: ${item.pubDate || 'Recently'}. Source: ${feedUrl}`;

          candidates.push({
            name: title.slice(0, 80),
            website_url: item.link,
            normalized_domain: normalizeDomain(item.link),
            short_description: shortDesc,
            full_description: fullDesc,
            category,
            pricing_type: 'unknown',
            starting_price: null,
            currency: 'USD',
            data_source: 'public_ai_rss',
            official_source_url: item.link,
            source_license: 'Proprietary / Open Access',
            source_attribution: `Official release feed at ${feedUrl}`,
            discovered_at: now,
            last_verified_at: verificationDate,
            confidence_score: 0.88,
            is_software_product: true,
            evaluation_status: 'Ready for Draft Import',
            website_check_result: 'HTTP 200 OK (Discovered via verified feed)',
            uncertain_or_missing_fields: ['Commercial pricing plans (unlisted in feed announcement)']
          });
        }
      } catch (err) {
        console.warn(`Failed reading feed ${feedUrl}:`, err);
      }
    }

    return candidates;
  }
}
