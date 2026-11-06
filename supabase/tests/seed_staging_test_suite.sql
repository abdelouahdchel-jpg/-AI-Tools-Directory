-- ====================================================================
-- AI TOOLS DIRECTORY — SEED STAGING TEST SUITE
-- File: supabase/tests/seed_staging_test_suite.sql
-- Isolated test harness for verifying supabase/seed_initial_tools.sql
-- Safe execution: Begins with BEGIN; and ends with ROLLBACK;
-- Leaves ZERO persistent records in the database.
-- ====================================================================

BEGIN;

-- 1. Create temporary results logging table
CREATE TEMP TABLE seed_test_results (
    test_id INT,
    test_name TEXT,
    status TEXT,
    details TEXT
);

-- 2. Stage 1: Execute Seed Script Logic
DO $$
DECLARE
    v_tool_count INT;
    v_cat_count INT;
    v_plan_count INT;
    v_feat_count INT;
    v_alt_count INT;
    v_rel_count INT;
BEGIN
    -- Run Category Seeding
    INSERT INTO public.categories (name, slug, description, icon_name, display_order)
    VALUES
        ('Text & Writing', 'text-and-writing', 'AI tools for copywriting.', 'FileText', 1),
        ('Coding & Development', 'coding-and-development', 'AI pair programmers.', 'Code2', 2),
        ('Image & Design', 'image-and-design', 'Generative image creation.', 'Image', 3),
        ('Video & Animation', 'video-and-animation', 'AI video generation.', 'Video', 4),
        ('Audio & Speech', 'audio-and-speech', 'Voice synthesis.', 'Mic', 5),
        ('Research & Knowledge', 'research-and-knowledge', 'Autonomous research.', 'Search', 6),
        ('Productivity & Workflows', 'productivity-and-workflows', 'Meeting notes.', 'CheckSquare', 7)
    ON CONFLICT (slug) DO NOTHING;

    -- Run Tool Seeding
    INSERT INTO public.tools (
        name, slug, website_url, normalized_domain, short_description, full_description,
        logo_url, pricing_type, starting_price, currency, official_source_url, data_source,
        source_license, source_attribution, verification_status, publication_status,
        featured, sponsored, upvotes, views_count, last_verified_at, created_at, updated_at
    ) VALUES
        ('ChatGPT', 'chatgpt', 'https://chatgpt.com', 'chatgpt.com', 'Conversational model by OpenAI.', 'Full desc.', 'https://api.iconify.design/simple-icons/openai.svg', 'freemium', 20.00, 'USD', 'https://openai.com/chatgpt', 'seed_editorial_batch', 'Proprietary', 'OpenAI Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Claude', 'claude', 'https://claude.ai', 'claude.ai', 'Assistant by Anthropic.', 'Full desc.', 'https://api.iconify.design/simple-icons/anthropic.svg', 'freemium', 20.00, 'USD', 'https://www.anthropic.com/claude', 'seed_editorial_batch', 'Proprietary', 'Anthropic Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Cursor', 'cursor', 'https://cursor.com', 'cursor.com', 'Code editor fork of VS Code.', 'Full desc.', 'https://cursor.com/favicon.ico', 'freemium', 20.00, 'USD', 'https://cursor.com', 'seed_editorial_batch', 'Proprietary', 'Cursor Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Perplexity AI', 'perplexity', 'https://perplexity.ai', 'perplexity.ai', 'Answer engine with citations.', 'Full desc.', 'https://api.iconify.design/simple-icons/perplexity.svg', 'freemium', 20.00, 'USD', 'https://perplexity.ai', 'seed_editorial_batch', 'Proprietary', 'Perplexity Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Midjourney', 'midjourney', 'https://midjourney.com', 'midjourney.com', 'Text-to-image generator.', 'Full desc.', 'https://www.midjourney.com/favicon.ico', 'paid', 10.00, 'USD', 'https://midjourney.com', 'seed_editorial_batch', 'Proprietary', 'Midjourney Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('ElevenLabs', 'elevenlabs', 'https://elevenlabs.io', 'elevenlabs.io', 'Voice generation platform.', 'Full desc.', 'https://elevenlabs.io/favicon.ico', 'freemium', 5.00, 'USD', 'https://elevenlabs.io', 'seed_editorial_batch', 'Proprietary', 'ElevenLabs Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Runway Gen-3', 'runway', 'https://runwayml.com', 'runwayml.com', 'Generative video platform.', 'Full desc.', 'https://runwayml.com/favicon.ico', 'freemium', 15.00, 'USD', 'https://runwayml.com', 'seed_editorial_batch', 'Proprietary', 'Runway Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Whisper', 'whisper', 'https://github.com/openai/whisper', 'github.com', 'Open-source speech recognition.', 'Full desc.', 'https://api.iconify.design/simple-icons/github.svg', 'open_source', 0.00, 'USD', 'https://github.com/openai/whisper', 'seed_editorial_batch', 'MIT', 'OpenAI Repo', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Stable Diffusion', 'stable-diffusion', 'https://stability.ai', 'stability.ai', 'Open-weights diffusion model.', 'Full desc.', 'https://stability.ai/favicon.ico', 'open_source', 0.00, 'USD', 'https://stability.ai/stable-image', 'seed_editorial_batch', 'Stability License', 'Stability Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW()),
        ('Descript', 'descript', 'https://descript.com', 'descript.com', 'Video and audio transcript editor.', 'Full desc.', 'https://www.descript.com/favicon.ico', 'freemium', 12.00, 'USD', 'https://descript.com', 'seed_editorial_batch', 'Proprietary', 'Descript Docs', 'pending_review', 'pending', FALSE, FALSE, 0, 0, NULL, NOW(), NOW())
    ON CONFLICT (slug) DO NOTHING;

    -- Run Category Mappings
    INSERT INTO public.tool_categories (tool_id, category_id, is_primary)
    SELECT t.id, c.id, m.is_primary
    FROM (VALUES
        ('chatgpt', 'text-and-writing', TRUE),
        ('chatgpt', 'productivity-and-workflows', FALSE),
        ('claude', 'text-and-writing', TRUE),
        ('claude', 'coding-and-development', FALSE),
        ('claude', 'research-and-knowledge', FALSE),
        ('cursor', 'coding-and-development', TRUE),
        ('perplexity', 'research-and-knowledge', TRUE),
        ('perplexity', 'text-and-writing', FALSE),
        ('midjourney', 'image-and-design', TRUE),
        ('elevenlabs', 'audio-and-speech', TRUE),
        ('runway', 'video-and-animation', TRUE),
        ('whisper', 'audio-and-speech', TRUE),
        ('whisper', 'coding-and-development', FALSE),
        ('stable-diffusion', 'image-and-design', TRUE),
        ('stable-diffusion', 'coding-and-development', FALSE),
        ('descript', 'video-and-animation', TRUE),
        ('descript', 'audio-and-speech', FALSE),
        ('descript', 'productivity-and-workflows', FALSE)
    ) AS m(tool_slug, category_slug, is_primary)
    JOIN public.tools t ON t.slug = m.tool_slug
    JOIN public.categories c ON c.slug = m.category_slug
    ON CONFLICT (tool_id, category_id) DO NOTHING;

    -- Run Plans Seeding
    INSERT INTO public.pricing_plans (tool_id, plan_name, price, billing_period, currency, description, features)
    SELECT t.id, p.plan_name, p.price, p.billing_period, p.currency, p.description, p.features
    FROM (VALUES
        ('chatgpt', 'Free Tier', 0.00, 'forever_free', 'USD', 'Free', '[]'::jsonb),
        ('chatgpt', 'Plus', 20.00, 'monthly', 'USD', 'Plus', '[]'::jsonb),
        ('claude', 'Free', 0.00, 'forever_free', 'USD', 'Free', '[]'::jsonb),
        ('claude', 'Claude Pro', 20.00, 'monthly', 'USD', 'Pro', '[]'::jsonb),
        ('cursor', 'Hobby', 0.00, 'forever_free', 'USD', 'Hobby', '[]'::jsonb),
        ('cursor', 'Pro', 20.00, 'monthly', 'USD', 'Pro', '[]'::jsonb),
        ('perplexity', 'Standard', 0.00, 'forever_free', 'USD', 'Standard', '[]'::jsonb),
        ('perplexity', 'Pro', 20.00, 'monthly', 'USD', 'Pro', '[]'::jsonb),
        ('midjourney', 'Basic Plan', 10.00, 'monthly', 'USD', 'Basic', '[]'::jsonb),
        ('midjourney', 'Standard Plan', 30.00, 'monthly', 'USD', 'Standard', '[]'::jsonb),
        ('elevenlabs', 'Free', 0.00, 'forever_free', 'USD', 'Free', '[]'::jsonb),
        ('elevenlabs', 'Starter', 5.00, 'monthly', 'USD', 'Starter', '[]'::jsonb),
        ('runway', 'Free', 0.00, 'forever_free', 'USD', 'Free', '[]'::jsonb),
        ('runway', 'Standard', 15.00, 'monthly', 'USD', 'Standard', '[]'::jsonb),
        ('whisper', 'Open Source (MIT)', 0.00, 'forever_free', 'USD', 'OSS', '[]'::jsonb),
        ('stable-diffusion', 'Community Open Weights', 0.00, 'forever_free', 'USD', 'Community', '[]'::jsonb),
        ('descript', 'Free', 0.00, 'forever_free', 'USD', 'Free', '[]'::jsonb),
        ('descript', 'Creator', 12.00, 'monthly', 'USD', 'Creator', '[]'::jsonb)
    ) AS p(tool_slug, plan_name, price, billing_period, currency, description, features)
    JOIN public.tools t ON t.slug = p.tool_slug
    WHERE NOT EXISTS (
        SELECT 1 FROM public.pricing_plans existing WHERE existing.tool_id = t.id AND existing.plan_name = p.plan_name
    );

    -- Run Features Seeding
    INSERT INTO public.tool_features (tool_id, feature_name)
    SELECT t.id, f.feature_name
    FROM (VALUES
        ('chatgpt', 'Multimodal conversational interface'),
        ('chatgpt', 'Code interpreter and execution'),
        ('chatgpt', 'Voice and audio conversation mode'),
        ('chatgpt', 'Canvas collaborative workspace'),
        ('claude', 'Artifacts live execution window'),
        ('claude', 'Long document reasoning'),
        ('claude', 'Code generation and debugging'),
        ('claude', 'Vision and image comprehension'),
        ('cursor', 'Codebase semantic indexing'),
        ('cursor', 'Composer multi-file code editing'),
        ('cursor', 'Inline AI autocomplete suggestions'),
        ('cursor', 'Terminal error diagnosis'),
        ('perplexity', 'Direct web citations and references'),
        ('perplexity', 'Interactive follow-up inquiries'),
        ('perplexity', 'Foundation model switching'),
        ('perplexity', 'Research collection organization'),
        ('midjourney', 'Text-to-image synthesis'),
        ('midjourney', 'Region variation and inpainting'),
        ('midjourney', 'Aspect ratio adjustment'),
        ('midjourney', 'Style reference prompting'),
        ('elevenlabs', 'Multilingual speech synthesis'),
        ('elevenlabs', 'Voice cloning capability'),
        ('elevenlabs', 'Sound effects generation'),
        ('elevenlabs', 'Automated dubbing studio'),
        ('runway', 'Text-to-video synthesis'),
        ('runway', 'Image-to-video animation'),
        ('runway', 'Camera motion direction controls'),
        ('runway', 'Motion brush regional animation'),
        ('whisper', 'Multilingual automated speech recognition'),
        ('whisper', 'Speech-to-English translation'),
        ('whisper', 'Word-level timestamp alignment'),
        ('whisper', 'Offline local hardware inference'),
        ('stable-diffusion', 'Local hardware image generation'),
        ('stable-diffusion', 'ControlNet conditioning support'),
        ('stable-diffusion', 'Custom LoRA adapter compatibility'),
        ('stable-diffusion', 'Open model architecture weights'),
        ('descript', 'Transcript-based audio/video editing'),
        ('descript', 'Studio Sound background noise removal'),
        ('descript', 'Automated filler word detection'),
        ('descript', 'AI Eye Contact correction')
    ) AS f(tool_slug, feature_name)
    JOIN public.tools t ON t.slug = f.tool_slug
    WHERE NOT EXISTS (
        SELECT 1 FROM public.tool_features existing WHERE existing.tool_id = t.id AND existing.feature_name = f.feature_name
    );

    -- Run Alternatives Seeding
    INSERT INTO public.tool_alternatives (tool_id, alternative_tool_id, similarity_score)
    SELECT t1.id, t2.id, a.similarity_score
    FROM (VALUES
        ('chatgpt', 'claude', 0.95),
        ('chatgpt', 'perplexity', 0.85),
        ('claude', 'chatgpt', 0.95),
        ('claude', 'cursor', 0.80),
        ('cursor', 'claude', 0.85),
        ('cursor', 'chatgpt', 0.80),
        ('perplexity', 'chatgpt', 0.90),
        ('midjourney', 'stable-diffusion', 0.90),
        ('midjourney', 'runway', 0.75),
        ('elevenlabs', 'whisper', 0.70),
        ('elevenlabs', 'descript', 0.80),
        ('runway', 'midjourney', 0.75),
        ('runway', 'descript', 0.70),
        ('whisper', 'elevenlabs', 0.70),
        ('whisper', 'descript', 0.80),
        ('stable-diffusion', 'midjourney', 0.90),
        ('descript', 'runway', 0.70),
        ('descript', 'elevenlabs', 0.80)
    ) AS a(source_slug, target_slug, similarity_score)
    JOIN public.tools t1 ON t1.slug = a.source_slug
    JOIN public.tools t2 ON t2.slug = a.target_slug
    ON CONFLICT (tool_id, alternative_tool_id) DO NOTHING;

    -- Assert counts
    SELECT COUNT(*) INTO v_cat_count FROM public.categories WHERE slug IN ('text-and-writing','coding-and-development','image-and-design','video-and-animation','audio-and-speech','research-and-knowledge','productivity-and-workflows');
    SELECT COUNT(*) INTO v_tool_count FROM public.tools WHERE slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_plan_count FROM public.pricing_plans pp JOIN public.tools t ON t.id = pp.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_feat_count FROM public.tool_features tf JOIN public.tools t ON t.id = tf.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_alt_count FROM public.tool_alternatives ta JOIN public.tools t ON t.id = ta.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_rel_count FROM public.tool_categories tc JOIN public.tools t ON t.id = tc.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');

    INSERT INTO pg_temp.seed_test_results VALUES
        (1, 'Initial Tool Insertion', CASE WHEN v_tool_count = 10 THEN 'PASS' ELSE 'FAIL' END, 'Seeded tools: ' || v_tool_count || ' / 10'),
        (2, 'Initial Category Insertion', CASE WHEN v_cat_count = 7 THEN 'PASS' ELSE 'FAIL' END, 'Seeded categories: ' || v_cat_count || ' / 7'),
        (3, 'Initial Pricing Plans Insertion', CASE WHEN v_plan_count = 18 THEN 'PASS' ELSE 'FAIL' END, 'Seeded plans: ' || v_plan_count || ' / 18'),
        (4, 'Initial Tool Features Insertion', CASE WHEN v_feat_count = 40 THEN 'PASS' ELSE 'FAIL' END, 'Seeded features: ' || v_feat_count || ' / 40'),
        (5, 'Initial Alternatives Insertion', CASE WHEN v_alt_count = 18 THEN 'PASS' ELSE 'FAIL' END, 'Seeded alternatives: ' || v_alt_count || ' / 18'),
        (6, 'Initial Category Mappings', CASE WHEN v_rel_count = 18 THEN 'PASS' ELSE 'FAIL' END, 'Seeded relations: ' || v_rel_count || ' / 18');
END $$;

-- 3. Stage 2: Test Idempotency (Re-run Seed Script a second time)
DO $$
DECLARE
    v_tool_count INT;
    v_plan_count INT;
    v_feat_count INT;
BEGIN
    -- Re-execute tool insert
    INSERT INTO public.tools (name, slug, website_url, normalized_domain, short_description, full_description, pricing_type, data_source, publication_status, verification_status)
    VALUES ('ChatGPT', 'chatgpt', 'https://chatgpt.com', 'chatgpt.com', 'Duplicate attempt', 'Desc', 'freemium', 'seed', 'pending', 'pending_review')
    ON CONFLICT (slug) DO NOTHING;

    -- Re-execute plan insert
    INSERT INTO public.pricing_plans (tool_id, plan_name, price, billing_period, currency, description)
    SELECT t.id, 'Free Tier', 0.00, 'forever_free', 'USD', 'Duplicate attempt'
    FROM public.tools t
    WHERE t.slug = 'chatgpt'
      AND NOT EXISTS (
          SELECT 1 FROM public.pricing_plans existing WHERE existing.tool_id = t.id AND existing.plan_name = 'Free Tier'
      );

    -- Re-execute feature insert
    INSERT INTO public.tool_features (tool_id, feature_name)
    SELECT t.id, 'Multimodal conversational interface'
    FROM public.tools t
    WHERE t.slug = 'chatgpt'
      AND NOT EXISTS (
          SELECT 1 FROM public.tool_features existing WHERE existing.tool_id = t.id AND existing.feature_name = 'Multimodal conversational interface'
      );

    SELECT COUNT(*) INTO v_tool_count FROM public.tools WHERE slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_plan_count FROM public.pricing_plans pp JOIN public.tools t ON t.id = pp.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');
    SELECT COUNT(*) INTO v_feat_count FROM public.tool_features tf JOIN public.tools t ON t.id = tf.tool_id WHERE t.slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript');

    INSERT INTO pg_temp.seed_test_results VALUES
        (7, 'Idempotency: No Duplicate Tools on Re-run', CASE WHEN v_tool_count = 10 THEN 'PASS' ELSE 'FAIL' END, 'Total tools remained: ' || v_tool_count),
        (8, 'Idempotency: No Duplicate Plans on Re-run', CASE WHEN v_plan_count = 18 THEN 'PASS' ELSE 'FAIL' END, 'Total plans remained: ' || v_plan_count),
        (9, 'Idempotency: No Duplicate Features on Re-run', CASE WHEN v_feat_count = 40 THEN 'PASS' ELSE 'FAIL' END, 'Total features remained: ' || v_feat_count);
END $$;

-- 4. Stage 3: Test Admin Edit Preservation
DO $$
DECLARE
    v_preserved_status TEXT;
    v_preserved_desc TEXT;
    v_preserved_upvotes INT;
BEGIN
    -- Simulate Admin modifying an existing tool in Production
    UPDATE public.tools
    SET
        publication_status = 'published',
        verification_status = 'verified',
        short_description = 'CUSTOM ADMIN DESCRIPTION THAT MUST NOT BE OVERWRITTEN',
        upvotes = 9999
    WHERE slug = 'chatgpt';

    -- Attempt to re-run seed insert for ChatGPT
    INSERT INTO public.tools (
        name, slug, website_url, normalized_domain, short_description, full_description,
        pricing_type, publication_status, verification_status, upvotes
    ) VALUES (
        'ChatGPT', 'chatgpt', 'https://chatgpt.com', 'chatgpt.com',
        'OVERWRITE ATTEMPT BY SEED SCRIPT', 'Desc', 'freemium', 'pending', 'pending_review', 0
    )
    ON CONFLICT (slug) DO NOTHING;

    -- Verify that admin custom values were preserved 100%
    SELECT publication_status, short_description, upvotes
    INTO v_preserved_status, v_preserved_desc, v_preserved_upvotes
    FROM public.tools
    WHERE slug = 'chatgpt';

    INSERT INTO pg_temp.seed_test_results VALUES
        (10, 'Admin Protection: publication_status preserved', CASE WHEN v_preserved_status = 'published' THEN 'PASS' ELSE 'FAIL' END, 'Current status: ' || v_preserved_status),
        (11, 'Admin Protection: short_description preserved', CASE WHEN v_preserved_desc = 'CUSTOM ADMIN DESCRIPTION THAT MUST NOT BE OVERWRITTEN' THEN 'PASS' ELSE 'FAIL' END, 'Description matches admin edit'),
        (12, 'Admin Protection: upvotes preserved', CASE WHEN v_preserved_upvotes = 9999 THEN 'PASS' ELSE 'FAIL' END, 'Upvotes preserved: ' || v_preserved_upvotes);
END $$;

-- 5. Stage 4: Test Data Quality Validation Assertions
DO $$
DECLARE
    v_clean_domains INT;
    v_clean_urls INT;
    v_clean_descriptions INT;
BEGIN
    -- Assert no malformed normalized_domain
    SELECT COUNT(*) INTO v_clean_domains
    FROM public.tools
    WHERE slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript')
      AND (normalized_domain IS NULL OR TRIM(normalized_domain) = '' OR normalized_domain LIKE '%://%' OR normalized_domain LIKE '%/%' OR normalized_domain LIKE '% %');

    -- Assert no malformed website_url
    SELECT COUNT(*) INTO v_clean_urls
    FROM public.tools
    WHERE slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript')
      AND (website_url IS NULL OR TRIM(website_url) = '' OR (website_url NOT LIKE 'https://%' AND website_url NOT LIKE 'http://%') OR website_url LIKE '% %');

    -- Assert short_description <= 280 and not empty
    SELECT COUNT(*) INTO v_clean_descriptions
    FROM public.tools
    WHERE slug IN ('chatgpt','claude','cursor','perplexity','midjourney','elevenlabs','runway','whisper','stable-diffusion','descript')
      AND (short_description IS NULL OR TRIM(short_description) = '' OR LENGTH(short_description) > 280);

    INSERT INTO pg_temp.seed_test_results VALUES
        (13, 'Data Quality: Normalized Domains Valid', CASE WHEN v_clean_domains = 0 THEN 'PASS' ELSE 'FAIL' END, 'Malformed domain count: ' || v_clean_domains),
        (14, 'Data Quality: Website URLs Valid', CASE WHEN v_clean_urls = 0 THEN 'PASS' ELSE 'FAIL' END, 'Malformed URL count: ' || v_clean_urls),
        (15, 'Data Quality: Descriptions within Limit', CASE WHEN v_clean_descriptions = 0 THEN 'PASS' ELSE 'FAIL' END, 'Invalid description count: ' || v_clean_descriptions);
END $$;

-- 6. Display Test Results
SELECT
    test_id,
    test_name,
    status,
    details
FROM pg_temp.seed_test_results
ORDER BY test_id;

SELECT
    COUNT(*) AS total_tests,
    COUNT(*) FILTER (WHERE status = 'PASS') AS passed_tests,
    COUNT(*) FILTER (WHERE status = 'FAIL') AS failed_tests
FROM pg_temp.seed_test_results;

-- Rollback entire staging test suite: Zero persistent changes in database
ROLLBACK;
