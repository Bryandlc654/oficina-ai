"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Brain,
  Building2,
  Cpu,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  MessagesSquare,
  Pause,
  Play,
  Settings,
  Users,
  X,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/format";
import { RealtimeBadge, RealtimeProvider } from "@/components/realtime/realtime-provider";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Trabajo",
    items: [
      { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
      { href: "/office", label: "Oficina 3D", icon: Boxes },
      { href: "/chat", label: "Chat", icon: MessagesSquare },
      { href: "/tasks", label: "Tareas", icon: ListTodo },
      { href: "/projects", label: "Proyectos", icon: FolderKanban },
      { href: "/deliverables", label: "Entregables", icon: FileText },
    ],
  },
  {
    group: "Equipo",
    items: [
      { href: "/employees", label: "Empleados", icon: Users },
      { href: "/departments", label: "Departamentos", icon: Building2 },
      { href: "/memory", label: "Memoria", icon: Brain },
    ],
  },
  {
    group: "Sistema",
    items: [
      { href: "/activity", label: "Actividad", icon: Activity },
      { href: "/ai", label: "Inteligencia artificial", icon: Cpu },
      { href: "/usage", label: "Consumo", icon: BarChart3 },
      { href: "/settings", label: "Configuración", icon: Settings },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((group) => group.items);

export function AppShell({
  adminName,
  paused,
  children,
}: {
  adminName: string;
  paused: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(paused);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  useEffect(() => {
    setIsPaused(paused);
  }, [paused]);

  async function togglePause() {
    setPauseBusy(true);
    setPauseError(null);
    const next = !isPaused;

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officePaused: next }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setPauseError(payload?.error?.message ?? "No se pudo cambiar el estado");
        return;
      }
      setIsPaused(next);
      router.refresh();
    } catch {
      setPauseError("No hay conexión con el servidor");
    } finally {
      setPauseBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  const current = [...ALL_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="px-2.5 pb-1.5 text-[9px] font-medium uppercase tracking-[0.2em] text-zinc-600">
            {group.group}
          </p>
          <ul className="space-y-px">
            {group.items.map((item) => {
              const active = current?.href === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
                      active
                        ? "bg-white/[0.055] text-zinc-100"
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200",
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
                    ) : null}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-emerald-300/90" : "text-zinc-600 group-hover:text-zinc-400",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <RealtimeProvider>
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="hidden lg:block" aria-hidden />

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col border-r border-white/[0.05] bg-[#070a0e]/98 backdrop-blur-xl transition-transform duration-200 lg:w-[248px] lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/dashboard" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
              <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-zinc-100">AI Virtual Office</p>
                <p className="truncate text-[10px] text-zinc-600">Dirección general</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {nav}

          <div className="border-t border-white/[0.05] p-2.5">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-800/80 text-[10px] font-medium text-zinc-400">
                {adminName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-zinc-300">{adminName}</p>
                <p className="truncate text-[9px] uppercase tracking-[0.14em] text-zinc-600">Administrador</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md p-1.5 text-zinc-600 transition hover:bg-white/5 hover:text-rose-300"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          />
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-white/[0.05] bg-surface-950/80 px-4 backdrop-blur-xl lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md border border-white/[0.08] p-1.5 text-zinc-500 hover:text-white lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4" />
              </button>
              <p className="truncate text-[11px] text-zinc-600">
                Oficina <span className="mx-1 text-zinc-700">/</span>
                <span className="text-zinc-300">{current?.label ?? "Panel"}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <RealtimeBadge />
              {pauseError ? <span className="hidden text-[11px] text-rose-300 sm:inline">{pauseError}</span> : null}
              <button
                type="button"
                onClick={togglePause}
                disabled={pauseBusy}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium transition disabled:opacity-60",
                  isPaused
                    ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300 hover:bg-amber-500/[0.12]"
                    : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
                )}
                title={isPaused ? "Reanudar ejecuciones" : "Pausar todas las ejecuciones"}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isPaused ? "bg-amber-400" : "live-dot bg-emerald-400 text-emerald-400",
                  )}
                />
                {pauseBusy ? "Actualizando" : isPaused ? "Pausada" : "Activa"}
                {isPaused ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
