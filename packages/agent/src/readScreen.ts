import { askSpark, imagePart, type SparkPart } from "./spark.ts";
import { validate, type PowerLimits, type Reading } from "./validate.ts";

export interface ScreenResult {
  reading: Reading;
  problems: string[];
  attempts: 1 | 2;
  ms: number;
}

const SYSTEM_PROMPT =
  "You read solar inverter and charge controller screens. " +
  "Report only what is visible on the screen. " +
  "Use null for any value that is not shown or is unreadable. " +
  "Convert kW to W. Never guess. " +
  "If the unit only has LED indicators and no digits, still report what the lights show: " +
  "MAINS/GRID/AC light on means acInputOn true, off means false; " +
  "BATTERY LOW light on means notes 'battery low' and confidence 'low'. " +
  "Still never invent digits.";

const QUESTION = "Read the screen in this photo and report each value shown.";

const READING_SCHEMA = {
  type: "object",
  properties: {
    batteryPct: { type: ["number", "null"] },
    batteryV: { type: ["number", "null"] },
    loadW: { type: ["number", "null"] },
    pvW: { type: ["number", "null"] },
    acInputOn: { type: ["boolean", "null"] },
    brand: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: "string" },
  },
  required: ["batteryPct", "batteryV", "loadW", "pvW", "acInputOn", "brand", "confidence", "notes"],
  additionalProperties: false,
};

async function askForReading(dataUrl: string, extraText?: string): Promise<Reading> {
  const content: SparkPart[] = [{ type: "text", text: QUESTION }, imagePart(dataUrl)];
  if (extraText !== undefined) {
    content.push({ type: "text", text: extraText });
  }
  const reply = await askSpark(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    { json: READING_SCHEMA, reasoningEffort: "low" },
  );
  try {
    return JSON.parse(reply) as Reading;
  } catch {
    throw new Error(`Spark did not return valid Reading JSON: ${reply.slice(0, 200)}`);
  }
}

// Reads an inverter screen photo. Uses askSpark only, so it works in Node and the browser.
export async function readScreen(dataUrl: string, limits?: PowerLimits): Promise<ScreenResult> {
  const start = Date.now();
  const first = await askForReading(dataUrl);
  const problems = validate(first, limits);
  if (problems.length === 0) {
    return { reading: first, problems, attempts: 1, ms: Date.now() - start };
  }
  const second = await askForReading(
    dataUrl,
    `Your reading failed these checks: ${problems.join("; ")}. ` +
      "Look at the screen again. If the screen really shows that value, keep it; otherwise correct it.",
  );
  return { reading: second, problems: validate(second, limits), attempts: 2, ms: Date.now() - start };
}
