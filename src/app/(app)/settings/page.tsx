import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { getOfficeSettings } from "@/lib/services/organization";
import { PageHeader, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { QualitySettings } from "./quality-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

const ENV_CHECKS = [
  { key: "DATABASE_URL", label: "Conexión MySQL" },
  { key: "REDIS_URL", label: "Redis / BullMQ" },
  { key: "AUTH_SECRET", label: "Secreto de sesión" },
  { key: "ENCRYPTION_KEY", label: "Clave de cifrado de secretos" },
] as const;

export default async function SettingsPage() {
  const session = await requireSession();
  const [settings, user, providers, agents] = await Promise.all([
    getOfficeSettings(),
    db.user.findUnique({ where: { id: session.id }, select: { lastLoginAt: true } }),
    db.aIProvider.findMany({ select: { name: true, isEnabled: true, apiKeyCipher: true, type: true } }),
    db.agent.count(),
  ]);

  const configuredProviders = providers.filter(
    (provider) => provider.isEnabled && (provider.apiKeyCipher !== null || provider.type === "OLLAMA"),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Estado de la cuenta, seguridad, pausa global y comprobaciones de entorno. Los secretos nunca se muestran."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="text-sm font-semibold text-white">Cuenta de administrador</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Nombre</dt>
              <dd className="text-zinc-300">{session.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Email</dt>
              <dd className="text-zinc-300">{session.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Rol</dt>
              <dd className="text-zinc-300">Administrador (único usuario)</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Último acceso</dt>
              <dd className="text-zinc-300">{formatDateTime(user?.lastLoginAt)}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-white/6 pt-3 text-[11px] leading-relaxed text-zinc-600">
            Para cambiar la contraseña: define ADMIN_PASSWORD, pon ADMIN_PASSWORD_RESET=true y ejecuta
            `npm run db:seed`. Después vuelve a dejar ADMIN_PASSWORD_RESET en false.
          </p>
        </Panel>

        <Panel>
          <h2 className="text-sm font-semibold text-white">Estado de la oficina</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
              <span className="text-xs text-zinc-400">Ejecuciones globales</span>
              <span
                className={
                  settings.officePaused
                    ? "chip border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-300"
                    : "chip border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-300"
                }
              >
                {settings.officePaused ? "Pausadas" : "Activas"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
              <span className="text-xs text-zinc-400">Empleados registrados</span>
              <span className="text-xs text-zinc-300">{agents}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
              <span className="text-xs text-zinc-400">Proveedores operativos</span>
              <span className="text-xs text-zinc-300">{configuredProviders.length} de {providers.length}</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
            Usa el botón de pausa en la barra superior para detener todas las ejecuciones de la oficina.
          </p>
        </Panel>

        <Panel>
          <h2 className="text-sm font-semibold text-white">Calidad y consumo</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Control de calidad revisa y puntúa cada tarea antes de entregártela en un único documento final.
          </p>
          <QualitySettings
            initial={{
              qualityMinScore: settings.qualityMinScore,
              autoApprove: settings.autoApprove,
              maxTaskTokens: settings.maxTaskTokens,
            }}
          />
        </Panel>

        <Panel>
          <h2 className="text-sm font-semibold text-white">Entorno</h2>
          <p className="mt-1 text-xs text-zinc-500">Solo se comprueba la presencia de las variables, nunca su valor.</p>
          <ul className="mt-4 space-y-2">
            {ENV_CHECKS.map((check) => {
              const present = Boolean(process.env[check.key]);
              return (
                <li key={check.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-xs text-zinc-300">{check.label}</span>
                    <span className="block font-mono text-[10px] text-zinc-600">{check.key}</span>
                  </span>
                  {present ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Definida
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-rose-300">
                      <CircleAlert className="h-3 w-3" /> Falta
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <h2 className="text-sm font-semibold text-white">Controles de seguridad</h2>
          <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-zinc-400">
            {[
              "Acceso privado con sesión firmada y cookie httpOnly.",
              "Sin registro público: el administrador se crea únicamente por seed.",
              "Claves de API cifradas con AES-256-GCM antes de guardarse en MySQL.",
              "Todas las operaciones se validan con Zod en el servidor.",
              "Cada acción relevante queda registrada en el historial de actividad.",
              "Publicar código, enviar comunicaciones o eliminar datos requiere aprobación del director.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
