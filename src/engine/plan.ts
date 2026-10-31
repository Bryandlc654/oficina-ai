import { z } from "zod";

export const DELIVERABLE_KINDS = [
  "DOCUMENT",
  "REPORT",
  "STRATEGY",
  "ANALYSIS",
  "TEXT",
  "CODE",
  "ATTACHMENT",
  "PROMPT",
] as const;

const subtaskSchema = z.object({
  title: z.string().trim().min(3).max(160),
  objective: z.string().trim().min(10).max(2000),
  description: z.string().trim().max(4000).default(""),
  expectedDeliverable: z.string().trim().min(5).max(800),
  agentSlug: z.string().trim().min(1).max(80),
  dependsOn: z.array(z.number().int().min(1).max(8)).max(8).default([]),
  deliverableType: z.enum(DELIVERABLE_KINDS).default("DOCUMENT"),
});

export const planSchema = z
  .object({
    summary: z.string().trim().min(10).max(2000),
    subtasks: z.array(subtaskSchema).min(2).max(8),
  })
  .superRefine((plan, ctx) => {
    plan.subtasks.forEach((subtask, index) => {
      const position = index + 1;
      const unique = new Set(subtask.dependsOn);
      if (unique.size !== subtask.dependsOn.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subtasks", index, "dependsOn"],
          message: "Las dependencias no pueden repetirse",
        });
      }
      for (const dependency of subtask.dependsOn) {
        if (dependency >= position) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["subtasks", index, "dependsOn"],
            message: `La dependencia ${dependency} debe apuntar a una subtarea anterior (1..${position - 1})`,
          });
        }
      }
    });
  });

export type Plan = z.infer<typeof planSchema>;
export type PlanSubtask = Plan["subtasks"][number];

export const reviewSchema = z.object({
  approved: z.boolean(),
  observations: z.string().trim().max(4000).default(""),
  corrections: z
    .array(
      z.object({
        subtaskOrder: z.number().int().min(1).max(8),
        instruction: z.string().trim().min(5).max(1500),
      }),
    )
    .max(8)
    .default([]),
  finalReport: z.string().trim().min(10).max(30000),
});

export type Review = z.infer<typeof reviewSchema>;

/** Extracts the first JSON object from a model response (handles fenced blocks). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("La respuesta del modelo no contiene un objeto JSON");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

export function parsePlan(text: string): Plan {
  return planSchema.parse(extractJson(text));
}

export function parseReview(text: string): Review {
  return reviewSchema.parse(extractJson(text));
}
