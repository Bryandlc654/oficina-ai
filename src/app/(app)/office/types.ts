import type { AgentStatusValue } from "@/lib/constants";

export type OfficeAgent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatusValue;
  department: { id: string; name: string; color: string; order: number };
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  currentSubtaskTitle: string | null;
};

export type OfficeDepartment = {
  id: string;
  name: string;
  color: string;
  order: number;
};
