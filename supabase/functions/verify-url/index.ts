import { corsHeaders } from '../_shared/cors.ts';
import { isPublicAndSafeIp } from '../_shared/ip-validator.ts';

// Declare Deno types for editor compatibility
declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  resolveDns: (query: string, recordType: 'A' | 'AAAA') => Promise<string[]>;
};

export type VerificationStatusCode =
  | 'LIVE'
  | 'REDIRECTED_SAFE'
  | 'HTTP_CLIENT_ERROR'
  | 'HTTP_SERVER_ERROR'
  | 'INVALID_PROTOCOL'
  | 'BLOCKED_PRIVATE_IP'
  | 'DNS_RESOLUTION_FAILED'
  | 'CONNECTION_TIMEOUT'
  | 'MAX_REDIRECTS_EXCEEDED'
  | 'REDIRECT_LOOP_DETECTED'
  | 'DOWNGRADE_NOT_ALLOWED'
  | 'UNREACHABLE';

export interface UrlVerificationResult {
  is_live: boolean;
  status_code: VerificationStatusCode;
  http_status?: number;
  final_url: string;
  response_time_ms: number;
  ssl_valid: boolean;
  error_message?: string;
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 4000;
const USER_AGENT = 'AIScoutDirectory-Bot/1.0 (+https://aiscout.directory/bot; URL Verification Service)';

Deno.serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. HTTP Method restriction
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 3. User Authorization verification (Require active bearer token)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startTime = performance.now();

