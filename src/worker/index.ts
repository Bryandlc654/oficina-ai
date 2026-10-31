import "dotenv/config";
import { db } from "../lib/db";
import { closeRealtimePublisher } from "../realtime/publish";
import { startTaskWorker } from "./runner";

async function main(): Promise<void> {
  await db.$queryRaw`SELECT 1`;
  const stop = await startTaskWorker();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received, shutting down`);

    const force = setTimeout(() => process.exit(1), 30_000);
    force.unref();

    await stop();
    await closeRealtimePublisher().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error("[worker] fatal", error instanceof Error ? error.message : String(error));
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
