import { z } from "zod";
import { AGENT_STATUSES, KNOWLEDGE_KINDS, TASK_PRIORITIES, TASK_STATUSES } from "../constants";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Introduce un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const taskCreateSchema = z.object({
  title: z.string().trim().min(3, "El título es demasiado corto").max(190),
  objective: z.string().trim().min(10, "Describe el objetivo con más detalle").max(5000),
  description: z.string().trim().max(20000).default(""),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  agentIds: z.array(z.string().min(1)).max(10).default([]),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(3).max(190).optional(),
  objective: z.string().trim().min(10).max(5000).optional(),
  description: z.string().trim().max(20000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).nullable().optional(),
  paused: z.boolean().optional(),
  /** Sends a task in review back to the team with the director's instructions. */
  feedback: z.string().trim().min(5, "Describe qué hay que cambiar").max(3000).optional(),
});

export const agentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.string().trim().min(2).max(120).optional(),
  personality: z.string().trim().min(10).max(5000).optional(),
  responsibilities: z.string().trim().min(10).max(10000).optional(),
  systemPrompt: z.string().trim().min(20).max(20000).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  fallbackModel: z.string().trim().max(120).nullable().optional(),
  autoModel: z.boolean().optional(),
  maxIterations: z.number().int().min(1).max(20).optional(),
  dailyTokenLimit: z.number().int().min(1000).max(10_000_000).nullable().optional(),
  departmentId: z.string().min(1).optional(),
  status: z.enum(AGENT_STATUSES).optional(),
  providerId: z.string().min(1).nullable().optional(),
  fallbackProviderId: z.string().min(1).nullable().optional(),
  tools: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(1000).default(""),
        isEnabled: z.boolean().default(true),
        requiresApproval: z.boolean().default(false),
      }),
    )
    .max(30)
    .optional(),
});

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Usa un color hexadecimal")
    .default("#34d399"),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(10000).default(""),
  objective: z.string().trim().min(10).max(5000),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export const settingsUpdateSchema = z.object({
  officePaused: z.boolean().optional(),
  maxTaskTokens: z.number().int().min(0).max(5_000_000).optional(),
  qualityMinScore: z.number().int().min(1).max(10).optional(),
  autoApprove: z.boolean().optional(),
});

export const providerUpdateSchema = z.object({
  apiKey: z.string().trim().max(500).nullable().optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  baseUrl: z.string().trim().url("La URL base no es válida").max(500).nullable().optional(),
});

const knowledgeBaseSchema = z.object({
  kind: z.enum(KNOWLEDGE_KINDS),
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(10).max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  isActive: z.boolean().default(true),
});

export const knowledgeCreateSchema = knowledgeBaseSchema;
export const knowledgeUpdateSchema = knowledgeBaseSchema.partial();

export const agentMemoryCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(10).max(10000),
  importance: z.number().int().min(1).max(5).default(2),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

export const agentMemoryUpdateSchema = agentMemoryCreateSchema.partial();

export const chatChannelSchema = z.string().regex(/^(group|dm:[a-z0-9]+)$/, "Canal no válido");

export const chatMessageCreateSchema = z.object({
  channel: chatChannelSchema,
  content: z.string().trim().min(1, "Escribe un mensaje").max(4000),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;
export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;
export type KnowledgeUpdateInput = z.infer<typeof knowledgeUpdateSchema>;
export type AgentMemoryCreateInput = z.infer<typeof agentMemoryCreateSchema>;
export type ChatMessageCreateInput = z.infer<typeof chatMessageCreateSchema>;
export type AgentMemoryUpdateInput = z.infer<typeof agentMemoryUpdateSchema>;
