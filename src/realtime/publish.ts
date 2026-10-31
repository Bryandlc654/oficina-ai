import Redis from "ioredis";
import { getEnv } from "../lib/env";

export const OFFICE_EVENTS_CHANNEL = "office:events";

export type OfficeEventType =
  | "task.created"
  | "task.updated"
  | "task.scheduled"
  | "task.schedule.failed"
  | "task.plan.created"
  | "task.reviewed"
  | "task.status"
  | "subtask.status"
  | "agent.status"
  | "deliverable.created"
  | "office.paused"
  | "chat.message"
  | "chat.typing";

export type OfficeEventInput = {
  type: OfficeEventType;
  taskId?: string;
  subtaskId?: string;
  agentId?: string;
  agentName?: string;
  status?: string;
  message?: string;
  channel?: string;
};

export type OfficeEvent = OfficeEventInput & { at: string };

function createPublisher() {
  const client = new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: true,
    connectTimeout: 2_000,
  });
  client.on("error", (error) => {
    if (!warned) {
      warned = true;
      console.error("[realtime] publisher connection error:", error.message);
    }
  });
  return client;
}

let publisher: ReturnType<typeof createPublisher> | null = null;
let warned = false;

function getPublisher(): ReturnType<typeof createPublisher> {
  if (!publisher) {
    publisher = createPublisher();
  }
  return publisher;
}

/**
 * Fire-and-forget bridge from the engine/worker to the Socket.IO gateway.
 * A Redis outage must never break task execution.
 */
export async function publishOfficeEvent(event: OfficeEventInput): Promise<void> {
  try {
    const payload: OfficeEvent = { ...event, at: new Date().toISOString() };
    await getPublisher().publish(OFFICE_EVENTS_CHANNEL, JSON.stringify(payload));
    warned = false;
  } catch (error) {
    if (!warned) {
      warned = true;
      console.error(`[realtime] no se pudo publicar ${event.type}:`, (error as Error).message);
    }
  }
}

export async function closeRealtimePublisher(): Promise<void> {
  if (!publisher) return;
  const current = publisher;
  publisher = null;
  await current.quit().catch(() => undefined);
}
