import { describe, expect, it } from "vitest";
import { extractMemoryProposals } from "./memory-proposals";

describe("extractMemoryProposals", () => {
  it("separates the deliverable from the proposed memory", () => {
    const result = extractMemoryProposals(`# Informe de mercado

Conclusiones del análisis.

## Memoria propuesta
- El público objetivo prefiere precios anuales con descuento.
- La competencia principal no ofrece soporte en español.
`);

    expect(result.body).toBe("# Informe de mercado\n\nConclusiones del análisis.");
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0]?.content).toContain("precios anuales");
  });

  it("returns the full text when there is no memory section", () => {
    const text = "Solo un entregable sin memoria.";
    const result = extractMemoryProposals(text);
    expect(result.body).toBe(text);
    expect(result.proposals).toEqual([]);
  });

  it("ignores short bullets and caps proposals at three", () => {
    const result = extractMemoryProposals(`Entrega.

## Memoria propuesta
- corto
- Esta es una propuesta suficientemente larga para persistirse.
- Otra propuesta válida con contenido reutilizable.
- Tercera propuesta con información relevante.
- Cuarta propuesta que debe descartarse por límite.
`);

    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.some((proposal) => proposal.content === "corto")).toBe(false);
  });
});
