import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { reply, understand, type SiteContext } from "./agent.ts";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const ctx: SiteContext = {
  siteName: "Lagos clinic",
  clock: "Tue 19:00",
  batteryPct: 64,
  solarKw: 0,
  loadKw: 0.6,
  gridOn: false,
  genKw: 0,
  appliances: [
    { name: "Water pump", kw: 0.75 },
    { name: "Air conditioner", kw: 1.2 },
  ],
  plan: "generator stays off; lowest battery 41% at 05:00.",
};

function mockReplies(bodies: string[]): Array<Record<string, unknown>> {
  const calls: Array<Record<string, unknown>> = [];
  let n = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const content = bodies[Math.min(n, bodies.length - 1)];
    n += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

test("understand matches an appliance and defaults minutes to 30", async () => {
  process.env.META_API_KEY = "test-key";
  const calls = mockReplies([
    JSON.stringify({ kind: "what_if", appliance: "Water pump", kw: 0.75, minutes: null, language: "English" }),
  ]);
  const { intent, language } = await understand("Can I run the water pump?", ctx);
  assert.deepEqual(intent, { kind: "what_if", appliance: "Water pump", kw: 0.75, minutes: 30 });
  assert.equal(language, "English");
  const schema = (calls[0].response_format as { json_schema: { schema: Record<string, unknown> } }).json_schema.schema;
  assert.deepEqual(schema.required, ["kind", "appliance", "kw", "minutes", "language"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(calls[0].reasoning_effort, "low");
});

test("understand falls back to other when no power is known", async () => {
  process.env.META_API_KEY = "test-key";
  mockReplies([JSON.stringify({ kind: "what_if", appliance: "Iron", kw: null, minutes: null, language: "English" })]);
  const { intent } = await understand("Can I iron clothes?", ctx);
  assert.deepEqual(intent, { kind: "other" });
});

test("understand detects the user's language", async () => {
  process.env.META_API_KEY = "test-key";
  mockReplies([
    JSON.stringify({ kind: "status", appliance: null, kw: null, minutes: null, language: "Nigerian Pidgin" }),
  ]);
  const { intent, language } = await understand("Abeg, how far battery?", ctx);
  assert.deepEqual(intent, { kind: "status" });
  assert.equal(language, "Nigerian Pidgin");
});

test("reply returns the model's text and sends context, intent and facts", async () => {
  process.env.META_API_KEY = "test-key";
  const calls = mockReplies(["Yes, run it now. Battery is 64%."]);
  const intent = { kind: "status" } as const;
  const facts = { batteryPct: 64 };
  const text = await reply("How much battery?", ctx, intent, facts, "English");
  assert.equal(text, "Yes, run it now. Battery is 64%.");
  const sent = calls[0];
  assert.equal(sent.reasoning_effort, "low");
  const userText = (sent.messages as Array<{ content: string }>)[1].content;
  assert.ok(userText.includes("64"));
  assert.ok((sent.messages as Array<{ content: string }>)[0].content.includes("English"));
});
