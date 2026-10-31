"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, MessageSquareReply, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { extractApiError } from "@/lib/client-error";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function TaskActions({
  taskId,
  status,
  scheduledFor,
  pausedAt,
  approvalStatus,
}: {
  taskId: string;
  status: string;
  scheduledFor: string | null;
  pausedAt: string | null;
  approvalStatus: string;
}) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(toLocalInput(scheduledFor));
  const [busy, setBusy] = useState<"schedule" | "cancel" | "reopen" | "pause" | "approve" | "revise" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const canCancel = status !== "COMPLETED" && status !== "CANCELLED";
  const canReopen = status === "CANCELLED" || status === "FAILED";
  const canApprove = status === "REVIEW" || (status === "COMPLETED" && approvalStatus !== "APPROVED");
  const canRevise = status === "REVIEW" || status === "COMPLETED";
  const isPaused = pausedAt !== null;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setMessage({ kind: "error", text: extractApiError(payload) });
      return false;
    }

    router.refresh();
    return true;
  }

  async function saveSchedule() {
    setBusy("schedule");
    setMessage(null);
    try {
      const ok = await patch({ scheduledFor: schedule ? new Date(schedule).toISOString() : null });
      if (ok) setMessage({ kind: "ok", text: schedule ? "Fecha de ejecución actualizada" : "Ejecución programada eliminada" });
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  async function cancelTask() {
    if (!window.confirm("¿Cancelar esta tarea? Las subtareas activas dejarán de ejecutarse.")) return;
    setBusy("cancel");
    setMessage(null);
    try {
      const ok = await patch({ status: "CANCELLED" });
      if (ok) setMessage({ kind: "ok", text: "Tarea cancelada" });
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  async function reopenTask() {
    setBusy("reopen");
    setMessage(null);
    try {
      const ok = await patch({ status: "PENDING" });
      if (ok) setMessage({ kind: "ok", text: "Tarea reabierta" });
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  async function approveTask() {
    setBusy("approve");
    setMessage(null);
    try {
      const ok = await patch({ status: "COMPLETED" });
      if (ok) setMessage({ kind: "ok", text: "Tarea aprobada y completada" });
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  async function reviseTask() {
    setBusy("revise");
    setMessage(null);
    try {
      const ok = await patch({ feedback });
      if (ok) {
        setFeedback("");
        setMessage({ kind: "ok", text: "Tarea devuelta al equipo con tus indicaciones" });
      }
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  async function togglePause() {
    setBusy("pause");
    setMessage(null);
    try {
      const ok = await patch({ paused: !isPaused });
      if (ok) {
        setMessage({
          kind: "ok",
          text: isPaused ? "Tarea reanudada y programada" : "Tarea pausada: se detendrá al terminar la llamada en curso",
        });
      }
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel p-5">
      <h2 className="text-sm font-semibold text-white">Programación</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {status === "REVIEW"
          ? "Pendiente de tu decisión: apruébala tal cual o devuélvela al equipo con indicaciones."
          : "Las tareas se ejecutan automáticamente en segundo plano."}
      </p>

      <label htmlFor="task-schedule-edit" className="label mt-4">
        Fecha de ejecución
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="task-schedule-edit"
          type="datetime-local"
          className="input"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
        />
        <button type="button" onClick={saveSchedule} disabled={busy !== null} className="btn-secondary shrink-0">
          <CalendarClock className="h-4 w-4" />
          {busy === "schedule" ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove ? (
          <button type="button" onClick={approveTask} disabled={busy !== null} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" />
            {busy === "approve" ? "Aprobando…" : "Aprobar y completar"}
          </button>
        ) : null}
        {canCancel || isPaused ? (
          <button type="button" onClick={togglePause} disabled={busy !== null} className="btn-secondary">
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {busy === "pause" ? "Actualizando…" : isPaused ? "Reanudar tarea" : "Pausar tarea"}
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" onClick={cancelTask} disabled={busy !== null} className="btn-danger">
            <XCircle className="h-4 w-4" />
            {busy === "cancel" ? "Cancelando…" : "Cancelar tarea"}
          </button>
        ) : null}
        {canReopen ? (
          <button type="button" onClick={reopenTask} disabled={busy !== null} className="btn-secondary">
            <RotateCcw className="h-4 w-4" />
            {busy === "reopen" ? "Reabriendo…" : "Reabrir como pendiente"}
          </button>
        ) : null}
      </div>

      {canRevise ? (
        <div className="mt-5 border-t border-white/6 pt-4">
          <label htmlFor="task-feedback" className="label">
            Pedir cambios al equipo
          </label>
          <textarea
            id="task-feedback"
            className="input min-h-[80px]"
            placeholder="Ej.: no inventes cifras; usa solo datos de nuestra web y entrega un prompt para generar la imagen"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <button
            type="button"
            onClick={reviseTask}
            disabled={busy !== null || feedback.trim().length < 5}
            className="btn-secondary mt-2"
          >
            <MessageSquareReply className="h-4 w-4" />
            {busy === "revise" ? "Enviando…" : "Rehacer con estas indicaciones"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p className={message.kind === "ok" ? "mt-3 text-xs text-emerald-300" : "mt-3 text-xs text-rose-300"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
