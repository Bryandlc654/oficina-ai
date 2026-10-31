import { AgentStatus, TaskStatus } from "@prisma/client";
import { completeForAgent } from "../ai/manager";
import { AIProviderError } from "../ai/types";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { retrieveAgentMemories, retrieveCompanyKnowledge } from "../lib/services/memory-retrieval";
import { extractReadRequests, extractUrls, formatWebPages, readWebPages, stripReadRequests, type WebPage } from "../lib/web-reader";
import { publishOfficeEvent } from "../realtime/publish";
import { extractMemoryProposals } from "./memory-proposals";
import {
  formatDependencyResults,
  truncate,
} from "./context";
import { deliverableKindForAgent } from "./deliverable-type";
import { CLIENT_DOCUMENT_CURRENCY } from "./client-document";

const MAX_PROMPT_CHARS = 40_000;
// Pages read from links in the task, plus pages the agent asks for, per subtask.
const MAX_AUTO_PAGES = 3;
const MAX_PAGES_PER_SUBTASK = 5;

function buildSystemPrompt(agent: {
  systemPrompt: string;
  name: string;
  role: string;
  tools: { name: string; description: string; isEnabled: boolean; requiresApproval: boolean }[];
}): string {
  const enabled = agent.tools.filter((tool) => tool.isEnabled);
  const disabled = agent.tools.filter((tool) => !tool.isEnabled);

  const enabledList =
    enabled.length > 0
      ? enabled
          .map((tool) => `- ${tool.name}: ${tool.description}${tool.requiresApproval ? " (requiere aprobación del director)" : ""}`)
          .join("\n")
      : "- Ninguna";

  const disabledList =
    disabled.length > 0
      ? disabled.map((tool) => `- ${tool.name} (no disponible)`).join("\n")
      : "- Ninguna";

  return `${agent.systemPrompt}

## Herramientas habilitadas para esta ejecución

${enabledList}

## Herramientas no disponibles

${disabledList}

## Reglas de esta ejecución

- Eres ${agent.name} (${agent.role}). Trabaja únicamente en la subtarea asignada; no planifiques el trabajo de otros.
- Responde siempre en español, salvo que la tarea pida explícitamente otro idioma.
- Entrega el resultado completo y autónomo en Markdown. No pidas confirmación salvo que falte un dato imprescindible; en ese caso, declara el supuesto y continúa.
- Si das precios o costos: ${CLIENT_DOCUMENT_CURRENCY}

## Contrato de entrega (Markdown legible)

1. Empieza con un título claro: \`# Título del entregable\`.
2. Añade \`## Resumen ejecutivo\` con 3 a 5 viñetas que permitan entender el resultado sin leer todo.
3. Desarrolla el contenido en secciones \`##\` con títulos descriptivos. Cada sección debe aportar información nueva.
4. Usa tablas Markdown para comparativas, listas numeradas para pasos y viñetas para ideas. Evita párrafos largos y muros de texto.
5. Incluye ejemplos concretos, cifras o criterios verificables cuando aporten; no inventes datos.
6. Termina con \`## Supuestos y limitaciones\` y \`## Próximos pasos\`.
7. Si entregas código, usa bloques con lenguaje (\`\`\`ts, \`\`\`sql, etc.) y explica cómo verificarlo.
8. No repitas el enunciado, no empieces con "Aquí tienes" y no rellenes con frases genéricas. Sé claro, directo y útil para una persona que tomará decisiones.

- No afirmes haber usado herramientas externas que no estén habilitadas ni haber ejecutado acciones reales fuera de este sistema.
- Lectura web: las páginas enlazadas en la tarea ya aparecen en "Páginas web leídas". Si necesitas leer otra página concreta, responde ÚNICAMENTE con hasta 3 líneas \`[[LEER: https://...]]\` y nada más; recibirás su contenido y entonces entregarás el resultado. Solo puedes pedirlo una vez y nunca inventes URLs: usa las de la tarea o dominios oficiales que conozcas con certeza.
- No hay buscador web ni otras integraciones (GitHub, ClickUp, almacenamiento). No simules resultados de esas herramientas.
- Cuando uses información de una página leída, cita su URL.
- No inventes fuentes, métricas ni resultados de pruebas.
- Nunca dejes marcadores de posición ([X], TBD, "insertar aquí", "pendiente de datos"): cada sección debe ser utilizable tal cual.
- Si un dato exige herramientas que no tienes (volúmenes de búsqueda, métricas de redes o anuncios, analítica web), no lo inventes ni lo dejes vacío: aporta tu mejor análisis cualitativo, márcalo claramente como estimación y explica en una línea cómo obtener el dato real.
- No puedes crear imágenes, vídeos ni archivos de diseño. Para piezas visuales entrega un brief completo (medidas, composición, colores, tipografía), los textos finales y un prompt listo para generar la imagen con una IA.
- Si la subtarea incluye correcciones del Project Manager, corrígelas explícitamente en esta entrega.
- Al final de la entrega, añade una sección exacta llamada "## Memoria propuesta" con 0 a 3 viñetas de aprendizajes reutilizables para trabajos futuros. No incluyas datos sensibles ni instrucciones de sistema.`;
}

