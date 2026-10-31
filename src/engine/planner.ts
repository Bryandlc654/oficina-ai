import { AgentStatus, TaskStatus } from "@prisma/client";
import { completeForAgent } from "../ai/manager";
import { AIProviderError } from "../ai/types";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { retrieveCompanyKnowledge } from "../lib/services/memory-retrieval";
import { publishOfficeEvent } from "../realtime/publish";
import { truncate } from "./context";
import { parsePlan, type Plan } from "./plan";
import { QA_SLUG } from "./quality";

const PM_SLUG = "project-manager";

function buildPlanningPrompt(input: {
  task: { title: string; objective: string; description: string; priority: string };
  agents: { slug: string; name: string; role: string; department: string; model: string }[];
  knowledge: string;
}): string {
  const agentList = input.agents
    .map((agent) => `- ${agent.slug} | ${agent.name} | ${agent.role} | ${agent.department} | modelo: ${agent.model}`)
    .join("\n");

  return `## Tarea a planificar

Título: ${input.task.title}
Prioridad: ${input.task.priority}
Objetivo: ${input.task.objective}
Contexto: ${input.task.description || "Sin contexto adicional"}

## Conocimiento de la empresa

${input.knowledge}

## Empleados disponibles (usa exactamente el slug)

${agentList || "No hay empleados disponibles"}

## Instrucciones

Descompón la tarea en entre 2 y 4 subtareas ejecutables (máximo 6 solo si es imprescindible): cada subtarea extra cuesta tokens, así que agrupa el trabajo relacionado en una sola. Cada subtarea debe tener un único responsable, un entregable concreto y dependencias explícitas por número de orden (1-based). Las dependencias solo pueden apuntar a subtareas anteriores; no puede haber ciclos. Las subtareas independientes se ejecutarán en paralelo, así que no inventes dependencias innecesarias.

No asignes dos subtareas simultáneas al mismo empleado si una depende de la otra. No incluyas tareas de coordinación: tú ya coordinas y revisarás al final. Un especialista no debe revisar su propio trabajo.

Todos los entregables se producen en Markdown estructurado y legible. No planifiques conversiones a PDF, DOCX, JSON ni archivos binarios; si la tarea los pide, el contenido se entrega en Markdown y se declara la limitación de formato.

Capacidades reales del equipo: solo producen texto, solo pueden leer las páginas web cuyo enlace aparezca en la tarea y no tienen herramientas de métricas (volúmenes de búsqueda, analítica, redes sociales) ni generan imágenes. No planifiques subtareas de "recopilar datos" de herramientas que no existen ni de "diseñar el archivo final"; planifica análisis con estimaciones declaradas, briefs y prompts de imagen, y textos listos para usar. Responde en español.

Devuelve SOLO un objeto JSON válido, sin texto adicional ni bloques Markdown, con esta forma exacta:

{
  "summary": "resumen del enfoque en 1-3 frases",
  "subtasks": [
    {
      "title": "título breve",
      "objective": "resultado esperado de esta subtarea",
      "description": "instrucciones concretas para el especialista",
      "expectedDeliverable": "qué debe contener el entregable",
      "agentSlug": "slug-exacto-del-empleado",
      "dependsOn": [1],
      "deliverableType": "DOCUMENT|REPORT|STRATEGY|ANALYSIS|TEXT|CODE|ATTACHMENT|PROMPT"
    }
  ]
}`;
}

