import { describe, expect, it } from "vitest";
import { chatInstruction, lessonSimilarity } from "./agent-learning";

describe("lessonSimilarity", () => {
  it("treats rephrasings of one lesson as the same", () => {
    expect(
      lessonSimilarity(
        "Las cotizaciones van en soles con IGV desglosado",
        "Las cotizaciones siempre van en soles, con el IGV desglosado",
      ),
    ).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps different lessons apart", () => {
    expect(lessonSimilarity("Las cotizaciones van en soles", "Publicar en Instagram los martes")).toBeLessThan(0.2);
  });
});

describe("chatInstruction", () => {
  it("picks up standing instructions and drops mentions", () => {
    expect(chatInstruction("@todos de ahora en adelante las cotizaciones llevan 50% de adelanto")).toBe(
      "de ahora en adelante las cotizaciones llevan 50% de adelanto",
    );
  });

  it("ignores ordinary requests", () => {
    expect(chatInstruction("@todos alguien puede hacer un pdf de cotización?")).toBeNull();
  });
});
