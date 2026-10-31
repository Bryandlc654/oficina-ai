import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientDocumentBody } from "@/engine/client-document";
import { PrintDocument } from "./print-document";

export const dynamic = "force-dynamic";

async function loadDocument(id: string) {
  const task = await db.task.findUnique({
    where: { id },
    select: {
      title: true,
      finalReport: true,
      deliverables: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } },
    },
  });
  if (!task) return null;
  // Tasks finished before the final report existed still have their latest deliverable.
  const content = task.finalReport ?? task.deliverables[0]?.content ?? null;
  return content ? { title: task.title, content: clientDocumentBody(content) } : null;
}

// The browser uses the page title as the PDF's default file name.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await loadDocument(id);
  return { title: { absolute: document?.title ?? "Documento" } };
}

export default async function PrintTaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const document = await loadDocument(id);
  if (!document) notFound();
  return <PrintDocument taskId={id} content={document.content} />;
}
