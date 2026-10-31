import { describe, expect, it } from "vitest";
import { buildBudgetedBlock, normalizeText, rankByRelevance, tokenize } from "./retrieval";

describe("retrieval", () => {
  it("normalizes accents and removes stopwords", () => {
    expect(normalizeText("Estrategia de Marketing para España")).toBe("estrategia de marketing para espana");
    const tokens = tokenize("Plan de marketing para lanzar el producto en España");
    expect(tokens).toContain("marketing");
    expect(tokens).toContain("espana");
    expect(tokens).not.toContain("para");
  });

  it("ranks the most relevant entry first", () => {
    const entries = [
      { title: "Política de vacaciones", content: "Días libres del equipo" },
      { title: "Lanzamiento de producto", content: "Plan de marketing y precios" },
      { title: "Procedimiento de compras", content: "Aprobación de gastos" },
    ];

    const ranked = rankByRelevance(entries, "marketing y precios del producto", (entry) => [
      entry.title,
      entry.content,
    ]);

    expect(ranked[0]?.title).toBe("Lanzamiento de producto");
  });

  it("uses importance as a tie breaker", () => {
    const entries = [
      { title: "Nota menor", content: "ventas", importance: 1 },
      { title: "Nota crítica", content: "ventas", importance: 5 },
    ];

    const ranked = rankByRelevance(
      entries,
      "ventas",
      (entry) => [entry.title, entry.content],
      (entry) => entry.importance,
    );

    expect(ranked[0]?.title).toBe("Nota crítica");
  });

  it("respects the character budget", () => {
    const block = buildBudgetedBlock(
      [
        { heading: "A", content: "x".repeat(100) },
        { heading: "B", content: "y".repeat(100) },
        { heading: "C", content: "z".repeat(100) },
      ],
      150,
    );

    expect(block).toContain("A");
    expect(block).not.toContain("C");
    expect(block.length).toBeLessThanOrEqual(160);
  });

  it("truncates a single oversized entry", () => {
    const block = buildBudgetedBlock([{ heading: "A", content: "x".repeat(500) }], 100);
    expect(block.length).toBeLessThan(160);
    expect(block).toContain("truncado");
  });
});
