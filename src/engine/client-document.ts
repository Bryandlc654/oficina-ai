// Requests whose result is a document for a client, which the platform exports to PDF.

const CLIENT_DOCUMENT =
  /\b(pdf|cotizaci[oó]n(es)?|presupuestos?|proformas?|propuestas? (comercial|econ[oó]mica)|contratos?|brochures?|informe para (el )?cliente)\b/i;

export function isClientDocument(text: string): boolean {
  return CLIENT_DOCUMENT.test(text);
}

export const CLIENT_DOCUMENT_CURRENCY =
  "Los precios van en soles peruanos (S/) salvo que el pedido o el conocimiento de la empresa indique otra moneda.";

/** The final report opens with the quality-control quote; the client PDF must not show it. */
export function clientDocumentBody(finalReport: string): string {
  const lines = finalReport.split("\n");
  let start = 0;
  while (start < lines.length && (lines[start]?.startsWith(">") || lines[start]?.trim() === "")) start += 1;
  return lines.slice(start).join("\n").trim();
}
