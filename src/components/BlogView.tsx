import React, { useState } from 'react';
import { ArrowLeft, Clock, Calendar, User, BookOpen } from 'lucide-react';
import { INITIAL_BLOG_POSTS } from '../data/initialData';

interface BlogViewProps {
  onSelectTool: (slug: string) => void;
  selectedArticleSlug?: string;
  onNavigateArticle: (slug?: string) => void;
}

export const BlogView: React.FC<BlogViewProps> = ({
  onSelectTool,
  selectedArticleSlug,
  onNavigateArticle
}) => {
  const [posts] = useState(INITIAL_BLOG_POSTS);

  const activePost = posts.find(p => p.slug === selectedArticleSlug);

  if (activePost) {
    return (
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <button
          onClick={() => onNavigateArticle(undefined)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Articles</span>
        </button>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <span className="font-semibold text-indigo-600">{activePost.category}</span>
          <span aria-hidden="true">·</span>
          <span>{activePost.publishedAt}</span>
          <span aria-hidden="true">·</span>
          <span>{activePost.readTime}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-4 leading-tight">
          {activePost.title}
        </h1>

        <p className="text-base text-slate-600 leading-relaxed mb-8 border-b border-slate-200 pb-6">
          {activePost.excerpt}
        </p>

        {/* Article Body */}
        <div className="prose prose-slate max-w-none text-sm text-slate-700 leading-relaxed space-y-6">
          {activePost.content.split('\n\n').map((paragraph, index) => {
            if (paragraph.startsWith('### ')) {
              return (
                <h3 key={index} className="text-lg font-bold text-slate-900 pt-3">
                  {paragraph.replace('### ', '')}
                </h3>
              );
            }
            return <p key={index}>{paragraph}</p>;
          })}
        </div>

        {/* Related internal tool shortcuts */}
        <div className="mt-12 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
            Referenced AI Software
          </h4>
          <p className="text-xs text-slate-600 mb-4">
            Explore verified listings and full feature breakdowns for tools mentioned in this guide:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onSelectTool('chatgpt')}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-xs font-medium text-slate-800 cursor-pointer"
            >
              ChatGPT
            </button>
            <button
              onClick={() => onSelectTool('claude')}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-xs font-medium text-slate-800 cursor-pointer"
            >
              Claude
            </button>
            <button
              onClick={() => onSelectTool('whisper')}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-xs font-medium text-slate-800 cursor-pointer"
            >
              Whisper (OSS)
            </button>
            <button
              onClick={() => onSelectTool('midjourney')}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-xs font-medium text-slate-800 cursor-pointer"
            >
              Midjourney
            </button>
            <button
              onClick={() => onSelectTool('stable-diffusion')}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg text-xs font-medium text-slate-800 cursor-pointer"
            >
              Stable Diffusion
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="max-w-2xl mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Editorial Guides & Research
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          In-depth analyses, workflow breakdowns, and verified comparisons curated by our software engineers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map(post => (
          <div
            key={post.id}
            className="group flex flex-col justify-between bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all p-5"
          >
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
                <span className="font-semibold text-indigo-600">{post.category}</span>
                <span aria-hidden="true">·</span>
                <span>{post.readTime}</span>
              </div>
              <h2
                onClick={() => onNavigateArticle(post.slug)}
                className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mb-2 cursor-pointer line-clamp-2"
              >
                {post.title}
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-4">
                {post.excerpt}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">{post.publishedAt}</span>
              <button
                onClick={() => onNavigateArticle(post.slug)}
                className="font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1"
              >
                <span>Read Guide</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
