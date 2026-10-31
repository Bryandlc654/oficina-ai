import { db } from "../lib/db";

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[…contenido truncado…]`;
}

export function formatDependencyResults(
  dependencies: { dependsOn: { title: string; result: string | null } }[],
  maxCharsEach = 2500,
): string {
  if (dependencies.length === 0) return "Sin dependencias previas.";

  return dependencies
    .map((dependency) => {
      const result = dependency.dependsOn.result ?? "Sin resultado registrado.";
      return `### ${dependency.dependsOn.title}\n${truncate(result, maxCharsEach)}`;
    })
    .join("\n\n");
}

export async function loadTaskSubtasks(taskId: string) {
  return db.subtask.findMany({
    where: { taskId },
    orderBy: { order: "asc" },
    include: {
      dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true, result: true } } } },
      assignedAgent: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
}
