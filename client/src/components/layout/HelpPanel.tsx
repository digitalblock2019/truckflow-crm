"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

// "?" icon next to the topbar title. Click opens a right-side slide-out panel
// rendering /public/help/<slug>.md. Markdown source lives in /docs/help/ and
// is copied into /public/help/ by `npm run sync:help` (auto-runs on
// dev/build). To wire help on a page, pass `helpSlug="<name>"` to <Topbar />.
export default function HelpPanel({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || content || error) return;
    let cancelled = false;
    fetch(`/help/${slug}.md`)
      .then((r) => {
        if (!r.ok) throw new Error(`No help draft for "${slug}" yet`);
        return r.text();
      })
      .then((text) => { if (!cancelled) setContent(text); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [open, slug, content, error]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-txt-light/40 text-txt-light hover:text-navy hover:border-navy/40 text-[10px] font-bold cursor-help select-none transition-colors"
        aria-label={`Help for ${title}`}
        title={`Help: ${title}`}
      >
        ?
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Slide-out panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <h2 className="text-sm font-semibold text-navy">Help — {title}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-txt-light hover:text-navy text-lg leading-none cursor-pointer"
                aria-label="Close help"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {error && (
                <div className="text-[12px] text-txt-light italic">{error}</div>
              )}
              {!error && !content && (
                <div className="text-[12px] text-txt-light italic">Loading…</div>
              )}
              {content && (
                <article className="prose-help text-[13px] text-txt leading-relaxed">
                  <ReactMarkdown
                    components={{
                      h1: (p) => <h1 className="text-base font-semibold text-navy mt-0 mb-2" {...p} />,
                      h2: (p) => <h2 className="text-sm font-semibold text-navy mt-5 mb-2" {...p} />,
                      h3: (p) => <h3 className="text-[13px] font-semibold text-navy mt-4 mb-1.5" {...p} />,
                      p:  (p) => <p className="mb-2.5" {...p} />,
                      ul: (p) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...p} />,
                      ol: (p) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...p} />,
                      li: (p) => <li className="text-txt" {...p} />,
                      strong: (p) => <strong className="text-navy font-semibold" {...p} />,
                      code: (p) => <code className="bg-surface px-1 py-0.5 rounded text-[12px] font-mono" {...p} />,
                      a: (p) => <a className="text-blue hover:underline" target="_blank" rel="noreferrer" {...p} />,
                      hr: () => <hr className="my-4 border-border" />,
                    }}
                  >
                    {content}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
