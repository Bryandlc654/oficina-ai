"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { cn } from "@/lib/format";

type RealtimeStatus = "connecting" | "online" | "offline";

export type OfficeEvent = {
  type: string;
  status?: string;
  message?: string;
  channel?: string;
  agentId?: string;
  agentName?: string;
};

type Listener = (event: OfficeEvent) => void;

type Toast = { id: number; text: string; kind: "info" | "ok" | "warn" };

const RealtimeContext = createContext<{ status: RealtimeStatus; listeners: Set<Listener> }>({
  status: "connecting",
  listeners: new Set(),
});

export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}

/** Subscribe to raw office events (e.g. chat) without waiting for a page refresh. */
export function useOfficeEvents(handler: Listener) {
  const { listeners } = useContext(RealtimeContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener: Listener = (event) => ref.current(event);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listeners]);
}

function toastText(event: OfficeEvent): string | null {
  if (event.message) return event.message;

  switch (event.type) {
    case "deliverable.created":
      return "Nuevo entregable disponible";
    case "task.plan.created":
      return "Plan de trabajo creado";
    case "task.reviewed":
      return "Revisión del Project Manager completada";
    case "task.scheduled":
      return "Tarea programada";
    case "task.status":
      return `Estado de tarea: ${event.status ?? "actualizado"}`;
    case "subtask.status":
      return `Subtarea: ${event.status ?? "actualizada"}`;
    case "agent.status":
      return `Empleado: ${event.status ?? "actualizado"}`;
    default:
      return null;
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const [listeners] = useState(() => new Set<Listener>());

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => setStatus("online"));
    socket.on("disconnect", () => setStatus("offline"));
    socket.on("connect_error", () => setStatus("offline"));

    socket.on("office:event", (event: OfficeEvent) => {
      listeners.forEach((listener) => listener(event));
      // Chat has its own live view; it shouldn't toast or re-render every page.
      if (event.type.startsWith("chat.")) return;

      const text = toastText(event);
      if (text) {
        counter.current += 1;
        const id = counter.current;
        setToasts((current) => [...current.slice(-3), { id, text, kind: event.type === "task.status" && event.status === "FAILED" ? "warn" : "info" }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 6000);
      }

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        router.refresh();
      }, 600);
    });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      socket.disconnect();
    };
  }, [router, listeners]);

  return (
    <RealtimeContext.Provider value={{ status, listeners }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-xl border bg-surface-900/95 px-3.5 py-2.5 text-xs shadow-xl shadow-black/50 backdrop-blur-xl",
              toast.kind === "warn" ? "border-rose-500/30 text-rose-200" : "border-white/10 text-zinc-300",
            )}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </RealtimeContext.Provider>
  );
}

export function RealtimeBadge() {
  const { status } = useRealtimeStatus();

  const config =
    status === "online"
      ? { label: "En vivo", dot: "bg-emerald-400", className: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300" }
      : status === "connecting"
        ? { label: "Conectando", dot: "bg-amber-400", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" }
        : { label: "Sin conexión", dot: "bg-zinc-500", className: "border-white/10 bg-white/[0.03] text-zinc-400" };

  return (
    <span className={cn("hidden items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium sm:inline-flex", config.className)}>
      <span className={cn("live-dot h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
