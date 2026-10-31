import { describe, expect, it } from "vitest";
import { clientDocumentBody, isClientDocument } from "./client-document";

describe("isClientDocument", () => {
  it("spots quotes and PDFs", () => {
    expect(isClientDocument("alguien puede hacer un pdf de cotizacion de un rediseño web?")).toBe(true);
    expect(isClientDocument("Presupuesto para campaña de Meta Ads")).toBe(true);
  });

  it("leaves internal work alone", () => {
    expect(isClientDocument("Auditoría SEO del blog")).toBe(false);
  });
});

describe("clientDocumentBody", () => {
  it("drops the quality-control quote", () => {
    expect(clientDocumentBody("> **Control de calidad: 8/10**\n> Bien.\n\n# Cotización\nTexto")).toBe("# Cotización\nTexto");
  });
});
