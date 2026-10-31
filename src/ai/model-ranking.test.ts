import { describe, expect, it } from "vitest";
import { modelQuality, rankModels } from "./model-ranking";

const configured = [
  { providerType: "OPENROUTER", model: "cohere/north-mini-code:free" },
  { providerType: "OPENROUTER", model: "google/gemma-4-26b-a4b-it:free" },
  { providerType: "GEMINI", model: "gemini-2.5-flash" },
  { providerType: "GEMINI", model: "gemini-2.5-pro" },
  { providerType: "GROQ", model: "openai/gpt-oss-120b" },
];

describe("rankModels", () => {
  it("puts the strongest models first for work", () => {
    expect(rankModels(configured, "work").map((entry) => entry.model).slice(0, 3)).toEqual([
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "openai/gpt-oss-120b",
    ]);
  });

  it("prefers fast models over pro ones for chat", () => {
    const top = rankModels(configured, "chat")[0];
    expect(top?.model).not.toBe("gemini-2.5-pro");
  });

  it("keeps small code models at the bottom", () => {
    expect(rankModels(configured, "work").at(-1)?.model).toBe("cohere/north-mini-code:free");
  });
});

describe("modelQuality", () => {
  it("scores unknown models from their name", () => {
    expect(modelQuality("acme/mega-70b-instruct")).toBeGreaterThan(modelQuality("acme/tiny-3b"));
    expect(modelQuality("acme/foo-32b-coder")).toBeLessThan(modelQuality("acme/foo-32b"));
  });
});
