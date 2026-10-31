import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function timeAgo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "hace unos segundos";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDate(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function truncateLabel(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function humanizeAction(action: string): string {  const map: Record<string, string> = {
    "task.created": "creó la tarea",
    "task.updated": "actualizó la tarea",
    "task.status.changed": "cambió el estado de la tarea",
    "agent.updated": "actualizó un empleado",
    "agent.system_prompt.updated": "actualizó el system prompt de un empleado",
    "agent.status.changed": "cambió el estado de un empleado",
    "department.created": "creó el departamento",
    "project.created": "creó el proyecto",
    "office.paused": "pausó la oficina",
    "office.resumed": "reanudó la oficina",
    "admin.login": "inició sesión",
    "admin.logout": "cerró sesión",
    "ai_provider.updated": "actualizó un proveedor de IA",
    "knowledge.created": "creó conocimiento empresarial",
    "knowledge.updated": "actualizó conocimiento empresarial",
    "knowledge.deleted": "eliminó conocimiento empresarial",
    "agent_memory.created": "añadió memoria a un empleado",
    "agent_memory.updated": "actualizó la memoria de un empleado",
    "agent_memory.deleted": "eliminó memoria de un empleado",
    "task.scheduled": "programó una tarea",
    "task.schedule.failed": "no pudo programar una tarea",
    "task.execution.paused": "pausó una tarea",
    "task.plan.created": "creó el plan de trabajo",
    "task.plan.failed": "no pudo crear el plan de trabajo",
    "task.reviewed": "revisó una tarea",
    "task.completed": "completó una tarea",
    "task.failed": "marcó una tarea con error",
    "subtask.completed": "completó una subtarea",
    "subtask.failed": "falló una subtarea",
  };
  return map[action] ?? action;
}
