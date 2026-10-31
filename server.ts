import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import Redis from "ioredis";
import { getEnv } from "./src/lib/env";
import { SESSION_COOKIE, verifySessionToken } from "./src/lib/auth/jwt";
import { OFFICE_EVENTS_CHANNEL, closeRealtimePublisher } from "./src/realtime/publish";

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function main(): Promise<void> {
  const env = getEnv();

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((request, response) => {
    void handle(request, response);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    cors: { origin: false },
  });

  io.use(async (socket, nextFn) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = token ? await verifySessionToken(token, env.AUTH_SECRET) : null;
      if (!session) {
        nextFn(new Error("unauthorized"));
        return;
      }
      socket.data.user = { id: session.id, email: session.email, name: session.name };
      nextFn();
    } catch {
      nextFn(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    void socket.join("office");
    socket.emit("office:ready", { at: new Date().toISOString() });
  });

  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on("error", (error) => console.error("[realtime] subscriber error:", error.message));
  subscriber.on("ready", () => {
    subscriber.subscribe(OFFICE_EVENTS_CHANNEL).catch((error: Error) => {
      console.error("[realtime] subscribe failed:", error.message);
    });
  });
  subscriber.on("message", (channel, message) => {
    if (channel !== OFFICE_EVENTS_CHANNEL) return;
    try {
      const event = JSON.parse(message) as { type?: string };
      io.to("office").emit("office:event", event);
      if (typeof event.type === "string") {
        io.to("office").emit(event.type, event);
      }
    } catch {
      // Ignore malformed cross-process payloads.
    }
  });

  httpServer.listen(port, hostname, () => {
    console.log(`[web] AI Virtual Office listening on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[web] ${signal} received, shutting down`);

    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();

    io.close();
    await subscriber.quit().catch(() => undefined);
    await closeRealtimePublisher().catch(() => undefined);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await app.close().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[web] fatal:", error);
  process.exit(1);
});
