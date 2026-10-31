import { describe, expect, it } from "vitest";
import { agentUpdateSchema, loginSchema, taskCreateSchema, taskUpdateSchema } from "./index";

describe("taskCreateSchema", () => {
  const base = {
    title: "Lanzamiento del servicio",
    objective: "Preparar el plan de lanzamiento y los entregables de marketing",
  };

  it("accepts a valid task and applies defaults", () => {
    const parsed = taskCreateSchema.parse(base);
    expect(parsed.priority).toBe("MEDIUM");
    expect(parsed.agentIds).toEqual([]);
  });

  it("accepts a scheduled date with timezone offset", () => {
    const parsed = taskCreateSchema.parse({
      ...base,
      scheduledFor: "2027-01-15T10:00:00.000Z",
    });
    expect(parsed.scheduledFor).toBe("2027-01-15T10:00:00.000Z");
  });

  it("rejects a title that is too short", () => {
    expect(() => taskCreateSchema.parse({ ...base, title: "ab" })).toThrow();
  });

  it("rejects an objective that is too short", () => {
    expect(() => taskCreateSchema.parse({ ...base, objective: "corto" })).toThrow();
  });

  it("rejects an invalid priority", () => {
    expect(() => taskCreateSchema.parse({ ...base, priority: "CRITICAL" })).toThrow();
  });
});

describe("taskUpdateSchema", () => {
  it("rejects unknown statuses", () => {
    expect(() => taskUpdateSchema.parse({ status: "DONE" })).toThrow();
  });

  it("accepts a null schedule to clear it", () => {
    expect(taskUpdateSchema.parse({ scheduledFor: null }).scheduledFor).toBeNull();
  });
});

describe("agentUpdateSchema", () => {
  it("limits iterations to a safe range", () => {
    expect(() => agentUpdateSchema.parse({ maxIterations: 0 })).toThrow();
    expect(() => agentUpdateSchema.parse({ maxIterations: 21 })).toThrow();
    expect(agentUpdateSchema.parse({ maxIterations: 5 }).maxIterations).toBe(5);
  });

  it("accepts a tools list", () => {
    const parsed = agentUpdateSchema.parse({
      tools: [{ name: "document.write", description: "Escribir documentos" }],
    });
    expect(parsed.tools?.[0]?.isEnabled).toBe(true);
    expect(parsed.tools?.[0]?.requiresApproval).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalizes the email", () => {
    expect(loginSchema.parse({ email: "  ADMIN@Office.Local ", password: "long-password" }).email).toBe(
      "admin@office.local",
    );
  });

  it("rejects short passwords", () => {
    expect(() => loginSchema.parse({ email: "a@b.com", password: "short" })).toThrow();
  });
});
