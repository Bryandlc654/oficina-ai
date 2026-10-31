import type { AIProvider } from "@prisma/client";
import { getEnvApiKey } from "@/ai/openrouter-env";
import { encryptSecret } from "../crypto";
import { db } from "../db";
import { AppError, NotFoundError } from "../errors";
import type { ProviderUpdateInput } from "../validation";
import { logActivity } from "./activity";

export type SafeProvider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  models: string[];
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  hasKey: boolean;
  hasEnvKey: boolean;
  updatedAt: string;
};

export function toSafeProvider(provider: AIProvider): SafeProvider {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    models: Array.isArray(provider.models)
      ? provider.models.filter((model): model is string => typeof model === "string")
      : [],
    isEnabled: provider.isEnabled,
    isDefault: provider.isDefault,
    priority: provider.priority,
    hasKey: provider.apiKeyCipher !== null,
    hasEnvKey: Boolean(getEnvApiKey(provider.type)),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

export async function listProviders(): Promise<SafeProvider[]> {
  const providers = await db.aIProvider.findMany({ orderBy: { priority: "asc" } });
  return providers.map(toSafeProvider);
}

export async function updateProvider(
  id: string,
  input: ProviderUpdateInput,
  actorId: string,
): Promise<SafeProvider> {
  const provider = await db.aIProvider.findUnique({ where: { id } });
  if (!provider) throw new NotFoundError("Proveedor de IA");

  const normalizedKey = input.apiKey?.trim() ?? null;
  const nextCipher =
    input.apiKey === undefined
      ? provider.apiKeyCipher
      : normalizedKey && normalizedKey.length > 0
        ? encryptSecret(normalizedKey)
        : null;

  const hasKey = nextCipher !== null;
  const hasEnvKey = Boolean(getEnvApiKey(provider.type));
  const configured = hasKey || hasEnvKey;
  const nextEnabled = input.isEnabled ?? provider.isEnabled;
  const nextDefault = input.isDefault ?? provider.isDefault;

  if (nextEnabled && provider.type !== "OLLAMA" && !configured) {
    throw new AppError(`Configura la clave de API de ${provider.name} antes de habilitarlo`, 422, "PROVIDER_NOT_CONFIGURED");
  }

  if (nextDefault && !nextEnabled) {
    throw new AppError("El proveedor predeterminado debe estar habilitado", 422, "PROVIDER_NOT_ENABLED");
  }

  if (nextDefault && provider.type !== "OLLAMA" && !configured) {
    throw new AppError("El proveedor predeterminado necesita una clave de API", 422, "PROVIDER_NOT_CONFIGURED");
  }

  const updated = await db.$transaction(async (tx) => {
    if (nextDefault) {
      await tx.aIProvider.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }

    const row = await tx.aIProvider.update({
      where: { id },
      data: {
        ...(input.apiKey !== undefined ? { apiKeyCipher: nextCipher } : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
      },
    });

    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: "ai_provider.updated",
        entityType: "AIProvider",
        entityId: id,
        metadata: {
          fields: Object.keys(input),
          apiKeyChanged: input.apiKey !== undefined,
          enabled: row.isEnabled,
          isDefault: row.isDefault,
        },
      },
      tx,
    );

    return row;
  });

  return toSafeProvider(updated);
}
