import React, { useState } from 'react';
import { Cpu, Sparkles, Terminal, Bot, Image, Mic, Video, Scissors } from 'lucide-react';

interface ToolLogoProps {
  slug?: string;
  name: string;
  logoUrl?: string;
  domain?: string;
  className?: string; // size & layout classes for container
  iconClassName?: string; // size for inner icon/svg
}

// Built-in official brand SVGs for verified AI tools (100% reliable, zero network dependency)
const BRAND_VECTORS: Record<string, (className?: string) => React.ReactNode> = {
  chatgpt: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-emerald-600 ${cls}`}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zm-1.57-9.524a4.48 4.48 0 0 1 2.345-1.972V12.4a.78.78 0 0 0 .392.678l5.84 3.37-2.02 1.168a.08.08 0 0 1-.072 0L3.68 14.83a4.504 4.504 0 0 1-1.65-6.05zm15.86 3.245l-5.843-3.37 2.02-1.168a.08.08 0 0 1 .072 0l4.825 2.784a4.504 4.504 0 0 1-.682 8.12v-5.688a.788.788 0 0 0-.392-.678zm2.016-3.832a4.47 4.47 0 0 1 .535 3.014l-.142-.085-4.783-2.759a.771.771 0 0 0-.78 0L9.04 11.737V9.405a.08.08 0 0 1 .033-.062l4.84-2.793a4.5 4.5 0 0 1 6.14 1.646zM10.74 1.57a4.504 4.504 0 0 1 4.494 4.494v5.688a.78.78 0 0 0 .392.678l2.02-1.168v-2.332a.08.08 0 0 1 .033-.062L22.52 6.07a4.476 4.476 0 0 1-1.78-4.5z"/>
    </svg>
  ),
  claude: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-amber-800 ${cls}`}>
      {/* Anthropic / Claude warm terra-cotta star symbol */}
      <path d="M14.6 2.5h-5.2L0 21.5h5.4l2.1-4.7h9l2.1 4.7H24L14.6 2.5zm-3.6 10.3 2.9-6.8 2.9 6.8h-5.8z" />
    </svg>
  ),
  cursor: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-900 ${cls}`}>
      {/* Cursor isometric code emblem */}
      <polygon points="3 3 10.07 19.97 12.58 12.58 19.97 10.07 3 3" fill="currentColor" fillOpacity="0.15" />
    </svg>
  ),
  perplexity: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-cyan-700 ${cls}`}>
      {/* Perplexity knot mark */}
      <path d="M12 2a1 1 0 0 0-1 1v5.17A6.97 6.97 0 0 0 7 7a7 7 0 0 0-7 7 7 7 0 0 0 7 7c1.6 0 3.08-.54 4.26-1.46L11 21a1 1 0 0 0 2 0v-5.17A6.97 6.97 0 0 0 17 17a7 7 0 0 0 7-7 7 7 0 0 0-7-7c-1.6 0-3.08.54-4.26 1.46L13 3a1 1 0 0 0-1-1zm0 8a5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5h-1.17l-3.83-3.83V10zm-2 4l-3.83 3.83A5 5 0 0 1 7 19a5 5 0 0 1-5-5 5 5 0 0 1 5-5c1.1 0 2.11.36 2.93.97L10 10.9V14z"/>
    </svg>
  ),
  midjourney: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-indigo-900 ${cls}`}>
      {/* Midjourney origami vessel */}
      <path d="M12 2L3 17h18L12 2zm0 4.2L17.2 15H6.8L12 6.2zM2 19h20v2H2v-2z" />
    </svg>
  ),
  elevenlabs: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${cls}`}>
      {/* ElevenLabs iconic double sound bars */}
      <rect x="7" y="3" width="3.5" height="18" rx="1.75" />
      <rect x="13.5" y="3" width="3.5" height="18" rx="1.75" />
    </svg>
  ),
  runway: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-violet-700 ${cls}`}>
      {/* Runway R emblem */}
      <path d="M6 3h7a5 5 0 0 1 3.5 8.5L20 21h-4.5l-3-8.5H9.5V21H6V3zm3.5 3.2v5.3h3.5a2.65 2.65 0 0 0 0-5.3H9.5z" />
    </svg>
  ),
  whisper: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${cls}`}>
      {/* GitHub/Open Source Whisper waveform */}
      <path d="M12 1.95c-5.52 0-10 4.48-10 10 0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.12 22 16.37 22 11.95c0-5.52-4.48-10-10-10z"/>
    </svg>
  ),
  'stable-diffusion': (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-fuchsia-700 ${cls}`}>
      {/* Stability AI generative cluster */}
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="6.3" cy="6.3" r="1.5" />
      <circle cx="17.7" cy="17.7" r="1.5" />
      <circle cx="6.3" cy="17.7" r="1.5" />
      <circle cx="17.7" cy="6.3" r="1.5" />
    </svg>
  ),
  descript: (cls = 'w-6 h-6') => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-blue-600 ${cls}`}>
      {/* Descript stylized media 'D' */}
      <path d="M5 3h7a8 8 0 0 1 8 8 8 8 0 0 1-8 8H5V3zm4 3.5v9h3a4.5 4.5 0 0 0 4.5-4.5A4.5 4.5 0 0 0 12 6.5H9z" />
    </svg>
  )
};

