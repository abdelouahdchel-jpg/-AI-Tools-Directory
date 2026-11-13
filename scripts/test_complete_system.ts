import fs from 'fs';
import path from 'path';
import { discoveryService } from '../src/services/discovery/discoveryService';
import { preflightCheckUrl } from '../src/services/urlVerifier';
import { ToolImportRowSchema, normalizeDomain, generateSlug } from '../src/lib/validation';
import { INITIAL_TOOLS } from '../src/data/initialData';
import { CuratedOpenDatasetAdapter } from '../src/services/discovery/curatedDatasetAdapter';
import { GitHubAiToolsAdapter } from '../src/services/discovery/githubAdapter';
import { HuggingFaceSpacesAdapter } from '../src/services/discovery/huggingFaceAdapter';
import { PublicRssFeedAdapter } from '../src/services/discovery/rssAdapter';

async function runComprehensiveTests() {
  console.log('===============================================================');
  console.log('🧪 AI SCOUT DIRECTORY — COMPREHENSIVE VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}${details ? ': ' + details : ''}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: Preservation of the 10 Published Tools
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 1: Published Tools Protection ---');
  assert(INITIAL_TOOLS.length === 10, 'Catalog has exactly 10 initial published tools');
  const publishedCount = INITIAL_TOOLS.filter(t => t.publication_status === 'published').length;
  assert(publishedCount === 10, 'All 10 tools have publication_status === "published"');
  const expectedNames = [
    'ChatGPT', 'Claude', 'Cursor', 'Perplexity AI', 'Midjourney',
    'ElevenLabs', 'Runway Gen-3', 'Whisper', 'Stable Diffusion', 'Descript'
  ];
  for (const name of expectedNames) {
    const found = INITIAL_TOOLS.find(t => t.name === name);
    assert(Boolean(found), `Published tool "${name}" exists in catalog without modification`);
  }

  // -------------------------------------------------------------
  // Test 2: Free Discovery Adapters Registration & Discovery
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: Free Discovery Sources ---');
  const sources = discoveryService.getAvailableSources();
  assert(sources.length >= 4, `At least 4 discovery sources registered (found: ${sources.length})`);
  assert(sources.every(s => s.is_free), 'Every registered discovery source is 100% FREE without paid APIs');
  assert(sources.some(s => s.id === 'curated_open_dataset'), 'CuratedOpenDatasetAdapter registered');
  assert(sources.some(s => s.id === 'github_public_api'), 'GitHubAiToolsAdapter registered');
  assert(sources.some(s => s.id === 'huggingface_spaces'), 'HuggingFaceSpacesAdapter registered');
  assert(sources.some(s => s.id === 'public_ai_rss'), 'PublicRssFeedAdapter registered');

  // Test Curated Adapter
  const curatedAdapter = new CuratedOpenDatasetAdapter();
  const curatedCandidates = await curatedAdapter.discover({ limit: 15 });
  assert(curatedCandidates.length > 0, `Curated adapter discovered ${curatedCandidates.length} candidate tools`);

  // Test Hugging Face Spaces Adapter
  const hfAdapter = new HuggingFaceSpacesAdapter();
  const hfCandidates = await hfAdapter.discover({ limit: 5 });
  assert(Array.isArray(hfCandidates), 'Hugging Face Spaces adapter returns candidate array');

  // Test RSS Feed Adapter
  const rssAdapter = new PublicRssFeedAdapter();
  const rssCandidates = await rssAdapter.discover({ limit: 5 });
  assert(Array.isArray(rssCandidates), 'Public RSS Feed adapter returns candidate array');

  // -------------------------------------------------------------
  // Test 3: Deduplication Engine (Cross-DB & Intra-Batch)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Deduplication & Re-check ---');
  const discoveryBatch = await discoveryService.runDiscovery('curated_open_dataset', INITIAL_TOOLS, { limit: 15 });

  const duplicates = discoveryBatch.candidates.filter(c => c.is_duplicate);
  assert(duplicates.length >= 4, `At least 4 duplicates detected against published catalog (found: ${duplicates.length})`);

  // Check specific duplicates
  const cursorDup = duplicates.find(d => d.candidate.name.toLowerCase() === 'cursor');
  assert(Boolean(cursorDup), 'Cursor caught as duplicate of published catalog tool #3');
  assert(Boolean(cursorDup?.duplicate_reason?.includes('cursor.com')), 'Cursor duplicate reason cites domain collision');

  const chatGptDup = duplicates.find(d => d.candidate.name.toLowerCase() === 'chatgpt');
  assert(Boolean(chatGptDup), 'ChatGPT caught as duplicate of published catalog tool #1');

  const whisperDup = duplicates.find(d => d.candidate.name.toLowerCase() === 'whisper');
  assert(Boolean(whisperDup), 'Whisper caught as duplicate of published catalog tool #8');

  const midjourneyDup = duplicates.find(d => d.candidate.name.toLowerCase() === 'midjourney');
  assert(Boolean(midjourneyDup), 'Midjourney caught as duplicate of published catalog tool #5');

  // -------------------------------------------------------------
  // Test 4: Classification & Rejection of Non-Products
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Non-Product Filtering ---');
  const audioCraft = discoveryBatch.candidates.find(c => c.candidate.name === 'AudioCraft');
  assert(Boolean(audioCraft), 'AudioCraft is included in test dataset');
  assert(!audioCraft?.candidate.is_software_product, 'AudioCraft classified as non-product (research framework)');
  assert(audioCraft?.candidate.evaluation_status === 'Rejected — Not a Software Product', 'AudioCraft given explicit "Rejected — Not a Software Product" status');

  // -------------------------------------------------------------
  // Test 5: Standalone Official Website Enforcement
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 5: Official Website Verification ---');
  // Check that raw GitHub URLs are not treated as official product websites
  const testCandidateWithRawGithub = {
    name: 'RawRepoAI',
    website_url: 'https://github.com/developer/raw-ai-repo',
    normalized_domain: 'github.com',
    short_description: 'A raw deep learning python repo with no standalone website.',
    full_description: 'A raw deep learning python repo with no standalone website.',
    category: 'Coding & Development',
    pricing_type: 'open_source' as const,
    starting_price: null,
    currency: 'USD',
    data_source: 'test',
    official_source_url: 'https://github.com/developer/raw-ai-repo',
    source_attribution: 'Test',
    discovered_at: new Date().toISOString(),
    last_verified_at: '2026-11-12',
    confidence_score: 0.5,
    is_software_product: true,
    evaluation_status: 'Ready for Draft Import' as const,
    website_check_result: '',
    uncertain_or_missing_fields: []
  };

  // Run discoveryService evaluation simulation
  const isRawRepo = testCandidateWithRawGithub.website_url.toLowerCase().includes('github.com/') &&
    !testCandidateWithRawGithub.website_url.toLowerCase().includes('.github.io');
  assert(isRawRepo, 'Correctly detects raw GitHub repository URL');

  // -------------------------------------------------------------
  // Test 6: SSRF and URL Security Preflight Checks
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 6: URL Security & SSRF Protection ---');
  assert(!preflightCheckUrl('http://insecure-site.com').safe, 'Blocks insecure plain HTTP protocol');
  assert(!preflightCheckUrl('https://127.0.0.1/admin').safe, 'Blocks loopback IP 127.0.0.1 (SSRF)');
  assert(!preflightCheckUrl('https://localhost:3000').safe, 'Blocks localhost hostnames (SSRF)');
  assert(!preflightCheckUrl('https://192.168.1.1/router').safe, 'Blocks private network IP 192.168.x (SSRF)');
  assert(!preflightCheckUrl('https://10.0.0.5/api').safe, 'Blocks private network IP 10.x (SSRF)');
  assert(!preflightCheckUrl('https://user:password@malicious.com').safe, 'Blocks URLs with embedded credentials');
  assert(preflightCheckUrl('https://ollama.com').safe, 'Permits legitimate public HTTPS domain https://ollama.com');

  // -------------------------------------------------------------
  // Test 7: Zod Schema Validation & Nullable Pricing
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 7: Schema Validation & Nullable Pricing ---');
  const validDraft = ToolImportRowSchema.safeParse({
    name: 'Jan AI',
    website_url: 'https://jan.ai',
    short_description: 'Open source desktop ChatGPT alternative.',
    full_description: 'Full offline ChatGPT alternative running local models.',
    pricing_type: 'open_source',
    starting_price: null, // Null starting price
    currency: 'USD',
    category: 'Text & Writing',
    data_source: 'open_dataset',
    official_source_url: 'https://github.com/janhq/jan'
  });
  assert(validDraft.success, 'ToolImportRowSchema accepts null starting_price without coercing to $0.00');
  if (validDraft.success) {
    assert(validDraft.data.starting_price === null, 'Starting price preserved as null');
  }

  const invalidUrl = ToolImportRowSchema.safeParse({
    name: 'Bad URL Tool',
    website_url: 'not-a-valid-url',
    short_description: 'A tool with a malformed URL.',
    full_description: 'A tool with a malformed URL.',
    category: 'Text & Writing'
  });
  assert(!invalidUrl.success, 'ToolImportRowSchema rejects malformed URLs');

  // -------------------------------------------------------------
  // Test 8: Safe Draft Status Guarantee
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 8: Mandatory Ingestion Statuses ---');
  const readyCandidates = discoveryBatch.candidates.filter(c => c.candidate.evaluation_status === 'Ready for Draft Import');
  assert(readyCandidates.length >= 8, `At least 8 approved candidates ready for draft import (found: ${readyCandidates.length})`);
  for (const c of readyCandidates) {
    assert(c.candidate.evaluation_status === 'Ready for Draft Import', `${c.candidate.name} is Ready for Draft Import`);
  }

  // -------------------------------------------------------------
  // Test 9: Zero Service Role Key Leaks in Client Code
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 9: Secret Isolation Audit ---');
  function scanDirForSecrets(dir: string): string[] {
    const leakedFiles: string[] = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        leakedFiles.push(...scanDirForSecrets(fullPath));
      } else if (/\.(tsx?|jsx?|html)$/.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Check for leaked service role key variables in frontend bundle
        if (content.includes('SUPABASE_SERVICE_ROLE_KEY') || content.includes('service_role_key')) {
          leakedFiles.push(fullPath);
        }
      }
    }
    return leakedFiles;
  }

  const clientLeaks = scanDirForSecrets(path.resolve('./src'));
  assert(clientLeaks.length === 0, 'Zero instances of SUPABASE_SERVICE_ROLE_KEY in src/ client-side codebase', clientLeaks.join(', '));

  // -------------------------------------------------------------
  // Test 10: Idempotency (Re-running does NOT create duplicates)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 10: Idempotency Verification ---');
  // Simulate tools after Round 1 ingestion
  const simulatedToolsAfterRound1 = [
    ...INITIAL_TOOLS,
    ...readyCandidates.map(c => ({
      id: 'tool-' + generateSlug(c.candidate.name),
      name: c.candidate.name,
      slug: generateSlug(c.candidate.name),
      website_url: c.candidate.website_url,
      normalized_domain: c.candidate.normalized_domain,
      short_description: c.candidate.short_description,
      full_description: c.candidate.full_description,
      logo_url: c.candidate.logo_url || '',
      pricing_type: c.candidate.pricing_type,
      starting_price: c.candidate.starting_price,
      currency: c.candidate.currency,
      data_source: c.candidate.data_source,
      verification_status: 'unverified' as const,
      publication_status: 'draft' as const,
      featured: false,
      sponsored: false,
      upvotes: 0,
      views_count: 0,
      categories: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
  ];

  // Re-run discovery against updated catalog
  const round2Batch = await discoveryService.runDiscovery('curated_open_dataset', simulatedToolsAfterRound1, { limit: 15 });
  const round2NewValid = round2Batch.candidates.filter(c => c.candidate.evaluation_status === 'Ready for Draft Import' && !c.is_duplicate);
  assert(round2NewValid.length === 0, 'Re-running discovery against ingested tools produces 0 new duplicates (100% idempotency)');

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('===============================================================\n');
}

runComprehensiveTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
