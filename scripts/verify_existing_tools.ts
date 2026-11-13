import { createClient } from '@supabase/supabase-js';
import { INITIAL_TOOLS } from '../src/data/initialData';
import { extractPageMetadata } from '../src/services/discovery/metadataExtractor';
import { Tool } from '../src/types/database';

export interface HealthCheckReportItem {
  name: string;
  url: string;
  classification: 'healthy' | 'bot_protected' | 'broken';
  http_status?: number;
  message: string;
  action_needed: string;
}

export interface SuggestedToolUpdate {
  tool_id: string;
  name: string;
  url: string;
  changes_detected: {
    title?: { current: string; detected: string };
    description?: { current: string; detected: string };
    logo_url?: { current: string; detected: string };
  };
}

export interface HealthCheckReportSummary {
  timestamp: string;
  total_checked: number;
  healthy_count: number;
  bot_protected_count: number;
  broken_count: number;
  updates_suggested_count: number;
  items: HealthCheckReportItem[];
  suggested_updates: SuggestedToolUpdate[];
}

/**
 * Safely verify URL reachability with retry on GET for servers rejecting HEAD
 */
async function inspectUrlHealth(urlStr: string, timeoutMs: number = 6000): Promise<{
  classification: 'healthy' | 'bot_protected' | 'broken';
  status?: number;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res = await fetch(urlStr, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIScoutDirectory-Checker/1.0; +https://aiscout.directory)'
      }
    });

    clearTimeout(timeoutId);

    // If HEAD is disallowed or forbidden, retry with standard GET request
    if (res.status === 405 || res.status === 403 || res.status === 400) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), timeoutMs);
      res = await fetch(urlStr, {
        method: 'GET',
        signal: getController.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AIScout/1.0'
        }
      });
      clearTimeout(getTimeout);
    }

    if (res.status >= 200 && res.status < 400) {
      return { classification: 'healthy', status: res.status };
    } else if (res.status === 403 || res.status === 429) {
      // REQUIREMENT 8: HTTP 403/429 is anti-bot / Cloudflare protection; NOT proof that site is down
      return {
        classification: 'bot_protected',
        status: res.status,
        error: `HTTP ${res.status} (Anti-bot / Cloudflare verification challenge. Site is active but rejects automated scrapers)`
      };
    } else {
      return {
        classification: 'broken',
        status: res.status,
        error: `HTTP ${res.status} returned`
      };
    }
  } catch (err: any) {
    return {
      classification: 'broken',
      error: err.message || 'Connection timeout or network failure'
    };
  }
}