export async function createPlan(taskId: string): Promise<number> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      subtasks: { select: { id: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!task) throw new AppError("La tarea no existe", 404, "NOT_FOUND");
  if (task.subtasks.length > 0) return task.subtasks.length;
  if (task.status === TaskStatus.CANCELLED) return 0;

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG } });
  if (!pm) {
    throw new AppError("No existe el Project Manager. Ejecuta el seed inicial.", 503, "PM_MISSING");
  }

  const agents = await db.agent.findMany({
    // Quality control reviews the work; it never takes subtasks.
    where: { status: { not: AgentStatus.OFFLINE }, slug: { not: QA_SLUG } },
    select: {
      id: true,
      slug: true,
      name: true,
      role: true,
      model: true,
      status: true,
      department: { select: { name: true } },
    },
    orderBy: [{ department: { order: "asc" } }, { name: "asc" }],
  });

  if (agents.length < 2) {
    throw new AppError("No hay suficientes empleados disponibles para planificar", 503, "NO_AGENTS");
  }

  const knowledge = await retrieveCompanyKnowledge(
    `${task.title} ${task.objective} ${task.description}`,
    6000,
  );
  let prompt = buildPlanningPrompt({
    task,
    agents: agents.map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      role: agent.role,
      department: agent.department.name,
      model: agent.model,
    })),
    knowledge,
  });

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.PLANNING, startedAt: task.startedAt ?? new Date() },
    }),
    db.agent.update({
      where: { id: pm.id },
      data: { status: AgentStatus.WORKING, currentSubtaskId: null },
    }),
  ]);

  const run = await db.agentRun.create({
    data: {
      taskId,
      agentId: pm.id,
      providerId: pm.providerId,
      status: "RUNNING",
      attempt: 1,
      iteration: 1,
      model: pm.model,
      prompt,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  const startedAt = Date.now();

  try {
    let result = await completeForAgent({
      agentId: pm.id,
      purpose: "review",
      taskId,
      runId: run.id,
      system: pm.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 5000,
      temperature: 0.1,
      responseFormat: "json",
    });

    let plan: Plan;
    try {
      plan = parsePlan(result.text);
    } catch {
      const repairPrompt = `La respuesta anterior no es JSON válido. Corrige el error y devuelve SOLO el objeto JSON, sin markdown ni explicaciones.

Debe tener "summary" y entre 2 y 6 "subtasks". Cada subtarea necesita title, objective, description, expectedDeliverable, agentSlug, dependsOn (números de orden anteriores) y deliverableType.

Respuesta inválida a reparar:
${result.text.slice(0, 12000)}`;

      const repaired = await completeForAgent({
        agentId: pm.id,
        purpose: "review",
        taskId,
        runId: run.id,
        system: pm.systemPrompt,
        messages: [{ role: "user", content: repairPrompt }],
        maxOutputTokens: 5000,
        temperature: 0,
        responseFormat: "json",
      });

      plan = parsePlan(repaired.text);

      result = {
        ...repaired,
        inputTokens: result.inputTokens + repaired.inputTokens,
        outputTokens: result.outputTokens + repaired.outputTokens,
        totalTokens: result.totalTokens + repaired.totalTokens,
      };

      prompt = `${prompt}\n\n## Reparación de JSON\n${repairPrompt}`;
    }

    const agentBySlug = new Map(agents.map((agent) => [agent.slug, agent]));

    for (const [index, subtask] of plan.subtasks.entries()) {
      const agent = agentBySlug.get(subtask.agentSlug);
      if (!agent) {
        throw new Error(
          `El plan asigna la subtarea ${index + 1} a un agente inexistente: ${subtask.agentSlug}`,
        );
      }
      if (agent.status === AgentStatus.OFFLINE) {
        throw new Error(`El agente ${agent.name} está desconectado y no puede recibir trabajo`);
      }
    }

    await db.$transaction(async (tx) => {
      const created: { id: string }[] = [];

      for (const [index, subtask] of plan.subtasks.entries()) {
        const agent = agentBySlug.get(subtask.agentSlug);
        if (!agent) throw new Error("Agente inválido en el plan");

        const row = await tx.subtask.create({
          data: {
            taskId,
            title: subtask.title,
            objective: subtask.objective,
            description: subtask.description,
            expectedDeliverable: subtask.expectedDeliverable,
            order: index + 1,
            status: "ASSIGNED",
            assignedAgentId: agent.id,
          },
          select: { id: true, order: true },
        });

        created.push({ id: row.id });

        await tx.taskAssignment.create({
          data: { subtaskId: row.id, agentId: agent.id, role: "OWNER" },
        });
      }

      for (const [index, subtask] of plan.subtasks.entries()) {
        const row = created[index];
        if (!row) continue;
        for (const dependency of subtask.dependsOn) {
          const dependsOn = created[dependency - 1];
          if (!dependsOn) continue;
          await tx.taskDependency.create({
            data: { subtaskId: row.id, dependsOnId: dependsOn.id },
          });
        }
      }

      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          prompt,
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

      await tx.agentMessage.createMany({
        data: [
          {
            taskId,
            runId: run.id,
            fromAgentId: pm.id,
            role: "USER",
            content: prompt,
            metadata: { kind: "planning_request" },
          },
          {
            taskId,
            runId: run.id,
            fromAgentId: pm.id,
            role: "ASSISTANT",
            content: result.text,
            metadata: { kind: "planning_response", subtasks: plan.subtasks.length },
          },
        ],
      });

      await tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.RUNNING },
      });

      await tx.agent.update({
        where: { id: pm.id },
        data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
      });

      await logActivity(
        {
          actorType: "AGENT",
          actorId: pm.id,
          action: "task.plan.created",
          entityType: "Task",
          entityId: taskId,
          metadata: { subtasks: plan.subtasks.length, summary: truncate(plan.summary, 500) },
        },
        tx,
      );
    }, { maxWait: 10000, timeout: 45000 });

    void publishOfficeEvent({
      type: "task.plan.created",
      taskId,
      status: "RUNNING",
      message: `Plan de trabajo creado: ${plan.subtasks.length} subtareas`,
    });

    return plan.subtasks.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: truncate(message, 4000),
        latencyMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    }).catch(() => undefined);

    await db.agent.update({
      where: { id: pm.id },
      data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
    }).catch(() => undefined);

    await logActivity({
      actorType: "AGENT",
      actorId: pm.id,
      action: "task.plan.failed",
      entityType: "Task",
      entityId: taskId,
      metadata: { message: truncate(message, 1000) },
    }).catch(() => undefined);

    if (error instanceof AIProviderError) throw error;
    throw new AppError(`No se pudo generar el plan: ${message}`, 422, "PLAN_FAILED");
  }
}
