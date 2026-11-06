-- ====================================================================
-- AI TOOLS DIRECTORY — PRODUCTION SEED INITIAL TOOLS SCRIPT
-- File: supabase/seed_initial_tools.sql
-- Idempotent, non-destructive initial seed for 10 frontier AI software tools
-- Seeds tools in 'pending' publication status and 'pending_review'
-- verification status, awaiting administrative review before publication.
-- ====================================================================

BEGIN;

-- ====================================================================
-- STEP 0: PRE-FLIGHT SCHEMA VERIFICATION
-- Ensure all required destination tables exist in public schema
-- ====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.categories" is missing. Please run 001_initial_schema.sql first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tools') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.tools" is missing. Please run 001_initial_schema.sql first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tool_categories') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.tool_categories" is missing.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pricing_plans') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.pricing_plans" is missing.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tool_features') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.tool_features" is missing.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tool_alternatives') THEN
        RAISE EXCEPTION 'Pre-flight check failed: table "public.tool_alternatives" is missing.';
    END IF;

    RAISE NOTICE 'Pre-flight check passed: destination schema is verified.';
END $$;

-- ====================================================================
-- LIGHTWEIGHT TRANSACTION CONCURRENCY GUARD
-- Uses a 64-bit advisory transaction lock to serialize concurrent seed runs
-- without placing disruptive table-level locks that block application queries.
-- ====================================================================
SELECT pg_advisory_xact_lock(986583710001);

-- ====================================================================
-- STEP 1: SEED CATEGORIES (7 Primary Taxonomy Categories)
-- ON CONFLICT (slug) DO NOTHING: Never overwrites existing admin modifications
-- ====================================================================
INSERT INTO public.categories (name, slug, description, icon_name, display_order)
VALUES
    (
        'Text & Writing',
        'text-and-writing',
        'AI tools for copywriting, drafting articles, editing, and content generation.',
        'FileText',
        1
    ),
    (
        'Coding & Development',
        'coding-and-development',
        'AI pair programmers, IDE assistants, code review, and software scaffolding tools.',
        'Code2',
        2
    ),
    (
        'Image & Design',
        'image-and-design',
        'Generative image creation, background removal, photo editing, and concept art.',
        'Image',
        3
    ),
    (
        'Video & Animation',
        'video-and-animation',
        'AI video generation, avatar synthesis, subtitle automation, and clip editing.',
        'Video',
        4
    ),
    (
        'Audio & Speech',
        'audio-and-speech',
        'Voice synthesis, transcription, noise cancellation, and automated podcast mastering.',
        'Mic',
        5
    ),
    (
        'Research & Knowledge',
        'research-and-knowledge',
        'Autonomous research assistants, academic discovery, and web search synthesizers.',
        'Search',
        6
    ),
    (
        'Productivity & Workflows',
        'productivity-and-workflows',
        'Meeting notes, email assistance, document querying, and smart task management.',
        'CheckSquare',
        7
    )
ON CONFLICT (slug) DO NOTHING;

