"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/format";

/**
 * Safe Markdown renderer for agent deliverables. Raw HTML is not enabled, so
 * untrusted model output cannot inject markup.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("text-[13px] leading-relaxed text-zinc-400", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-0 text-[17px] font-semibold tracking-tight text-zinc-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 border-b border-white/[0.06] pb-1.5 text-[14px] font-semibold text-zinc-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-zinc-200">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-3 text-[12px] font-semibold text-zinc-300">{children}</h4>,
          p: ({ children }) => <p className="mb-3 text-[13px] leading-relaxed text-zinc-400">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-zinc-200">{children}</strong>,
          em: ({ children }) => <em className="text-zinc-400">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-emerald-400 underline decoration-emerald-400/30 underline-offset-2 hover:text-emerald-300"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-zinc-600">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-zinc-600">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5 text-[13px] leading-relaxed text-zinc-400">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-emerald-400/30 pl-3 text-[12.5px] italic text-zinc-500">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-white/[0.06]" />,
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">
              {children}
            </pre>
          ),
          code: ({ className: codeClassName, children }) => {
            const block = typeof codeClassName === "string" && codeClassName.startsWith("language-");
            return (
              <code
                className={cn(
                  "font-mono text-[11px]",
                  block ? "text-zinc-300" : "rounded bg-white/[0.06] px-1 py-0.5 text-zinc-200",
                )}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="w-full border-collapse text-left text-[11.5px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.03]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-white/[0.06] px-2.5 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/[0.04] px-2.5 py-2 align-top text-[11.5px] text-zinc-400">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