async function runHealthCheckAndDriftDetection() {
  const startTime = new Date().toISOString();
  console.log('===============================================================');
  console.log('🩺 AI TOOLS DIRECTORY — PERIODIC HEALTH & DRIFT AUDIT');
  console.log(`⏱️  Timestamp: ${startTime}`);
  console.log('🔒 Policy: READ-ONLY report mode. Zero tools deleted, zero statuses altered.');
  console.log('===============================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let supabaseClient: any = null;
  let toolsToCheck: Tool[] = [...INITIAL_TOOLS];
  const isLive = Boolean(supabaseUrl && supabaseKey);

  if (isLive) {
    supabaseClient = createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false }
    });

    try {
      const { data, error } = await supabaseClient
        .from('tools')
        .select('*');

      if (!error && data && data.length > 0) {
        toolsToCheck = data;
        console.log(`📡 Fetched ${toolsToCheck.length} tools from Supabase database for audit.`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Could not query Supabase (${err.message}). Using catalog fallback.`);
    }
  } else {
    console.log(`🧪 DRY-RUN / LOCAL MODE: Auditing ${toolsToCheck.length} catalog tools.`);
  }

  const report: HealthCheckReportSummary = {
    timestamp: startTime,
    total_checked: toolsToCheck.length,
    healthy_count: 0,
    bot_protected_count: 0,
    broken_count: 0,
    updates_suggested_count: 0,
    items: [],
    suggested_updates: []
  };

  for (const tool of toolsToCheck) {
    const inspection = await inspectUrlHealth(tool.website_url);

    if (inspection.classification === 'healthy') {
      report.healthy_count++;
      report.items.push({
        name: tool.name,
        url: tool.website_url,
        classification: 'healthy',
        http_status: inspection.status || 200,
        message: 'Reachable & active',
        action_needed: 'None — tool is operational'
      });
      console.log(`   🟢 [HEALTHY ${inspection.status || 200}] ${tool.name} (${tool.website_url})`);

      // Section 9: Safe Drift Detection (Check if title/desc/logo changed, propose update without overwriting)
      try {
        const meta = await extractPageMetadata(tool.website_url, 3000);
        if (meta) {
          const changes: SuggestedToolUpdate['changes_detected'] = {};
          if (meta.title && meta.title.length > 3 && meta.title.toLowerCase() !== tool.name.toLowerCase()) {
            changes.title = { current: tool.name, detected: meta.title };
          }
          if (meta.description && meta.description.length > 20 && meta.description !== tool.short_description) {
            changes.description = { current: tool.short_description, detected: meta.description };
          }
          if (meta.logo_url && !tool.logo_url) {
            changes.logo_url = { current: '', detected: meta.logo_url };
          }

          if (Object.keys(changes).length > 0) {
            report.updates_suggested_count++;
            report.suggested_updates.push({
              tool_id: tool.id,
              name: tool.name,
              url: tool.website_url,
              changes_detected: changes
            });
            console.log(`      💡 Proposed metadata drift detected for ${tool.name} (stored for review)`);
          }
        }
      } catch {
        // Non-fatal
      }
    } else if (inspection.classification === 'bot_protected') {
      report.bot_protected_count++;
      report.items.push({
        name: tool.name,
        url: tool.website_url,
        classification: 'bot_protected',
        http_status: inspection.status,
        message: inspection.error || 'Bot protection active',
        action_needed: 'Manual review required — site is active behind Cloudflare/anti-bot protection'
      });
      console.log(`   🟡 [BOT-PROTECTED ${inspection.status}] ${tool.name} (${tool.website_url}) — Not broken; blocks automated agents`);
    } else {
      report.broken_count++;
      report.items.push({
        name: tool.name,
        url: tool.website_url,
        classification: 'broken',
        http_status: inspection.status,
        message: inspection.error || 'Connection failed',
        action_needed: 'Human editor review required — check domain status or DNS migration'
      });
      console.log(`   🔴 [BROKEN / UNREACHABLE] ${tool.name} (${tool.website_url}) — ${inspection.error}`);
    }
  }

  // STRICT REQUIREMENT 8: DO NOT mutate or delete tool records in the database!
  // Save standalone report to audit_logs instead.
  if (isLive && supabaseClient) {
    try {
      await supabaseClient.from('audit_logs').insert({
        action: 'periodic_url_health_report',
        entity_type: 'health_check_report',
        entity_id: `health_report_${startTime.split('T')[0]}`,
        metadata: {
          summary: {
            total_checked: report.total_checked,
            healthy: report.healthy_count,
            bot_protected: report.bot_protected_count,
            broken: report.broken_count,
            suggested_updates: report.updates_suggested_count
          },
          broken_tools: report.items.filter(i => i.classification === 'broken'),
          bot_protected_tools: report.items.filter(i => i.classification === 'bot_protected'),
          suggested_updates: report.suggested_updates
        }
      });
      console.log('\n📝 Health check report saved to Supabase audit_logs (zero tool records altered).');
    } catch (err: any) {
      console.warn(`⚠️ Could not save audit log (${err.message}).`);
    }
  }

  console.log('\n===============================================================');
  console.log('📊 AUDIT SUMMARY REPORT:');
  console.log(`   • Total Checked: ${report.total_checked}`);
  console.log(`   • Healthy (Reachable): ${report.healthy_count}`);
  console.log(`   • Bot-Protected (Active, needs human verify): ${report.bot_protected_count}`);
  console.log(`   • Broken / Unreachable (needs review): ${report.broken_count}`);
  console.log(`   • Proposed Metadata Updates: ${report.updates_suggested_count}`);
  console.log('   • Integrity Guarantee: 0 tools modified, 0 tools deleted, 0 statuses altered.');
  console.log('===============================================================\n');

  return report;
}

runHealthCheckAndDriftDetection()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal health check error:', err);
    process.exit(1);
  });