-- ====================================================================
-- STEP 2: SEED 10 TOOLS (Awaiting Admin Editorial Review)
-- Status rules:
-- 1. publication_status: 'pending' (requires admin review before going public)
-- 2. verification_status: 'pending_review' (no unverified claims)
-- 3. last_verified_at: NULL (stamped only after real human admin verification)
-- 4. upvotes / views_count: 0 (clean baseline, no fake metrics)
-- 5. ON CONFLICT (slug) DO NOTHING: Zero overwrite of admin custom edits
-- ====================================================================
INSERT INTO public.tools (
    name,
    slug,
    website_url,
    normalized_domain,
    short_description,
    full_description,
    logo_url,
    pricing_type,
    starting_price,
    currency,
    official_source_url,
    data_source,
    source_license,
    source_attribution,
    verification_status,
    publication_status,
    featured,
    sponsored,
    upvotes,
    views_count,
    last_verified_at,
    created_at,
    updated_at
)
VALUES
    -- 1. ChatGPT
    (
        'ChatGPT',
        'chatgpt',
        'https://chatgpt.com',
        'chatgpt.com',
        'Conversational intelligence model by OpenAI with voice, reasoning, and multimodal capabilities.',
        'ChatGPT is OpenAI''s flagship conversational AI system powered by GPT-4o and o1 reasoning models. Supports drafting, coding, file parsing, and multimodal conversational interaction.',
        'https://api.iconify.design/simple-icons/openai.svg',
        'freemium',
        20.00,
        'USD',
        'https://openai.com/chatgpt',
        'seed_editorial_batch',
        'Proprietary Service',
        'OpenAI official documentation and public pricing page (https://openai.com/chatgpt/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 2. Claude
    (
        'Claude',
        'claude',
        'https://claude.ai',
        'claude.ai',
        'Conversational and analytical assistant by Anthropic featuring Artifacts workspace and long context.',
        'Claude is Anthropic''s safety-focused conversational AI model powered by the Claude 3.5 Sonnet family. Capable of document analysis, coding, and side-by-side interactive Artifacts.',
        'https://api.iconify.design/simple-icons/anthropic.svg',
        'freemium',
        20.00,
        'USD',
        'https://www.anthropic.com/claude',
        'seed_editorial_batch',
        'Proprietary Service',
        'Anthropic public pricing and documentation (https://www.anthropic.com/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 3. Cursor
    (
        'Cursor',
        'cursor',
        'https://cursor.com',
        'cursor.com',
        'AI-first code editor built on VS Code with codebase indexing and multi-file editing capabilities.',
        'Cursor is an integrated developer environment engineered by Anysphere. Built on the VS Code engine, it embeds codebase indexing, terminal error debugging, and conversational code edits.',
        'https://cursor.com/favicon.ico',
        'freemium',
        20.00,
        'USD',
        'https://cursor.com',
        'seed_editorial_batch',
        'Proprietary with VS Code open-source core',
        'Cursor official website and pricing documentation (https://cursor.com/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 4. Perplexity AI
    (
        'Perplexity AI',
        'perplexity',
        'https://perplexity.ai',
        'perplexity.ai',
        'Conversational answer engine delivering cited research summaries from online sources.',
        'Perplexity AI searches the open web and synthesizes answers with direct source citations, follow-up inquiry support, and file analysis capabilities.',
        'https://api.iconify.design/simple-icons/perplexity.svg',
        'freemium',
        20.00,
        'USD',
        'https://perplexity.ai',
        'seed_editorial_batch',
        'Proprietary Service',
        'Perplexity AI official pricing and statements (https://www.perplexity.ai/pro)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 5. Midjourney
    (
        'Midjourney',
        'midjourney',
        'https://midjourney.com',
        'midjourney.com',
        'Text-to-image synthesis tool producing stylized imagery and creative visual concept art.',
        'Midjourney is an independent research lab producing generative vision models. Accessible via Discord and web interface with controls for aspect ratio, style references, and region variations.',
        'https://www.midjourney.com/favicon.ico',
        'paid',
        10.00,
        'USD',
        'https://midjourney.com',
        'seed_editorial_batch',
        'Proprietary Service',
        'Midjourney official documentation and plan pricing (https://docs.midjourney.com/docs/plans)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 6. ElevenLabs
    (
        'ElevenLabs',
        'elevenlabs',
        'https://elevenlabs.io',
        'elevenlabs.io',
        'AI voice generation and speech synthesis platform supporting multiple languages and voice cloning.',
        'ElevenLabs develops speech synthesis and voice cloning models designed for content creators, audiobooks, dubbing, and interactive conversational agents.',
        'https://elevenlabs.io/favicon.ico',
        'freemium',
        5.00,
        'USD',
        'https://elevenlabs.io',
        'seed_editorial_batch',
        'Proprietary Service',
        'ElevenLabs official product specifications and pricing (https://elevenlabs.io/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 7. Runway Gen-3
    (
        'Runway Gen-3',
        'runway',
        'https://runwayml.com',
        'runwayml.com',
        'Generative video platform generating motion clips from text, images, and camera controls.',
        'Runway develops generative video synthesis tools. Its Gen-3 model creates video sequences from text prompts or still images with camera motion direction and creative styling.',
        'https://runwayml.com/favicon.ico',
        'freemium',
        15.00,
        'USD',
        'https://runwayml.com',
        'seed_editorial_batch',
        'Proprietary Service',
        'RunwayML official pricing and documentation (https://runwayml.com/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 8. Whisper
    (
        'Whisper',
        'whisper',
        'https://github.com/openai/whisper',
        'github.com',
        'Open-source automatic speech recognition (ASR) neural net trained on multilingual speech data.',
        'Whisper is an open-source neural network developed by OpenAI for speech recognition, transcription, and translation across dozens of languages. Licensed under the MIT License for local inference.',
        'https://api.iconify.design/simple-icons/github.svg',
        'open_source',
        0.00,
        'USD',
        'https://github.com/openai/whisper',
        'seed_editorial_batch',
        'MIT License',
        'OpenAI Whisper public GitHub repository (https://github.com/openai/whisper)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 9. Stable Diffusion
    (
        'Stable Diffusion',
        'stable-diffusion',
        'https://stability.ai',
        'stability.ai',
        'Open-weights latent diffusion model for text-to-image generation and local pipeline inference.',
        'Stable Diffusion is Stability AI''s family of open generative vision models. Enables developers and artists to generate images locally or within specialized workflows like ComfyUI.',
        'https://stability.ai/favicon.ico',
        'open_source',
        0.00,
        'USD',
        'https://stability.ai/stable-image',
        'seed_editorial_batch',
        'Stability Community License',
        'Stability AI official website and release documentation (https://stability.ai)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    ),
    -- 10. Descript
    (
        'Descript',
        'descript',
        'https://descript.com',
        'descript.com',
        'Audio and video editor centered around document-style transcript editing and voice isolation.',
        'Descript enables creators to edit audio and video by modifying the corresponding text transcript. Includes noise removal, studio sound enhancement, and basic filler word removal.',
        'https://www.descript.com/favicon.ico',
        'freemium',
        12.00,
        'USD',
        'https://descript.com',
        'seed_editorial_batch',
        'Proprietary Service',
        'Descript official pricing page (https://www.descript.com/pricing)',
        'pending_review',
        'pending',
        FALSE,
        FALSE,
        0,
        0,
        NULL,
        NOW(),
        NOW()
    )
ON CONFLICT (slug) DO NOTHING;

-- ====================================================================
-- STEP 3: SEED TOOL CATEGORIES (Many-to-Many Mappings)
-- ON CONFLICT (tool_id, category_id) DO NOTHING
-- ====================================================================
INSERT INTO public.tool_categories (tool_id, category_id, is_primary)
SELECT t.id, c.id, m.is_primary
FROM (
    VALUES
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

-- ====================================================================
-- STEP 4: SEED PRICING PLANS
-- Idempotent check via WHERE NOT EXISTS on (tool_id, plan_name)
-- ====================================================================
INSERT INTO public.pricing_plans (tool_id, plan_name, price, billing_period, currency, description, features)
SELECT t.id, p.plan_name, p.price, p.billing_period, p.currency, p.description, p.features
FROM (
    VALUES
        -- ChatGPT plans
        ('chatgpt', 'Free Tier', 0.00, 'forever_free', 'USD', 'Standard access to GPT-4o mini and basic conversational features.', '["Access to GPT-4o mini", "Web search capability", "Limited file uploads"]'::jsonb),
        ('chatgpt', 'Plus', 20.00, 'monthly', 'USD', 'Expanded limits for GPT-4o, access to o1 reasoning models, and voice features.', '["Higher limits on GPT-4o", "Access to o1 reasoning models", "Advanced Voice mode"]'::jsonb),
        -- Claude plans
        ('claude', 'Free', 0.00, 'forever_free', 'USD', 'Standard access to Claude 3.5 Sonnet on web and mobile apps.', '["Claude 3.5 Sonnet access", "Interactive Artifacts", "Document analysis"]'::jsonb),
        ('claude', 'Claude Pro', 20.00, 'monthly', 'USD', 'Increased usage limits during peak hours and access to Projects workspace.', '["5x standard usage quota", "Priority access during peak hours", "Projects workspace"]'::jsonb),
        -- Cursor plans
        ('cursor', 'Hobby', 0.00, 'forever_free', 'USD', 'Initial trial followed by standard tab suggestions and limited slow requests.', '["Basic codebase indexing", "Tab suggestions", "Limited slow requests"]'::jsonb),
        ('cursor', 'Pro', 20.00, 'monthly', 'USD', 'Fast model requests, Composer multi-file edits, and full codebase context.', '["Fast premium requests", "Unlimited slow requests", "Multi-file Composer"]'::jsonb),
        -- Perplexity plans
        ('perplexity', 'Standard', 0.00, 'forever_free', 'USD', 'Standard search queries with source citations and basic collections.', '["Quick searches with citations", "Basic collection workspaces"]'::jsonb),
        ('perplexity', 'Pro', 20.00, 'monthly', 'USD', 'Pro searches with deep query synthesis, model switching, and document uploads.', '["Expanded Pro searches", "Model switching capability", "File upload analysis"]'::jsonb),
        -- Midjourney plans
        ('midjourney', 'Basic Plan', 10.00, 'monthly', 'USD', 'Monthly Fast GPU generation time and access to the web/Discord generator.', '["Fast GPU generation time", "Access to member gallery", "Commercial usage rights"]'::jsonb),
        ('midjourney', 'Standard Plan', 30.00, 'monthly', 'USD', '15 Fast GPU hours plus unlimited relaxed GPU generation time.', '["15 Fast GPU hours", "Unlimited Relax GPU mode", "Web editor access"]'::jsonb),
        -- ElevenLabs plans
        ('elevenlabs', 'Free', 0.00, 'forever_free', 'USD', 'Monthly character quota for text-to-speech with attribution required.', '["Text-to-speech synthesis", "Pre-made voice library", "Attribution required"]'::jsonb),
        ('elevenlabs', 'Starter', 5.00, 'monthly', 'USD', 'Expanded character quota, custom voice cloning, and commercial license.', '["Instant voice cloning", "Commercial usage license", "Expanded character allowance"]'::jsonb),
        -- Runway plans
        ('runway', 'Free', 0.00, 'forever_free', 'USD', 'Trial credits for testing video generation tools.', '["Trial generation credits", "Standard export resolutions"]'::jsonb),
        ('runway', 'Standard', 15.00, 'monthly', 'USD', 'Monthly generation credits, 4K export upscaling, and watermark removal.', '["Monthly video credits", "Upscaling options", "Watermark-free exports"]'::jsonb),
        -- Whisper plans
        ('whisper', 'Open Source (MIT)', 0.00, 'forever_free', 'USD', 'Completely free open-source software for self-hosting on local hardware.', '["100% Free & Open Source", "Local hardware execution", "No recurring fees", "Commercial use permitted"]'::jsonb),
        -- Stable Diffusion plans
        ('stable-diffusion', 'Community Open Weights', 0.00, 'forever_free', 'USD', 'Downloadable open weights for local or private cloud inference.', '["Downloadable model weights", "Local hardware execution", "Full data privacy", "Community ecosystem support"]'::jsonb),
        -- Descript plans
        ('descript', 'Free', 0.00, 'forever_free', 'USD', 'Monthly transcription allowance and basic export capabilities.', '["Basic transcription allowance", "Trial audio enhancements", "Standard video exports"]'::jsonb),
        ('descript', 'Creator', 12.00, 'monthly', 'USD', 'Monthly transcription hours, watermark-free high-definition exports.', '["10 monthly transcription hours", "Studio Sound audio enhancement", "Watermark-free exports"]'::jsonb)
) AS p(tool_slug, plan_name, price, billing_period, currency, description, features)
JOIN public.tools t ON t.slug = p.tool_slug
WHERE NOT EXISTS (
    SELECT 1
    FROM public.pricing_plans existing
    WHERE existing.tool_id = t.id AND existing.plan_name = p.plan_name
);

-- ====================================================================
-- STEP 5: SEED TOOL FEATURES
-- Idempotent check via WHERE NOT EXISTS on (tool_id, feature_name)
-- ====================================================================
INSERT INTO public.tool_features (tool_id, feature_name)
SELECT t.id, f.feature_name
FROM (
    VALUES
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
    SELECT 1
    FROM public.tool_features existing
    WHERE existing.tool_id = t.id AND existing.feature_name = f.feature_name
);

-- ====================================================================
-- STEP 6: SEED TOOL ALTERNATIVES
-- ON CONFLICT (tool_id, alternative_tool_id) DO NOTHING
-- ====================================================================
INSERT INTO public.tool_alternatives (tool_id, alternative_tool_id, similarity_score)
SELECT t1.id, t2.id, a.similarity_score
FROM (
    VALUES
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

-- ====================================================================
-- STEP 7: STRICT RECORD-KEY SPECIFIC ASSERTIONS
-- Validates every single required record by its exact identifier/key,
-- and validates data quality (rejection of NULL, empty, or whitespace values).
-- Hard-fails with RAISE EXCEPTION on any discrepancy.
-- ====================================================================
DO $$
DECLARE
    -- Expected sets
    c_cats CONSTANT TEXT[] := ARRAY[
        'text-and-writing', 'coding-and-development', 'image-and-design',
        'video-and-animation', 'audio-and-speech', 'research-and-knowledge',
        'productivity-and-workflows'
    ];
    c_tools CONSTANT TEXT[] := ARRAY[
        'chatgpt', 'claude', 'cursor', 'perplexity', 'midjourney',
        'elevenlabs', 'runway', 'whisper', 'stable-diffusion', 'descript'
    ];

    r RECORD;
    v_missing_key TEXT;
    v_malformed_count INT;
BEGIN
    -- 1. Exact Category Existence Assertion (by slug)
    FOREACH v_missing_key IN ARRAY c_cats LOOP
        IF NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = v_missing_key) THEN
            RAISE EXCEPTION 'Assertion failed: Required category "%" is missing from database.', v_missing_key;
        END IF;
    END LOOP;

    -- 2. Exact Tool Existence Assertion (by slug)
    FOREACH v_missing_key IN ARRAY c_tools LOOP
        IF NOT EXISTS (SELECT 1 FROM public.tools WHERE slug = v_missing_key) THEN
            RAISE EXCEPTION 'Assertion failed: Required tool "%" is missing from database.', v_missing_key;
        END IF;
    END LOOP;

    -- 3. Exact Category Mappings Assertion (by tool_slug + category_slug)
    FOR r IN (
        SELECT * FROM (VALUES
            ('chatgpt', 'text-and-writing'),
            ('chatgpt', 'productivity-and-workflows'),
            ('claude', 'text-and-writing'),
            ('claude', 'coding-and-development'),
            ('claude', 'research-and-knowledge'),
            ('cursor', 'coding-and-development'),
            ('perplexity', 'research-and-knowledge'),
            ('perplexity', 'text-and-writing'),
            ('midjourney', 'image-and-design'),
            ('elevenlabs', 'audio-and-speech'),
            ('runway', 'video-and-animation'),
            ('whisper', 'audio-and-speech'),
            ('whisper', 'coding-and-development'),
            ('stable-diffusion', 'image-and-design'),
            ('stable-diffusion', 'coding-and-development'),
            ('descript', 'video-and-animation'),
            ('descript', 'audio-and-speech'),
            ('descript', 'productivity-and-workflows')
        ) AS t(tool_slug, cat_slug)
    ) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.tool_categories tc
            JOIN public.tools t ON t.id = tc.tool_id
            JOIN public.categories c ON c.id = tc.category_id
            WHERE t.slug = r.tool_slug AND c.slug = r.cat_slug
        ) THEN
            RAISE EXCEPTION 'Assertion failed: Missing tool_category relation ("%" -> "%").', r.tool_slug, r.cat_slug;
        END IF;
    END LOOP;

    -- 4. Exact Pricing Plans Assertion (by tool_slug + plan_name)
    FOR r IN (
        SELECT * FROM (VALUES
            ('chatgpt', 'Free Tier'),
            ('chatgpt', 'Plus'),
            ('claude', 'Free'),
            ('claude', 'Claude Pro'),
            ('cursor', 'Hobby'),
            ('cursor', 'Pro'),
            ('perplexity', 'Standard'),
            ('perplexity', 'Pro'),
            ('midjourney', 'Basic Plan'),
            ('midjourney', 'Standard Plan'),
            ('elevenlabs', 'Free'),
            ('elevenlabs', 'Starter'),
            ('runway', 'Free'),
            ('runway', 'Standard'),
            ('whisper', 'Open Source (MIT)'),
            ('stable-diffusion', 'Community Open Weights'),
            ('descript', 'Free'),
            ('descript', 'Creator')
        ) AS t(tool_slug, plan_name)
    ) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.pricing_plans pp
            JOIN public.tools t ON t.id = pp.tool_id
            WHERE t.slug = r.tool_slug AND pp.plan_name = r.plan_name
        ) THEN
            RAISE EXCEPTION 'Assertion failed: Missing pricing plan "%" for tool "%".', r.plan_name, r.tool_slug;
        END IF;
    END LOOP;

    -- 5. Exact Tool Features Assertion (by tool_slug + feature_name)
    FOR r IN (
        SELECT * FROM (VALUES
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
        ) AS t(tool_slug, feat_name)
    ) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.tool_features tf
            JOIN public.tools t ON t.id = tf.tool_id
            WHERE t.slug = r.tool_slug AND tf.feature_name = r.feat_name
        ) THEN
            RAISE EXCEPTION 'Assertion failed: Missing feature "%" for tool "%".', r.feat_name, r.tool_slug;
        END IF;
    END LOOP;

    -- 6. Exact Alternative Pairs Assertion (by source_slug + target_slug)
    FOR r IN (
        SELECT * FROM (VALUES
            ('chatgpt', 'claude'),
            ('chatgpt', 'perplexity'),
            ('claude', 'chatgpt'),
            ('claude', 'cursor'),
            ('cursor', 'claude'),
            ('cursor', 'chatgpt'),
            ('perplexity', 'chatgpt'),
            ('midjourney', 'stable-diffusion'),
            ('midjourney', 'runway'),
            ('elevenlabs', 'whisper'),
            ('elevenlabs', 'descript'),
            ('runway', 'midjourney'),
            ('runway', 'descript'),
            ('whisper', 'elevenlabs'),
            ('whisper', 'descript'),
            ('stable-diffusion', 'midjourney'),
            ('descript', 'runway'),
            ('descript', 'elevenlabs')
        ) AS t(source_slug, target_slug)
    ) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.tool_alternatives ta
            JOIN public.tools t1 ON t1.id = ta.tool_id
            JOIN public.tools t2 ON t2.id = ta.alternative_tool_id
            WHERE t1.slug = r.source_slug AND t2.slug = r.target_slug
        ) THEN
            RAISE EXCEPTION 'Assertion failed: Missing alternative relation ("%" -> "%").', r.source_slug, r.target_slug;
        END IF;
    END LOOP;

    -- 7. Strict Data Quality Assertion: website_url (No NULL, No whitespace, No non-http scheme)
    SELECT COUNT(*) INTO v_malformed_count
    FROM public.tools
    WHERE slug = ANY(c_tools)
      AND (
          website_url IS NULL
          OR TRIM(website_url) = ''
          OR (website_url NOT LIKE 'https://%' AND website_url NOT LIKE 'http://%')
          OR website_url LIKE '% %'
      );

    IF v_malformed_count > 0 THEN
        RAISE EXCEPTION 'Assertion failed: % seeded tools have NULL, empty, whitespace, or invalid website_url.', v_malformed_count;
    END IF;

    -- 8. Strict Data Quality Assertion: short_description (No NULL, No whitespace, <= 280 chars)
    SELECT COUNT(*) INTO v_malformed_count
    FROM public.tools
    WHERE slug = ANY(c_tools)
      AND (
          short_description IS NULL
          OR TRIM(short_description) = ''
          OR LENGTH(short_description) > 280
      );

    IF v_malformed_count > 0 THEN
        RAISE EXCEPTION 'Assertion failed: % seeded tools have NULL, whitespace-only, or overly long short_description.', v_malformed_count;
    END IF;

    -- 9. Strict Data Quality Assertion: normalized_domain (No NULL, No whitespace, No protocol, No path slashes)
    SELECT COUNT(*) INTO v_malformed_count
    FROM public.tools
    WHERE slug = ANY(c_tools)
      AND (
          normalized_domain IS NULL
          OR TRIM(normalized_domain) = ''
          OR normalized_domain LIKE '%://%'
          OR normalized_domain LIKE '%/%'
          OR normalized_domain LIKE '% %'
      );

    IF v_malformed_count > 0 THEN
        RAISE EXCEPTION 'Assertion failed: % seeded tools have NULL, whitespace, protocol, or slash in normalized_domain.', v_malformed_count;
    END IF;

    -- 10. Strict Data Quality Assertion: name and full_description
    SELECT COUNT(*) INTO v_malformed_count
    FROM public.tools
    WHERE slug = ANY(c_tools)
      AND (
          name IS NULL
          OR TRIM(name) = ''
          OR full_description IS NULL
          OR TRIM(full_description) = ''
      );

    IF v_malformed_count > 0 THEN
        RAISE EXCEPTION 'Assertion failed: % seeded tools have NULL or whitespace-only name or full_description.', v_malformed_count;
    END IF;

    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'AI TOOLS DIRECTORY — EXACT RECORD-KEY AUDIT PASSED';
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'All 7 categories verified by exact slug.';
    RAISE NOTICE 'All 10 tools verified by exact slug.';
    RAISE NOTICE 'All 18 category relations verified by exact (tool, cat) pair.';
    RAISE NOTICE 'All 18 pricing plans verified by exact (tool, plan) key.';
    RAISE NOTICE 'Key features verified by exact (tool, feature) key.';
    RAISE NOTICE 'All 18 alternative pairs verified by exact (src, target) key.';
    RAISE NOTICE 'Data quality checks (NULL, whitespace, scheme) 100%% PASSED.';
    RAISE NOTICE 'Status: Tools seeded in "pending" status for admin review.';
    RAISE NOTICE '=======================================================';
END $$;

COMMIT;
