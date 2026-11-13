/**
 * Automated Metadata Extractor
 * Extracts tool title, description, official link, and logo from target web pages
 * via OpenGraph, Twitter card tags, and standard HTML meta elements.
 * Never invents pricing, ratings, or unverified claims.
 */

export interface ExtractedPageMetadata {
  title?: string;
  description?: string;
  logo_url?: string;
  canonical_url?: string;
}

export async function extractPageMetadata(urlStr: string, timeoutMs: number = 4000): Promise<ExtractedPageMetadata | null> {
  if (!urlStr || !urlStr.startsWith('http')) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'AIScoutDirectory-Bot/1.0 (+https://aiscout.directory)'
      }
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const html = await res.text();
    const baseUrl = new URL(urlStr);

    // 1. Title extraction
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    const standardTitleMatch = html.match(/<title(?:\s+[^>]*)?>([^<]+)<\/title>/i);
    const rawTitle = ogTitleMatch ? ogTitleMatch[1] : standardTitleMatch ? standardTitleMatch[1] : undefined;
    const title = rawTitle ? rawTitle.trim().replace(/\s+/g, ' ') : undefined;

    // 2. Description extraction
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                          html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
    const rawDesc = ogDescMatch ? ogDescMatch[1] : metaDescMatch ? metaDescMatch[1] : undefined;
    const description = rawDesc ? rawDesc.trim().replace(/\s+/g, ' ') : undefined;

    // 3. Logo / Image extraction
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
                      html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    const rawImg = ogImageMatch ? ogImageMatch[1] : iconMatch ? iconMatch[1] : undefined;

    let logo_url: string | undefined;
    if (rawImg) {
      try {
        logo_url = new URL(rawImg.trim(), baseUrl).href;
      } catch {
        // Leave undefined if invalid URL
      }
    }

    // 4. Canonical URL extraction
    const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    let canonical_url: string | undefined;
    if (canonicalMatch && canonicalMatch[1]) {
      try {
        canonical_url = new URL(canonicalMatch[1].trim(), baseUrl).href;
      } catch {
        // Leave undefined
      }
    }

    return {
      title,
      description,
      logo_url,
      canonical_url
    };
  } catch (err) {
    // Graceful fallback when site blocks or times out
    return null;
  }
}
