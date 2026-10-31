import { jsonOk, readJson, route } from "@/lib/api";
import { requireApiSession } from "@/lib/auth/session";
import { getOfficeSettings, setOfficePaused } from "@/lib/services/organization";
import { pauseTaskQueue, resumeTaskQueue } from "@/queue/queue";
import { publishOfficeEvent } from "@/realtime/publish";
import { settingsUpdateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  return route(async () => {
    await requireApiSession();
    return jsonOk({ settings: await getOfficeSettings() });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const session = await requireApiSession();
    const input = settingsUpdateSchema.parse(await readJson(request));

    if (input.officePaused !== undefined) {
      await setOfficePaused(input.officePaused, session.id);

      try {
        if (input.officePaused) {
          await pauseTaskQueue();
        } else {
          await resumeTaskQueue();
        }
      } catch (error) {
        console.error("[settings] no se pudo cambiar el estado de la cola", error);
      }

      void publishOfficeEvent({
        type: "office.paused",
        status: input.officePaused ? "paused" : "active",
        message: input.officePaused ? "Ejecuciones de la oficina pausadas" : "Oficina reanudada",
      });
    }

    return jsonOk({ settings: await getOfficeSettings() });
  });
}
