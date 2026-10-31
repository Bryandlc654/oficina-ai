"use client";

import { useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download } from "lucide-react";

/**
 * Light, paper-sized rendering of a task's final document. "Guardar como PDF" in the
 * browser's print dialog turns it into the file the client receives.
 */
export function PrintDocument({ taskId, content }: { taskId: string; content: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 py-8 [color-scheme:light] print:bg-white print:py-0">
      <style>{"@page { size: A4; margin: 18mm 16mm; } body { background: #fff !important; }"}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Link href={`/tasks/${taskId}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          Volver a la tarea
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <Download className="h-4 w-4" />
          Guardar como PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[18mm] text-[10.5pt] leading-relaxed text-zinc-800 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mb-2 border-b-2 border-emerald-600 pb-3 text-[20pt] font-bold tracking-tight text-zinc-900">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-2 mt-7 break-after-avoid text-[13pt] font-semibold text-emerald-700">{children}</h2>
            ),
            h3: ({ children }) => <h3 className="mb-1.5 mt-4 break-after-avoid text-[11pt] font-semibold text-zinc-900">{children}</h3>,
            h4: ({ children }) => <h4 className="mb-1 mt-3 text-[10.5pt] font-semibold text-zinc-800">{children}</h4>,
            p: ({ children }) => <p className="mb-2.5">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
            a: ({ href, children }) => (
              <a href={href} className="text-emerald-700 underline">
                {children}
              </a>
            ),
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-emerald-600">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
            blockquote: ({ children }) => (
              <blockquote className="mb-3 border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-zinc-700">{children}</blockquote>
            ),
            hr: () => <hr className="my-5 border-zinc-200" />,
            table: ({ children }) => (
              <table className="mb-4 w-full break-inside-avoid border-collapse text-[9.5pt]">{children}</table>
            ),
            thead: ({ children }) => <thead className="bg-emerald-600 text-white">{children}</thead>,
            th: ({ children }) => <th className="px-2.5 py-1.5 text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border-b border-zinc-200 px-2.5 py-1.5 align-top">{children}</td>,
            code: ({ children }) => <code className="rounded bg-zinc-100 px-1 font-mono text-[9pt]">{children}</code>,
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
