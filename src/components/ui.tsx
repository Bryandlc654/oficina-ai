import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">{eyebrow}</p>
        ) : null}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-50 sm:text-[26px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("panel p-5", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-white/[0.05] px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-medium text-zinc-100">{title}</h2>
        {description ? <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("chip border-white/[0.08] bg-white/[0.03] text-zinc-300", className)}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] px-6 py-10 text-center">
      <span className="mb-3 h-1.5 w-1.5 rounded-full bg-zinc-600" />
      <p className="text-[13px] font-medium text-zinc-300">{title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-600">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">{label}</p>
        {icon ? <span className="text-zinc-600">{icon}</span> : null}
      </div>
      <p className={cn("mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-zinc-50", accent)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export function ComingSoon({
  phase,
  title,
  description,
  points,
}: {
  phase: string;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <div className="panel p-6">
      <span className="chip border-amber-500/20 bg-amber-500/[0.07] text-amber-300">{phase}</span>
      <h2 className="mt-4 text-[15px] font-medium text-zinc-100">{title}</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-500">{description}</p>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {points.map((point) => (
          <li
            key={point}
            className="flex items-start gap-2.5 rounded-lg border border-white/[0.045] bg-white/[0.015] px-3.5 py-2.5 text-[12px] text-zinc-500"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[11px] text-zinc-600">
        Esta sección se habilita en la fase indicada. No muestra datos simulados.
      </p>
    </div>
  );
}