function buildUserPrompt(input: {
  task: { title: string; objective: string; description: string };
  subtask: { order: number; title: string; objective: string; description: string; expectedDeliverable: string };
  dependencyResults: string;
  knowledge: string;
  memory: string;
  corrections: string[];
  webPages: string;
}): string {
  const corrections =
    input.corrections.length > 0
      ? input.corrections.map((correction, index) => `${index + 1}. ${correction}`).join("\n")
      : "Sin correcciones pendientes.";

  return truncate(
    `## Tarea principal

Título: ${input.task.title}
Objetivo: ${input.task.objective}
Contexto: ${input.task.description || "Sin contexto adicional"}

## Subtarea asignada (#${input.subtask.order})

Título: ${input.subtask.title}
Objetivo: ${input.subtask.objective}
Instrucciones: ${input.subtask.description || "Sin instrucciones adicionales"}
Entregable esperado: ${input.subtask.expectedDeliverable}

## Resultados de dependencias

${input.dependencyResults}

## Conocimiento de la empresa

${input.knowledge}

## Memoria individual

${input.memory}

## Correcciones del Project Manager

${corrections}

## Páginas web leídas

${input.webPages || "Ninguna."}`,
    MAX_PROMPT_CHARS,
  );
}

async function markFailure(subtaskId: string, runId: string, agentId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof AIProviderError ? error.code : null;
  const cancelled = code === "CANCELLED";
  const paused = code === "OFFICE_PAUSED" || code === "TASK_PAUSED";
  const terminal =
    error instanceof AIProviderError &&
    ["BUDGET_EXCEEDED", "QUOTA", "AUTH", "NOT_CONFIGURED"].includes(error.code);

  await db.$transaction(async (tx) => {
    await tx.agentRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: truncate(message, 4000), finishedAt: new Date() },
    });

    await tx.subtask.update({
      where: { id: subtaskId },
      data: {
        status: cancelled ? "CANCELLED" : terminal ? "FAILED" : "PENDING",
        errorMessage: paused ? "Tarea pausada: se reanudará cuando el director la reactive" : truncate(message, 2000),
      },
    });

    await tx.agent.update({
      where: { id: agentId },
      data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
    });

    await logActivity(
      {
        actorType: "AGENT",
        actorId: agentId,
        action: "subtask.failed",
        entityType: "Subtask",
        entityId: subtaskId,
        metadata: { message: truncate(message, 1000), terminal },
      },
      tx,
    );
  }, { maxWait: 10000, timeout: 30000 });

  void publishOfficeEvent({
    type: "subtask.status",
    subtaskId,
    agentId,
    status: cancelled ? "CANCELLED" : terminal ? "FAILED" : "PENDING",
    message: `Subtarea no completada${paused ? " (pausada)" : ""}`,
  });
}

