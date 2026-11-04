import { askSpark } from "./spark.ts";

export interface SiteContext {
  siteName: string;
  clock: string;
  batteryPct: number;
  solarKw: number;
  loadKw: number;
  gridOn: boolean;
  genKw: number;
  appliances: { name: string; kw: number }[];
  plan: string; // short text summary of the next 24 h
}

export type Intent =
  | { kind: "what_if"; appliance: string; kw: number; minutes: number }
  | { kind: "status" }
  | { kind: "plan" }
  | { kind: "other" };

const UNDERSTAND_SYSTEM =
  "You classify a user's question about their solar power site. " +
  "Return kind 'what_if' when they ask to run, use or switch on an appliance or device. " +
  "appliance must be exactly one of the names in the site list, whatever language " +
  "the question is in, or null if the item is not in the list. Set kw only when the user states a power; otherwise null. " +
  "If no power is known, use kind 'other'. " +
  "Minutes is the stated duration (an hour is 60); default 30. " +
  "Return kind 'status' for battery or current-power questions, " +
  "'plan' for tonight, tomorrow or generator-schedule questions, 'other' for the rest. " +
  "Language is the language the user wrote in, e.g. English, Nigerian Pidgin, Yorùbá, French.";

/** Built per call from ctx, so Spark can only return an exact site-list name or null. */
function understandSchema(ctx: SiteContext): object {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["what_if", "status", "plan", "other"] },
      appliance: { type: ["string", "null"], enum: [...ctx.appliances.map((a) => a.name), null] },
      kw: { type: ["number", "null"] },
      minutes: { type: ["number", "null"] },
      language: { type: "string" },
    },
    required: ["kind", "appliance", "kw", "minutes", "language"],
    additionalProperties: false,
  };
}

export interface RawIntent {
  kind?: unknown;
  appliance?: unknown;
  kw?: unknown;
  minutes?: unknown;
  language?: unknown;
}

function toIntent(raw: RawIntent, ctx: SiteContext): Intent {
  const minutes = typeof raw.minutes === "number" && raw.minutes > 0 ? raw.minutes : 30;
  const listed =
    typeof raw.appliance === "string"
      ? ctx.appliances.find((a) => a.name === raw.appliance)
      : undefined;
  if (listed && (raw.kind === "what_if" || raw.kind === "other")) {
    return { kind: "what_if", appliance: listed.name, kw: listed.kw, minutes };
  }
  if (raw.kind === "what_if" && typeof raw.kw === "number" && raw.kw > 0) {
    const appliance = typeof raw.appliance === "string" ? raw.appliance : "your appliance";
    return { kind: "what_if", appliance, kw: raw.kw, minutes };
  }
  if (raw.kind === "status") return { kind: "status" };
  if (raw.kind === "plan") return { kind: "plan" };
  return { kind: "other" };
}

// Classifies a question. Uses askSpark only, so it works in Node and the browser.
// `raw` is what Spark returned, before toIntent maps it onto the site list.
export async function understand(
  question: string,
  ctx: SiteContext,
): Promise<{ intent: Intent; language: string; raw: RawIntent }> {
  const appliances = ctx.appliances.map((a) => `${a.name} (${a.kw} kW)`).join(", ");
  const reply = await askSpark(
    [
      { role: "system", content: UNDERSTAND_SYSTEM },
      {
        role: "user",
        content: `Site: ${ctx.siteName}. Appliances on site: ${appliances}. Question: ${question}`,
      },
    ],
    { json: understandSchema(ctx), reasoningEffort: "medium" },
  );
  let raw: RawIntent;
  try {
    raw = JSON.parse(reply) as RawIntent;
  } catch {
    throw new Error(`Spark did not return valid intent JSON: ${reply.slice(0, 200)}`);
  }
  const language = typeof raw.language === "string" && raw.language !== "" ? raw.language : "English";
  return { intent: toIntent(raw, ctx), language, raw };
}

const REPLY_SYSTEM =
  "You answer questions about the user's solar power site in plain language. " +
  "Reply in the requested language, 1-3 plain sentences, no markdown. " +
  "Use ONLY numbers that appear in the site context or facts below. Never invent numbers.";

// Answers a question from already-computed facts. Uses askSpark only, so it works in Node and the browser.
export async function reply(
  question: string,
  ctx: SiteContext,
  intent: Intent,
  facts: object,
  language: string,
): Promise<string> {
  return askSpark(
    [
      { role: "system", content: `${REPLY_SYSTEM} Requested language: ${language}.` },
      {
        role: "user",
        content:
          `Question: ${question}\n` +
          `Site context: ${JSON.stringify(ctx)}\n` +
          `Intent: ${JSON.stringify(intent)}\n` +
          `Facts: ${JSON.stringify(facts)}`,
      },
    ],
    { reasoningEffort: "low" },
  );
}
