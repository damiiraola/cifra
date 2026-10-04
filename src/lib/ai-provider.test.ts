import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_BUSY,
  AI_OUT_OF_CREDIT,
  AI_TIMEOUT,
  AI_UNAVAILABLE,
  DEFAULT_AI_MODEL,
  DEFAULT_GROQ_MODEL,
  GATEWAY_URL,
  GROQ_URL,
  aiProviders,
  classifyFailure,
  failureMessage,
  parseSchema,
  requestBody,
  responseText,
} from "./ai-provider.ts";

test("no keys and no OIDC token → assistant off", () => {
  assert.deepEqual(aiProviders({}), []);
  assert.deepEqual(aiProviders({ AI_GATEWAY_API_KEY: "  " }, ""), []);
});

test("API key wins over OIDC; default model is Grok fast on the Gateway", () => {
  const [p] = aiProviders({ AI_GATEWAY_API_KEY: "k" }, "oidc");
  assert.equal(p.id, "gateway");
  assert.equal(p.url, GATEWAY_URL);
  assert.equal(p.token, "k");
  assert.equal(p.auth, "api-key");
  assert.equal(p.model, DEFAULT_AI_MODEL);
  assert.equal(DEFAULT_AI_MODEL, "spacexai/grok-4.1-fast-non-reasoning");
});

test("OIDC from the request header, then VERCEL_OIDC_TOKEN", () => {
  assert.equal(aiProviders({}, "hdr")[0].token, "hdr");
  assert.equal(aiProviders({}, "hdr")[0].auth, "oidc");
  assert.equal(aiProviders({ VERCEL_OIDC_TOKEN: "env" }, null)[0].token, "env");
  assert.equal(aiProviders({ VERCEL_OIDC_TOKEN: "env" }, "hdr")[0].token, "hdr");
});

test("AI_MODEL overrides the model", () => {
  assert.equal(aiProviders({ AI_MODEL: " openai/gpt-oss-120b " }, "t")[0].model, "openai/gpt-oss-120b");
});

test("Groq is only a fallback, after the Gateway, and only with GROQ_API_KEY", () => {
  const ps = aiProviders({ GROQ_API_KEY: "g" }, "t");
  assert.deepEqual(
    ps.map((p) => p.id),
    ["gateway", "groq"],
  );
  assert.equal(ps[1].url, GROQ_URL);
  assert.equal(ps[1].model, DEFAULT_GROQ_MODEL);
  // Groq alone works too (e.g. no Vercel OIDC in local dev).
  assert.deepEqual(
    aiProviders({ GROQ_API_KEY: "g", GROQ_MODEL: "qwen/qwen3.8-27b" }).map((p) => [p.id, p.model]),
    [["groq", "qwen/qwen3.8-27b"]],
  );
});

const msgs = [{ role: "user" as const, content: "hola" }];

test("every Gateway request disallows prompt training", () => {
  const gw = aiProviders({}, "t")[0];
  for (const mode of ["chat", "parse", "report"] as const) {
    const b = requestBody(gw, { mode, messages: msgs }) as { providerOptions?: unknown };
    assert.deepEqual(b.providerOptions, { gateway: { disallowPromptTraining: true } });
  }
  const groq = aiProviders({ GROQ_API_KEY: "g" })[0];
  assert.equal((requestBody(groq, { mode: "chat", messages: msgs }) as Record<string, unknown>).providerOptions, undefined);
});

test("parse asks for a strict JSON schema with the user's categories", () => {
  const gw = aiProviders({}, "t")[0];
  const b = requestBody(gw, { mode: "parse", messages: msgs, categoryIds: ["alimentos", "sueldo", "alimentos"] }) as {
    response_format: { type: string; json_schema: { strict: boolean; schema: ReturnType<typeof parseSchema> } };
    max_tokens: number;
    temperature: number;
  };
  assert.equal(b.response_format.type, "json_schema");
  assert.equal(b.response_format.json_schema.strict, true);
  const s = b.response_format.json_schema.schema;
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required.slice().sort(), Object.keys(s.properties).sort());
  assert.deepEqual(s.properties.categoryId, { type: "string", enum: ["alimentos", "sueldo"] });
  assert.deepEqual(s.properties.date.type, ["string", "null"]);
  assert.equal(b.temperature, 0.1);
  // Chat/report: free text, no schema.
  assert.equal((requestBody(gw, { mode: "chat", messages: msgs }) as Record<string, unknown>).response_format, undefined);
});

test("parse without categories still has a schema (free categoryId)", () => {
  assert.deepEqual(parseSchema([]).properties.categoryId, { type: "string" });
});

test("gpt-oss on Groq thinks briefly and gets room to answer", () => {
  const groq = aiProviders({ GROQ_API_KEY: "g" })[0];
  const b = requestBody(groq, { mode: "parse", messages: msgs }) as Record<string, unknown>;
  assert.equal(b.reasoning_effort, "low");
  assert.ok((b.max_tokens as number) >= 1000);
});

test("failures: 402 and quota-ish 429 = out of credit, other 429 = busy", () => {
  assert.equal(classifyFailure(402), "credit");
  assert.equal(classifyFailure(429, '{"error":{"message":"Insufficient credits"}}'), "credit");
  assert.equal(classifyFailure(429, "rate limit exceeded"), "busy");
  assert.equal(classifyFailure(401), "auth");
  assert.equal(classifyFailure(403), "auth");
  assert.equal(classifyFailure(504), "timeout");
  assert.equal(classifyFailure(500), "other");
});

test("user messages are plain Spanish (voseo)", () => {
  assert.equal(failureMessage("credit"), AI_OUT_OF_CREDIT);
  assert.match(AI_OUT_OF_CREDIT, /límite gratis de este mes/);
  assert.equal(failureMessage("busy"), AI_BUSY);
  assert.match(AI_BUSY, /Esperá un minuto/);
  assert.equal(failureMessage("auth"), AI_UNAVAILABLE);
  assert.equal(failureMessage("timeout"), AI_TIMEOUT);
  assert.equal(failureMessage(null), AI_TIMEOUT);
});

test("responseText reads the first choice safely", () => {
  assert.equal(responseText({ choices: [{ message: { content: "ok" } }] }), "ok");
  assert.equal(responseText({ choices: [] }), "");
  assert.equal(responseText(null), "");
  assert.equal(responseText({ choices: [{ message: { content: 3 } }] }), "");
});

test("privacy page names who gets the questions", async () => {
  const { processorsFor, modelOwner } = await import("./ai-provider.ts");
  assert.equal(modelOwner("spacexai/grok-4.1-fast-non-reasoning"), "xAI (Grok)");
  assert.equal(modelOwner("openai/gpt-oss-120b"), "OpenAI");
  assert.equal(modelOwner("weird/x"), "weird");
  assert.deepEqual(processorsFor(aiProviders({}, "t")), { gateway: "xAI (Grok)", groq: false });
  assert.deepEqual(processorsFor(aiProviders({ GROQ_API_KEY: "g" })), { gateway: null, groq: true });
  assert.deepEqual(processorsFor([]), { gateway: null, groq: false });
});

test("parse prompt carries today's Buenos Aires date (for 'ayer')", async () => {
  const { systemFor } = await import("./ai-prompts.ts");
  const { aiUsageDay } = await import("./ai-limit.ts");
  assert.match(systemFor("parse"), new RegExp(`Hoy es ${aiUsageDay()}`));
  assert.doesNotMatch(systemFor("chat"), /Hoy es/);
  assert.match(systemFor("chat", [{ id: "x1", name: "Kiosco", kind: "expense" }]), /x1 \(Kiosco, gasto\)/);
});
