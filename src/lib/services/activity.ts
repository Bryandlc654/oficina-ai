import type { ActorType, Prisma } from "@prisma/client";
import { db } from "../db";

type DbClient = Prisma.TransactionClient | typeof db;

export type ActivityInput = {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function logActivity(input: ActivityInput, client: DbClient = db): Promise<void> {
  await client.activityLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    },
  });
}
