export const TASK_STATUSES = [
  "SCHEDULED",
  "PENDING",
  "PLANNING",
  "RUNNING",
  "REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  SCHEDULED: "Programada",
  PENDING: "Pendiente",
  PLANNING: "Planificando",
  RUNNING: "En ejecución",
  REVIEW: "En revisión",
  COMPLETED: "Completada",
  FAILED: "Error",
  CANCELLED: "Cancelada",
};

export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  SCHEDULED: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  PENDING: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
  PLANNING: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  RUNNING: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  REVIEW: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  FAILED: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  CANCELLED: "bg-zinc-700/20 text-zinc-400 border-zinc-700/40",
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  SCHEDULED: "bg-sky-400",
  PENDING: "bg-zinc-500",
  PLANNING: "bg-violet-400",
  RUNNING: "bg-amber-400",
  REVIEW: "bg-blue-400",
  COMPLETED: "bg-emerald-400",
  FAILED: "bg-rose-400",
  CANCELLED: "bg-zinc-600",
};

export const KANBAN_COLUMNS: TaskStatus[] = [
  "SCHEDULED",
  "PENDING",
  "PLANNING",
  "RUNNING",
  "REVIEW",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: "bg-zinc-500/10 text-zinc-400 border-zinc-600/30",
  MEDIUM: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  HIGH: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  URGENT: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export const TASK_PRIORITY_DOT: Record<TaskPriority, string> = {
  LOW: "bg-zinc-500",
  MEDIUM: "bg-sky-400",
  HIGH: "bg-amber-400",
  URGENT: "bg-rose-400",
};

export const AGENT_STATUSES = ["AVAILABLE", "WORKING", "ON_BREAK", "OFFLINE"] as const;
export type AgentStatusValue = (typeof AGENT_STATUSES)[number];

export const AGENT_STATUS_LABELS: Record<AgentStatusValue, string> = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando",
  ON_BREAK: "En pausa",
  OFFLINE: "Desconectado",
};

export const AGENT_STATUS_DOT: Record<AgentStatusValue, string> = {
  AVAILABLE: "bg-emerald-400",
  WORKING: "bg-amber-400",
  ON_BREAK: "bg-sky-400",
  OFFLINE: "bg-zinc-600",
};

export const SUBTASK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignada",
  RUNNING: "En ejecución",
  REVIEW: "En revisión",
  COMPLETED: "Completada",
  FAILED: "Error",
  CANCELLED: "Cancelada",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  QUEUED: "En cola",
  RUNNING: "Ejecutando",
  SUCCEEDED: "Completada",
  FAILED: "Error",
  CANCELLED: "Cancelada",
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Programada",
  QUEUED: "En cola",
  ACTIVE: "Ejecutando",
  COMPLETED: "Completada",
  FAILED: "Error",
  CANCELLED: "Cancelada",
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "No requerida",
  PENDING: "Pendiente del director",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

export const DELIVERABLE_TYPE_LABELS: Record<string, string> = {  DOCUMENT: "Documento",
  REPORT: "Informe",
  STRATEGY: "Estrategia",
  ANALYSIS: "Análisis",
  TEXT: "Texto",
  CODE: "Código",
  ATTACHMENT: "Adjunto",
  PROMPT: "Prompt",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planificación",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Completado",
  ARCHIVED: "Archivado",
};

export const KNOWLEDGE_KINDS = [
  "COMPANY",
  "SERVICE",
  "PRODUCT",
  "CLIENT",
  "PROCEDURE",
  "DOCUMENT",
  "GOAL",
] as const;
export type KnowledgeKindValue = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABELS: Record<string, string> = {
  COMPANY: "Empresa",
  SERVICE: "Servicio",
  PRODUCT: "Producto",
  CLIENT: "Cliente",
  PROCEDURE: "Procedimiento",
  DOCUMENT: "Documentación",
  GOAL: "Objetivo",
};

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