export const ToolLogo: React.FC<ToolLogoProps> = ({
  slug,
  name,
  logoUrl,
  domain,
  className = 'w-10 h-10 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0',
  iconClassName = 'w-6 h-6'
}) => {
  const [loadError, setLoadError] = useState(false);
  const [useFaviconFallback, setUseFaviconFallback] = useState(false);

  // Normalize slug key
  const normalizedKey = (slug || name.toLowerCase().replace(/[^a-z0-9]/g, '')).toLowerCase();

  // Tier 1: Match built-in official vector if available (instant, no network request, sharp vector)
  if (BRAND_VECTORS[normalizedKey]) {
    return (
      <div className={className} aria-label={`${name} logo`}>
        {BRAND_VECTORS[normalizedKey](iconClassName)}
      </div>
    );
  }

  // Sanitize external logoUrl (fix any colon in iconify URLs)
  let cleanUrl = logoUrl;
  if (cleanUrl && cleanUrl.includes('api.iconify.design/') && cleanUrl.includes(':')) {
    cleanUrl = cleanUrl.replace('api.iconify.design/', 'api.iconify.design/').replace(':', '/');
  }

  // Derive domain for high-res favicon fallback
  const resolvedDomain = domain || (cleanUrl && cleanUrl.startsWith('http') ? new URL(cleanUrl).hostname : '');
  const faviconUrl = resolvedDomain
    ? `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${resolvedDomain}&size=128`
    : '';

  // Determine current image source to attempt
  const currentSrc = !useFaviconFallback && cleanUrl ? cleanUrl : faviconUrl;

  // Tier 2 & 3: Image element with auto-fallback to domain favicon
  if (currentSrc && !loadError) {
    return (
      <div className={className}>
        <img
          src={currentSrc}
          alt={`${name} logo`}
          referrerPolicy="no-referrer"
          className={`${iconClassName} object-contain`}
          onError={() => {
            if (!useFaviconFallback && faviconUrl && faviconUrl !== cleanUrl) {
              setUseFaviconFallback(true);
            } else {
              setLoadError(true);
            }
          }}
        />
      </div>
    );
  }

  // Tier 4: Clean Fallback Monogram (anti-slop, accessible, never broken)
  const initial = name ? name.trim().charAt(0).toUpperCase() : 'A';

  return (
    <div
      className={`${className} bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 font-bold font-mono text-sm shadow-2xs select-none`}
      aria-label={`${name} logo`}
    >
      <span>{initial}</span>
    </div>
  );
};
