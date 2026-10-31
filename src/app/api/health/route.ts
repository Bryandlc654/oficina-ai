import { db } from "@/lib/db";
import { jsonOk, route } from "@/lib/api";
import { queueHealth } from "@/queue/queue";

type Heartbeat = { status?: string; at?: string; pid?: number; concurrency?: number };

export async function GET(): Promise<Response> {
  return route(async () => {
    let database = "down";
    try {
      await db.$queryRaw`SELECT 1`;
      database = "up";
    } catch {
      database = "down";
    }

    const [queue, heartbeatRow] = await Promise.all([
      queueHealth(),
      db.setting.findUnique({ where: { key: "worker.heartbeat" } }).catch(() => null),
    ]);

    const heartbeat = (heartbeatRow?.value ?? null) as Heartbeat | null;
    const heartbeatAt = heartbeat?.at ? new Date(heartbeat.at).getTime() : 0;
    const workerFresh = Date.now() - heartbeatAt < 60_000;
    const worker = heartbeat?.status === "running" && workerFresh ? "up" : "down";

    const ok = database === "up" && queue.ok;
    const degraded = ok && worker === "down";

    return jsonOk({
      status: ok ? (degraded ? "degraded" : "ok") : "error",
      services: {
        database,
        redis: queue.ok ? "up" : "down",
        worker,
      },
      queue: queue.counts ?? null,
      timestamp: new Date().toISOString(),
    });
  });
}
