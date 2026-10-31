import type { ConnectionOptions } from "bullmq";
import { getEnv } from "../lib/env";

export function redisConnectionOptions(role: "queue" | "worker"): ConnectionOptions {
  const url = new URL(getEnv().REDIS_URL);
  const database = url.pathname.replace(/^\//, "");

  const options: ConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    connectTimeout: 5_000,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(database ? { db: Number(database) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };

  if (role === "worker") {
    // BullMQ requires blocking connections to keep retrying.
    options.maxRetriesPerRequest = null;
  } else {
    options.maxRetriesPerRequest = 1;
    options.enableOfflineQueue = false;
  }

  return options;
}
