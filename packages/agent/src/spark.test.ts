import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { askSpark, imagePart } from "./spark.ts";

type CapturedRequest = { url: string; init: RequestInit };

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(status: number, body: string): CapturedRequest[] {
  const calls: CapturedRequest[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
}

function okBody(content: unknown): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

function sentJson(calls: CapturedRequest[]): Record<string, unknown> {
  return JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
}

function headersOf(calls: CapturedRequest[]): Record<string, string> {
  return { ...(calls[0].init.headers as Record<string, string>) };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
  delete (globalThis as { window?: unknown }).window;
});

test("throws when no key is configured", async () => {
  delete process.env.META_API_KEY;
  await assert.rejects(askSpark([{ role: "user", content: "hi" }]), /META_API_KEY is not set/);
});

test("node defaults: env base, default model, bearer auth", async () => {
  process.env.META_API_KEY = "test-key";
  delete process.env.META_API_BASE;
  const calls = mockFetch(200, okBody("hello"));
  const reply = await askSpark([{ role: "user", content: "hi" }]);
  assert.equal(reply, "hello");
  assert.equal(calls[0].url, "https://api.meta.ai/v1/chat/completions");
  assert.equal(sentJson(calls).model, "muse-spark-1.3");
  assert.ok(!("response_format" in sentJson(calls)));
  assert.equal(headersOf(calls).Authorization, "Bearer test-key");
});

test("opts.base and opts.key override the environment", async () => {
  delete process.env.META_API_KEY;
  process.env.META_API_BASE = "https://env.example/v9";
  const calls = mockFetch(200, okBody("ok"));
  await askSpark([{ role: "user", content: "hi" }], { base: "https://opt.example/v2", key: "opt-key" });
  assert.equal(calls[0].url, "https://opt.example/v2/chat/completions");
  assert.equal(headersOf(calls).Authorization, "Bearer opt-key");
});

test("opts.json sends a strict json_schema response_format", async () => {
  process.env.META_API_KEY = "test-key";
  const schema = { type: "object", properties: { ok: { type: "boolean" } } };
  const calls = mockFetch(200, okBody('{"ok":true}'));
  await askSpark([{ role: "user", content: "hi" }], { json: schema });
  assert.deepEqual(sentJson(calls).response_format, {
    type: "json_schema",
    json_schema: { name: "answer", schema, strict: true },
  });
});

test("opts.reasoningEffort sends reasoning_effort only when set", async () => {
  process.env.META_API_KEY = "test-key";
  const schema = { type: "object" };
  const withEffort = mockFetch(200, okBody("{}"));
  await askSpark([{ role: "user", content: "hi" }], { json: schema, reasoningEffort: "low" });
  assert.equal(sentJson(withEffort).reasoning_effort, "low");
  const withoutEffort = mockFetch(200, okBody("{}"));
  await askSpark([{ role: "user", content: "hi" }], { json: schema });
  assert.ok(!("reasoning_effort" in sentJson(withoutEffort)));
});

test("array content with imagePart is sent through untouched", async () => {
  process.env.META_API_KEY = "test-key";
  const parts = [
    { type: "text", text: "What is this?" },
    imagePart("data:image/png;base64,AAA"),
  ] as const;
  const calls = mockFetch(200, okBody("a meter"));
  await askSpark([{ role: "user", content: [...parts] }]);
  const messages = sentJson(calls).messages as Array<{ role: string; content: unknown }>;
  assert.deepEqual(messages[0].content, [...parts]);
});

test("imagePart builds an OpenAI-style image_url part", () => {
  assert.deepEqual(imagePart("data:image/jpeg;base64,AAA"), {
    type: "image_url",
    image_url: { url: "data:image/jpeg;base64,AAA" },
  });
});

test("browser: same-origin base and no authorization header", async () => {
  (globalThis as { window?: unknown }).window = {};
  process.env.META_API_KEY = "browser-must-not-send-this";
  process.env.META_API_BASE = "https://env.example/v9";
  const calls = mockFetch(200, okBody("hello"));
  await askSpark([{ role: "user", content: "hi" }]);
  assert.equal(calls[0].url, "/spark/chat/completions");
  assert.ok(!("Authorization" in headersOf(calls)));
});

test("browser: opts.base is honored but still without auth", async () => {
  (globalThis as { window?: unknown }).window = {};
  process.env.META_API_KEY = "browser-must-not-send-this";
  const calls = mockFetch(200, okBody("hello"));
  await askSpark([{ role: "user", content: "hi" }], { base: "https://direct.example/v2" });
  assert.equal(calls[0].url, "https://direct.example/v2/chat/completions");
  assert.ok(!("Authorization" in headersOf(calls)));
});

test("http errors name the status and body but never the key", async () => {
  process.env.META_API_KEY = "super-secret-key-123";
  mockFetch(429, "bad quota");
  let message = "";
  try {
    await askSpark([{ role: "user", content: "hi" }]);
  } catch (err) {
    message = (err as Error).message;
  }
  assert.match(message, /status 429/);
  assert.match(message, /bad quota/);
  assert.ok(!message.includes("super-secret-key-123"));
});

test("a response without content throws", async () => {
  process.env.META_API_KEY = "test-key";
  mockFetch(200, JSON.stringify({ choices: [] }));
  await assert.rejects(askSpark([{ role: "user", content: "hi" }]), /missing content/);
});

test("a thrown fetch is retried once after 800 ms", async () => {
  process.env.META_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new Error("fetch failed");
    return new Response(okBody("back"), { status: 200 });
  }) as typeof fetch;
  const reply = await askSpark([{ role: "user", content: "hi" }]);
  assert.equal(reply, "back");
  assert.equal(calls, 2);
});
