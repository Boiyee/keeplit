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
  "Match the appliance to the site list when possible (case-insensitive; AC means air conditioner, freezer means fridge if listed). " +
  "Otherwise use the power in kW the user states. " +
  "If no power is known, use kind 'other'. " +
  "Minutes is the stated duration (an hour is 60); default 30. " +
  "Return kind 'status' for battery or current-power questions, " +
  "'plan' for tonight, tomorrow or generator-schedule questions, 'other' for the rest. " +
  "Language is the language the user wrote in, e.g. English, Nigerian Pidgin, Yorùbá, French.";

const UNDERSTAND_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["what_if", "status", "plan", "other"] },
    appliance: { type: ["string", "null"] },
    kw: { type: ["number", "null"] },
    minutes: { type: ["number", "null"] },
    language: { type: "string" },
  },
  required: ["kind", "appliance", "kw", "minutes", "language"],
  additionalProperties: false,
};

interface RawIntent {
  kind?: unknown;
  appliance?: unknown;
  kw?: unknown;
  minutes?: unknown;
  language?: unknown;
}

function toIntent(raw: RawIntent): Intent {
  if (
    raw.kind === "what_if" &&
    typeof raw.appliance === "string" &&
    typeof raw.kw === "number" &&
    raw.kw > 0
  ) {
    const minutes = typeof raw.minutes === "number" && raw.minutes > 0 ? raw.minutes : 30;
    return { kind: "what_if", appliance: raw.appliance, kw: raw.kw, minutes };
  }
  if (raw.kind === "status") return { kind: "status" };
  if (raw.kind === "plan") return { kind: "plan" };
  return { kind: "other" };
}

// Classifies a question. Uses askSpark only, so it works in Node and the browser.
export async function understand(question: string, ctx: SiteContext): Promise<{ intent: Intent; language: string }> {
  const appliances = ctx.appliances.map((a) => `${a.name} (${a.kw} kW)`).join(", ");
  const reply = await askSpark(
    [
      { role: "system", content: UNDERSTAND_SYSTEM },
      {
        role: "user",
        content: `Site: ${ctx.siteName}. Appliances on site: ${appliances}. Question: ${question}`,
      },
    ],
    { json: UNDERSTAND_SCHEMA, reasoningEffort: "low" },
  );
  let raw: RawIntent;
  try {
    raw = JSON.parse(reply) as RawIntent;
  } catch {
    throw new Error(`Spark did not return valid intent JSON: ${reply.slice(0, 200)}`);
  }
  const language = typeof raw.language === "string" && raw.language !== "" ? raw.language : "English";
  return { intent: toIntent(raw), language };
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