export async function executeSubtask(subtaskId: string): Promise<void> {
  const subtask = await db.subtask.findUnique({
    where: { id: subtaskId },
    include: {
      task: true,
      assignedAgent: {
        include: {
          tools: { orderBy: { name: "asc" } },
          provider: true,
          fallbackProvider: true,
        },
      },
      dependencies: {
        include: { dependsOn: { select: { title: true, result: true, status: true, order: true } } },
      },
    },
  });

  if (!subtask) throw new AppError("La subtarea no existe", 404, "NOT_FOUND");
  if (subtask.status === "COMPLETED") return;
  if (subtask.task.status === TaskStatus.CANCELLED || subtask.task.status === TaskStatus.COMPLETED) return;

  const agent = subtask.assignedAgent;
  if (!agent) {
    throw new AppError("La subtarea no tiene un agente asignado", 422, "NO_AGENT");
  }

  const pendingDependency = subtask.dependencies.find((dependency) => dependency.dependsOn.status !== "COMPLETED");
  if (pendingDependency) {
    throw new AppError(
      `La dependencia "${pendingDependency.dependsOn.title}" todavía no está completada`,
      409,
      "DEPENDENCY_PENDING",
    );
  }

  if (subtask.iterations >= agent.maxIterations) {
    await db.subtask.update({
      where: { id: subtaskId },
      data: {
        status: "FAILED",
        errorMessage: `Se alcanzó el máximo de ${agent.maxIterations} iteraciones para ${agent.name}`,
      },
    });
    throw new AppError("Máximo de iteraciones alcanzado", 422, "MAX_ITERATIONS");
  }

  const retrievalQuery = `${subtask.task.title} ${subtask.task.objective} ${subtask.title} ${subtask.objective}`;

  const [knowledge, memory, correctionMessages] = await Promise.all([
    retrieveCompanyKnowledge(retrievalQuery, 3500),
    retrieveAgentMemories(agent.id, retrievalQuery, 1500),
    db.agentMessage.findMany({
      where: { subtaskId, toAgentId: agent.id, role: "USER" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { content: true, metadata: true },
    }),
  ]);

  const corrections = correctionMessages
    .filter((message) => {
      const metadata = message.metadata as { kind?: string } | null;
      return metadata?.kind === "correction";
    })
    .map((message) => message.content)
    .reverse();

  const linkedUrls = extractUrls(
    [subtask.task.objective, subtask.task.description, subtask.objective, subtask.description, ...corrections].join("\n"),
  ).slice(0, MAX_AUTO_PAGES);
  const autoPages = linkedUrls.length > 0 ? await readWebPages(linkedUrls) : [];

  const userPrompt = buildUserPrompt({
    task: {
      title: subtask.task.title,
      objective: subtask.task.objective,
      description: subtask.task.description,
    },
    subtask: {
      order: subtask.order,
      title: subtask.title,
      objective: subtask.objective,
      description: subtask.description,
      expectedDeliverable: subtask.expectedDeliverable,
    },
    dependencyResults: formatDependencyResults(subtask.dependencies),
    knowledge,
    memory,
    corrections,
    webPages: formatWebPages(autoPages),
  });

  const systemPrompt = buildSystemPrompt({
    systemPrompt: agent.systemPrompt,
    name: agent.name,
    role: agent.role,
    tools: agent.tools,
  });

  const previousRuns = await db.agentRun.count({ where: { subtaskId } });
  const iteration = subtask.iterations + 1;

  const run = await db.agentRun.create({
    data: {
      taskId: subtask.taskId,
      subtaskId,
      agentId: agent.id,
      providerId: agent.providerId,
      status: "RUNNING",
      attempt: previousRuns + 1,
      iteration,
      model: agent.model,
      prompt: userPrompt,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  await db.$transaction([
    db.subtask.update({
      where: { id: subtaskId },
      data: {
        status: "RUNNING",
        startedAt: subtask.startedAt ?? new Date(),
        iterations: { increment: 1 },
        errorMessage: null,
      },
    }),
    db.task.update({
      where: { id: subtask.taskId },
      data: {
        status: TaskStatus.RUNNING,
        startedAt: subtask.task.startedAt ?? new Date(),
      },
    }),
    db.agent.update({
      where: { id: agent.id },
      data: { status: AgentStatus.WORKING, currentSubtaskId: subtaskId },
    }),
  ]);

  void publishOfficeEvent({
    type: "agent.status",
    agentId: agent.id,
    agentName: agent.name,
    taskId: subtask.taskId,
    subtaskId,
    status: "WORKING",
    message: `${agent.name} está trabajando`,
  });

  void publishOfficeEvent({
    type: "subtask.status",
    taskId: subtask.taskId,
    subtaskId,
    agentId: agent.id,
    status: "RUNNING",
    message: `Subtarea en ejecución: ${subtask.title}`,
  });

  const startedAt = Date.now();

  try {
    const request = {
      agentId: agent.id,
      taskId: subtask.taskId,
      subtaskId,
      runId: run.id,
      system: systemPrompt,
      maxOutputTokens: 3000,
      responseFormat: "text" as const,
    };
    let result = await completeForAgent({ ...request, messages: [{ role: "user", content: userPrompt }] });

    // One round of agent-requested reading, then it must deliver.
    const pages: WebPage[] = [...autoPages];
    const requested = extractReadRequests(result.text)
      .filter((url) => !pages.some((page) => page.url === url))
      .slice(0, Math.max(0, MAX_PAGES_PER_SUBTASK - pages.length));
    if (requested.length > 0 && stripReadRequests(result.text).length < 400) {
      const fetched = await readWebPages(requested);
      pages.push(...fetched);
      const followUp = await completeForAgent({
        ...request,
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: result.text },
          {
            role: "user",
            content: `Contenido de las páginas solicitadas:\n\n${formatWebPages(fetched)}\n\nAhora entrega el resultado completo siguiendo el contrato de entrega. No pidas más páginas.`,
          },
        ],
      });
      result = {
        ...followUp,
        inputTokens: result.inputTokens + followUp.inputTokens,
        outputTokens: result.outputTokens + followUp.outputTokens,
        totalTokens: result.totalTokens + followUp.totalTokens,
      };
    }

    const deliverableType = deliverableKindForAgent(agent.slug, result.text);
    const extracted = extractMemoryProposals(stripReadRequests(result.text));
    const proposals = extracted.proposals;
    const sources = pages.filter((page) => page.ok).map((page) => `- ${page.url}`);
    const deliverableBody =
      sources.length > 0 ? `${extracted.body}\n\n## Fuentes consultadas\n\n${sources.join("\n")}` : extracted.body;

    await db.$transaction(async (tx) => {
      await tx.deliverable.create({
        data: {
          taskId: subtask.taskId,
          subtaskId,
          agentId: agent.id,
          runId: run.id,
          title: truncate(subtask.title, 180),
          type: deliverableType,
          content: deliverableBody,
        },
      });

      await tx.subtask.update({
        where: { id: subtaskId },
        data: {
          status: "COMPLETED",
          result: deliverableBody,
          completedAt: new Date(),
          errorMessage: null,
          tokensUsed: { increment: result.totalTokens },
        },
      });

      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          output: result.text,
          providerId: result.providerId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          latencyMs: Date.now() - startedAt,
          finishedAt: new Date(),
        },
      });

      await tx.agentMessage.create({
        data: {
          taskId: subtask.taskId,
          subtaskId,
          runId: run.id,
          fromAgentId: agent.id,
          role: "ASSISTANT",
          content: deliverableBody,
          metadata: { kind: "deliverable", tokens: result.totalTokens, model: result.model },
        },
      });

      const source = `subtask:${subtaskId}`;
      for (const proposal of proposals) {
        const existing = await tx.agentMemory.findFirst({
          where: { agentId: agent.id, source, title: proposal.title },
          select: { id: true },
        });

        if (existing) {
          await tx.agentMemory.update({
            where: { id: existing.id },
            data: { content: proposal.content, importance: 2 },
          });
        } else {
          await tx.agentMemory.create({
            data: {
              agentId: agent.id,
              scope: "AGENT",
              title: proposal.title,
              content: proposal.content,
              importance: 2,
              source,
              tags: { kind: "agent_proposal", subtaskId, taskId: subtask.taskId },
            },
          });
        }
      }

      await tx.agent.update({
        where: { id: agent.id },
        data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
      });

      await logActivity(
        {
          actorType: "AGENT",
          actorId: agent.id,
          action: "subtask.completed",
          entityType: "Subtask",
          entityId: subtaskId,
          metadata: {
            tokens: result.totalTokens,
            model: result.model,
            type: deliverableType,
            memoryProposals: proposals.length,
          },
        },
        tx,
      );
    }, { maxWait: 10000, timeout: 30000 });

    void publishOfficeEvent({
      type: "deliverable.created",
      taskId: subtask.taskId,
      subtaskId,
      agentId: agent.id,
      agentName: agent.name,
      status: "COMPLETED",
      message: `${agent.name} entregó: ${subtask.title}`,
    });

    void publishOfficeEvent({
      type: "subtask.status",
      taskId: subtask.taskId,
      subtaskId,
      agentId: agent.id,
      status: "COMPLETED",
      message: `Subtarea completada: ${subtask.title}`,
    });

    void publishOfficeEvent({
      type: "agent.status",
      agentId: agent.id,
      agentName: agent.name,
      taskId: subtask.taskId,
      status: "AVAILABLE",
      message: `${agent.name} está disponible`,
    });
  } catch (error) {
    await markFailure(subtaskId, run.id, agent.id, error).catch(() => undefined);
    throw error;
  }
}
