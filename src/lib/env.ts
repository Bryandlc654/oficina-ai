import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(24, "AUTH_SECRET must be at least 24 characters"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  SUBTASK_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(2),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }

  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
