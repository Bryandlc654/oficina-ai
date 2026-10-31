import { describe, expect, it } from "vitest";
import { cleanReply, extractTaskProposal, taskCreatedMarker } from "./chat-format";

describe("cleanReply", () => {
  it("keeps normal replies", () => {
    expect(cleanReply("  Claro, lo reviso hoy.  ")).toEqual({ text: "Claro, lo reviso hoy.", degenerate: false });
  });

  it("cuts repetition loops and foreign scripts", () => {
    const result = cleanReply(`Empresas de mediano a grande規模${"规模".repeat(20)}`);
    expect(result).toEqual({ text: "Empresas de mediano a grande", degenerate: true });
  });

  it("cuts a looping latin phrase", () => {
    expect(cleanReply(`Hola. ${"sí, ".repeat(10)}`).degenerate).toBe(true);
  });
});

describe("extractTaskProposal", () => {
  it("pulls out the proposal and strips it from the body", () => {
    const { body, proposal } = extractTaskProposal(
      "Te propongo esto.\n[[TAREA: Auditoría de redes | Revisar Instagram y TikTok de la agencia y proponer un plan de 30 días]]",
    );
    expect(body).toBe("Te propongo esto.");
    expect(proposal).toEqual({
      title: "Auditoría de redes",
      objective: "Revisar Instagram y TikTok de la agencia y proponer un plan de 30 días",
    });
  });

  it("ignores messages without a proposal", () => {
    expect(extractTaskProposal("Hola").proposal).toBeNull();
  });

  it("reads back a task the server already created", () => {
    const marker = taskCreatedMarker({ id: "task_1", title: "PDF | cotización [web]" });
    const { body, proposal, created } = extractTaskProposal(`Listo, ya lo agendé.
${marker}`);
    expect(body).toBe("Listo, ya lo agendé.");
    expect(proposal).toBeNull();
    expect(created).toEqual({ id: "task_1", title: "PDF   cotización  web" });
  });
});
