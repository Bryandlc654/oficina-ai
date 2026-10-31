import { listProviders } from "@/lib/services/providers";
import { PageHeader } from "@/components/ui";
import { ProviderManager } from "./provider-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inteligencia artificial" };

export default async function AIPage() {
  const providers = await listProviders();

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Inteligencia artificial"
        description="OpenRouter, Gemini, Groq y Ollama. Las claves se guardan cifradas o se leen del entorno y nunca se envían al navegador."
      />

      <ProviderManager
        providers={providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          baseUrl: provider.baseUrl,
          models: provider.models,
          isEnabled: provider.isEnabled,
          isDefault: provider.isDefault,
          hasKey: provider.hasKey,
          hasEnvKey: provider.hasEnvKey,
          updatedAt: provider.updatedAt,
        }))}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-white">Cómo funciona el enrutado</h2>
          <ol className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-400">
            <li>1. Cada empleado tiene un proveedor y modelo principal.</li>
            <li>2. Si falla por cuota, timeout o error transitorio, se reintenta una vez.</li>
            <li>3. Después se prueba el proveedor alternativo configurado en el empleado.</li>
            <li>4. Como último recurso se usa el proveedor predeterminado habilitado.</li>
            <li>5. Todo intento y consumo real queda registrado en ejecuciones y estadísticas.</li>
          </ol>
        </div>
        <div className="panel p-4">
          <h2 className="text-sm font-semibold text-white">Uso responsable</h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Prioriza cuotas gratuitas. La aplicación no realiza cargos automáticos ni cambia a planes de pago.
            Si un proveedor agota su cuota, el motor prueba el siguiente proveedor o modelo habilitado.
          </p>
        </div>
      </div>
    </div>
  );
}
