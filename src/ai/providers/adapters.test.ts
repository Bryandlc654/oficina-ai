import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOllama } from "./ollama";
import { callOpenRouter } from "./openrouter";
import type { ChatRequest, ProviderConfig } from "../types";

let server: Server;
let baseUrl: string;

function listen(): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");

      if (url.pathname.includes(":generateContent")) {
        if (url.searchParams.get("key") === "bad-key") {
          response.statusCode = 401;
          response.end(JSON.stringify({ error: { message: "API key not valid" } }));
          return;
        }
        if (body.includes('"responseMimeType"') === false) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: { message: "missing generation config" } }));
          return;
        }
        response.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, totalTokenCount: 17 },
          }),
        );
        return;
      }

      if (url.pathname === "/chat/completions") {
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "respuesta groq" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
          }),
        );
        return;
      }

      if (url.pathname === "/api/chat") {
        response.end(
          JSON.stringify({ message: { content: "respuesta ollama" }, prompt_eval_count: 9, eval_count: 4, done_reason: "stop" }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ message: "not found" }));
    });
  });

  await listen();
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const request: ChatRequest = {
  model: "test-model",
  system: "Eres un agente de prueba",
  messages: [{ role: "user", content: "Hola" }],
  maxOutputTokens: 100,
  responseFormat: "json",
};

function provider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "provider-1",
    name: "Test",
    type: "GEMINI",
    baseUrl,
    apiKey: "good-key",
    models: ["test-model"],
    ...overrides,
  };
}

describe("Gemini adapter", () => {
  it("parses text and real token usage", async () => {
    const result = await callGemini(provider({ type: "GEMINI" }), request);
    expect(result.text).toBe('{"ok":true}');
    expect(result.totalTokens).toBe(17);
    expect(result.providerId).toBe("provider-1");
  });

  it("maps an invalid API key to an AUTH error", async () => {
    await expect(callGemini(provider({ type: "GEMINI", apiKey: "bad-key" }), request)).rejects.toMatchObject({
      code: "AUTH",
      retryable: false,
    });
  });

  it("requires a configured key", async () => {
    await expect(callGemini(provider({ type: "GEMINI", apiKey: null }), request)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});

describe("Groq adapter", () => {
  it("parses the OpenAI-compatible response", async () => {
    const result = await callGroq(provider({ type: "GROQ" }), request);
    expect(result.text).toBe("respuesta groq");
    expect(result.inputTokens).toBe(20);
    expect(result.totalTokens).toBe(28);
  });
});

describe("Ollama adapter", () => {
  it("parses the local response without an API key", async () => {
    const result = await callOllama(provider({ type: "OLLAMA", apiKey: null, baseUrl }), request);
    expect(result.text).toBe("respuesta ollama");
    expect(result.totalTokens).toBe(13);
  });
});

describe("OpenRouter adapter", () => {
  it("parses an OpenAI-compatible response with a bearer key", async () => {
    const result = await callOpenRouter(provider({ type: "OPENROUTER" }), request);
    expect(result.text).toBe("respuesta groq");
    expect(result.totalTokens).toBe(28);
    expect(result.providerType).toBe("OPENROUTER");
  });

  it("requires a configured key", async () => {
    await expect(callOpenRouter(provider({ type: "OPENROUTER", apiKey: null }), request)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});
