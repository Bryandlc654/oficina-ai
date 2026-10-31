import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/session";
import { getOfficeSettings } from "@/lib/services/organization";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const settings = await getOfficeSettings();

  return (
    <AppShell adminName={session.name} paused={settings.officePaused}>
      {children}
    </AppShell>
  );
}
