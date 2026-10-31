import { describe, expect, it } from "vitest";
import { extractJson, parsePlan, parseReview, planSchema } from "./plan";
import { deliverableKindForAgent } from "./deliverable-type";

const validPlan = {
  summary: "Plan de lanzamiento con investigación, estrategia y revisión final",
  subtasks: [
    {
      title: "Investigar mercado",
      objective: "Identificar competidores y público objetivo del servicio",
      description: "Analiza el mercado disponible",
      expectedDeliverable: "Informe de mercado con competidores y segmentos",
      agentSlug: "business-analyst",
      dependsOn: [],
      deliverableType: "ANALYSIS",
    },
    {
      title: "Definir estrategia",
      objective: "Crear el plan de marketing basado en la investigación",
      description: "Usa el informe de mercado",
      expectedDeliverable: "Plan de marketing con canales y métricas",
      agentSlug: "marketing-manager",
      dependsOn: [1],
      deliverableType: "STRATEGY",
    },
  ],
};

describe("extractJson", () => {
  it("extracts JSON from a fenced block", () => {
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("extracts JSON surrounded by text", () => {
    expect(extractJson("Aquí está: {\"a\":2} fin")).toEqual({ a: 2 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("sin json")).toThrow();
  });
});

describe("planSchema", () => {
  it("accepts a valid plan", () => {
    const plan = parsePlan(JSON.stringify(validPlan));
    expect(plan.subtasks).toHaveLength(2);
    expect(plan.subtasks[1]?.dependsOn).toEqual([1]);
  });

  it("rejects a task that depends on itself or a later task", () => {
    const invalid = structuredClone(validPlan);
    invalid.subtasks[0]!.dependsOn = [1];
    expect(() => planSchema.parse(invalid)).toThrow();

    const forward = structuredClone(validPlan);
    forward.subtasks[0]!.dependsOn = [2];
    expect(() => planSchema.parse(forward)).toThrow();
  });

  it("rejects duplicated dependencies", () => {
    const invalid = structuredClone(validPlan);
    invalid.subtasks[1]!.dependsOn = [1, 1];
    expect(() => planSchema.parse(invalid)).toThrow();
  });

  it("accepts a single subtask for simple requests but not an empty plan", () => {
    expect(planSchema.parse({ ...validPlan, subtasks: [validPlan.subtasks[0]] }).subtasks).toHaveLength(1);
    expect(() => planSchema.parse({ ...validPlan, subtasks: [] })).toThrow();
  });

  it("rejects more than eight subtasks", () => {
    const subtasks = Array.from({ length: 9 }, (_, index) => ({
      ...validPlan.subtasks[0]!,
      title: `Subtarea ${index + 1}`,
    }));
    expect(() => planSchema.parse({ ...validPlan, subtasks })).toThrow();
  });
});

describe("reviewSchema", () => {
  it("accepts a scored review with corrections", () => {
    const review = parseReview(
      JSON.stringify({
        score: "6",
        criteria: { objective: 7, accuracy: 5 },
        observations: "Falta presupuesto",
        corrections: [{ instruction: "Añade un presupuesto estimado por canal" }],
      }),
    );
    expect(review.score).toBe(6);
    expect(review.criteria.accuracy).toBe(5);
    expect(review.corrections[0]?.instruction).toContain("presupuesto");
  });

  it("rejects scores out of range", () => {
    expect(() => parseReview(JSON.stringify({ score: 14, observations: "", corrections: [] }))).toThrow();
  });
});

describe("deliverableKindForAgent", () => {
  it("classifies code output as code", () => {
    expect(deliverableKindForAgent("developer", "```ts\nconst x = 1;\n```")).toBe("CODE");
  });

  it("classifies the project manager as report", () => {
    expect(deliverableKindForAgent("project-manager", "texto")).toBe("REPORT");
  });

  it("classifies unknown agents as text", () => {
    expect(deliverableKindForAgent("otro", "texto")).toBe("TEXT");
  });
});
