"use client";

import { Download } from "lucide-react";

export function DownloadDeliverable({
  title,
  content,
  fileUrl,
  fileName,
}: {
  title: string;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
}) {
  function download() {
    if (fileUrl) {
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = fileName ?? "";
      anchor.rel = "noopener";
      anchor.click();
      return;
    }

    if (!content) return;

    const safeName = (fileName ?? `${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.md`).replace(
      /[\\/:*?"<>|]/g,
      "-",
    );
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const disabled = !fileUrl && !content;

  return (
    <button type="button" onClick={download} disabled={disabled} className="btn-secondary px-2 py-1 text-[11px]">
      <Download className="h-3 w-3" />
      Descargar
    </button>
  );
}
