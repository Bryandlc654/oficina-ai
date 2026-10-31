import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acceso" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/dashboard";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[140px]" />

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/8 bg-surface-900/80 shadow-2xl shadow-black/60 backdrop-blur-xl lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden flex-col justify-between gap-10 border-r border-white/5 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-sky-500/[0.05] p-10 lg:flex">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">AI Virtual Office</p>
              <p className="text-xs text-zinc-400">Acceso privado</p>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="text-3xl font-semibold leading-tight text-white">
              Tu equipo de IA,
              <br />
              trabajando en una oficina real.
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
              Programa objetivos, deja que el equipo planifique y ejecute, y revisa entregables
              producidos por agentes reales conectados a proveedores de IA.
            </p>

            <ul className="space-y-2.5 text-sm text-zinc-400">
              {[
                "Planificación multiaetapa coordinada por el Project Manager",
                "Ejecución autónoma con límites de tokens e iteraciones",
                "Entregables verificables y trazabilidad completa",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-zinc-600">
            Sin registro público. Solo el director general puede acceder.
          </p>
        </section>

        <section className="p-8 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
            <p className="text-sm font-semibold text-white">AI Virtual Office</p>
          </div>

          <h2 className="text-xl font-semibold text-white">Entrar como director</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Usa las credenciales creadas por el proceso de seed.
          </p>

          <LoginForm nextPath={nextPath} />
        </section>
      </div>
    </main>
  );
}