  try {
    const body = await req.json();
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const timeoutMs = typeof body?.timeout_ms === 'number' ? Math.min(body.timeout_ms, 6000) : DEFAULT_TIMEOUT_MS;

    if (!rawUrl) {
      return new Response(JSON.stringify({
        is_live: false,
        status_code: 'INVALID_PROTOCOL',
        final_url: '',
        response_time_ms: 0,
        ssl_valid: false,
        error_message: 'URL parameter is required.'
      } as UrlVerificationResult), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let currentUrl = rawUrl;
    let redirectCount = 0;
    const visitedUrls = new Set<string>();
    let lastHttpStatus = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      // Step A: Parse URL and enforce HTTPS-only
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(currentUrl);
      } catch {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'INVALID_PROTOCOL',
          final_url: currentUrl,
          response_time_ms: Math.round(performance.now() - startTime),
          ssl_valid: false,
          error_message: 'Malformed URL.'
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (parsedUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: redirectCount > 0 ? 'DOWNGRADE_NOT_ALLOWED' : 'INVALID_PROTOCOL',
          final_url: currentUrl,
          response_time_ms: Math.round(performance.now() - startTime),
          ssl_valid: false,
          error_message: 'Only secure HTTPS protocols are permitted.'
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Reject URLs with embedded credentials (e.g. https://user:pass@example.com)
      if (parsedUrl.username || parsedUrl.password) {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'INVALID_PROTOCOL',
          final_url: currentUrl,
          response_time_ms: Math.round(performance.now() - startTime),
          ssl_valid: false,
          error_message: 'URLs with embedded user credentials are not permitted.'
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const hostname = parsedUrl.hostname;

      // Reject literal localhost or broadcast hostnames
      if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'BLOCKED_PRIVATE_IP',
          final_url: currentUrl,
          response_time_ms: Math.round(performance.now() - startTime),
          ssl_valid: false,
          error_message: 'Loopback and private domain names are blocked.'
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Step B: Resolve DNS explicitly and check for SSRF / Private IPs
      const resolvedIps: string[] = [];
      try {
        const [aRecords, aaaaRecords] = await Promise.allSettled([
          Deno.resolveDns(hostname, 'A'),
          Deno.resolveDns(hostname, 'AAAA')
        ]);

        if (aRecords.status === 'fulfilled') resolvedIps.push(...aRecords.value);
        if (aaaaRecords.status === 'fulfilled') resolvedIps.push(...aaaaRecords.value);
      } catch {
        // Direct IP might be provided
      }

      // If hostname is directly an IP literal
      if (resolvedIps.length === 0 && /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
        resolvedIps.push(hostname);
      }

      if (resolvedIps.length === 0) {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'DNS_RESOLUTION_FAILED',
          final_url: currentUrl,
          response_time_ms: Math.round(performance.now() - startTime),
          ssl_valid: false,
          error_message: `DNS resolution failed for host: ${hostname}`
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Enforce SSRF & Private IP blocklist on EVERY resolved IP record
      for (const ip of resolvedIps) {
        if (!isPublicAndSafeIp(ip)) {
          return new Response(JSON.stringify({
            is_live: false,
            status_code: 'BLOCKED_PRIVATE_IP',
            final_url: currentUrl,
            response_time_ms: Math.round(performance.now() - startTime),
            ssl_valid: false,
            error_message: `Host ${hostname} resolves to blocked/private IP (${ip}).`
          } as UrlVerificationResult), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Step C: Execute Controlled Network Request with strict timeout and manual redirect handling
      visitedUrls.add(currentUrl);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        // Attempt HEAD request first
        response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        // Some servers return 405 Method Not Allowed or 501 for HEAD; retry with GET
        if (response.status === 405 || response.status === 501) {
          response = await fetch(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
          // Consume first 512KB and close body
          if (response.body) {
            const reader = response.body.getReader();
            await reader.read();
            await reader.cancel();
          }
        }
      } catch (fetchErr: any) {
        clearTimeout(timer);
        const elapsed = Math.round(performance.now() - startTime);

        if (fetchErr.name === 'AbortError' || elapsed >= timeoutMs) {
          return new Response(JSON.stringify({
            is_live: false,
            status_code: 'CONNECTION_TIMEOUT',
            final_url: currentUrl,
            response_time_ms: elapsed,
            ssl_valid: false,
            error_message: `Connection timed out after ${timeoutMs}ms.`
          } as UrlVerificationResult), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'UNREACHABLE',
          final_url: currentUrl,
          response_time_ms: elapsed,
          ssl_valid: false,
          error_message: fetchErr.message || 'Target host unreachable or SSL handshake failed.'
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } finally {
        clearTimeout(timer);
      }

      lastHttpStatus = response.status;

      // Handle Redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          return new Response(JSON.stringify({
            is_live: false,
            status_code: 'MAX_REDIRECTS_EXCEEDED',
            http_status: response.status,
            final_url: currentUrl,
            response_time_ms: Math.round(performance.now() - startTime),
            ssl_valid: true,
            error_message: `Exceeded maximum redirect limit (${MAX_REDIRECTS} hops).`
          } as UrlVerificationResult), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const location = response.headers.get('Location');
        if (!location) {
          return new Response(JSON.stringify({
            is_live: false,
            status_code: 'HTTP_CLIENT_ERROR',
            http_status: response.status,
            final_url: currentUrl,
            response_time_ms: Math.round(performance.now() - startTime),
            ssl_valid: true,
            error_message: 'Redirect status without Location header.'
          } as UrlVerificationResult), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const resolvedRedirect = new URL(location, currentUrl).toString();
        if (visitedUrls.has(resolvedRedirect)) {
          return new Response(JSON.stringify({
            is_live: false,
            status_code: 'REDIRECT_LOOP_DETECTED',
            http_status: response.status,
            final_url: resolvedRedirect,
            response_time_ms: Math.round(performance.now() - startTime),
            ssl_valid: true,
            error_message: 'Circular redirect detected.'
          } as UrlVerificationResult), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        currentUrl = resolvedRedirect;
        continue; // Loop to validate next hop
      }

      // Step D: Evaluate Final HTTP Status
      const elapsed = Math.round(performance.now() - startTime);

      if (response.status >= 200 && response.status < 300) {
        return new Response(JSON.stringify({
          is_live: true,
          status_code: redirectCount > 0 ? 'REDIRECTED_SAFE' : 'LIVE',
          http_status: response.status,
          final_url: currentUrl,
          response_time_ms: elapsed,
          ssl_valid: true
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (response.status >= 400 && response.status < 500) {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'HTTP_CLIENT_ERROR',
          http_status: response.status,
          final_url: currentUrl,
          response_time_ms: elapsed,
          ssl_valid: true,
          error_message: `HTTP Client Error: ${response.status} ${response.statusText}`
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (response.status >= 500) {
        return new Response(JSON.stringify({
          is_live: false,
          status_code: 'HTTP_SERVER_ERROR',
          http_status: response.status,
          final_url: currentUrl,
          response_time_ms: elapsed,
          ssl_valid: true,
          error_message: `HTTP Server Error: ${response.status} ${response.statusText}`
        } as UrlVerificationResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      break;
    }

    return new Response(JSON.stringify({
      is_live: false,
      status_code: 'UNREACHABLE',
      http_status: lastHttpStatus,
      final_url: currentUrl,
      response_time_ms: Math.round(performance.now() - startTime),
      ssl_valid: false,
      error_message: 'Unexpected end of verification pipeline.'
    } as UrlVerificationResult), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      is_live: false,
      status_code: 'UNREACHABLE',
      final_url: '',
      response_time_ms: Math.round(performance.now() - startTime),
      ssl_valid: false,
      error_message: err.message || 'Internal server error during URL verification'
    } as UrlVerificationResult), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
