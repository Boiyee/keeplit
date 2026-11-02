import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readScreen } from "./readScreen.ts";
import type { Reading } from "./validate.ts";

const PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

interface Expected {
  batteryPct?: number;
  loadW?: number;
  pvW?: number;
}

interface PhotoResult {
  file: string;
  reading: Reading;
  problems: string[];
  attempts: 1 | 2;
  ms: number;
  expected: Expected | null;
  correct: { batteryPct: boolean | null; loadW: boolean | null; pvW: boolean | null };
}

function cellNumber(cell: string | undefined): number | undefined {
  if (cell === undefined) return undefined;
  const text = cell.trim();
  if (text === "") return undefined;
  const value = Number(text);
  return Number.isNaN(value) ? undefined : value;
}

function parseAnswersCsv(csv: string): Map<string, Expected> {
  const answers = new Map<string, Expected>();
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return answers;
  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const fileIdx = header.indexOf("file");
  if (fileIdx === -1) return answers;
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const file = cells[fileIdx]?.trim();
    if (!file) continue;
    answers.set(file, {
      batteryPct: cellNumber(cells[header.indexOf("batterypct")]),
      loadW: cellNumber(cells[header.indexOf("loadw")]),
      pvW: cellNumber(cells[header.indexOf("pvw")]),
    });
  }
  return answers;
}

// null = not compared (no expected value); false includes "actual unreadable".
function fieldCorrect(actual: number | null, expected: number | undefined, tolerance: number): boolean | null {
  if (expected === undefined) return null;
  if (actual === null) return false;
  return Math.abs(actual - expected) <= tolerance;
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return String(value);
}

const folderArg = process.argv[2];
if (!folderArg) {
  console.error("Usage: npx tsx packages/agent/src/eval-screens.ts <photo-folder>");
  process.exit(1);
}
const folder = resolve(folderArg);

// Results go to the photo folder, so refuse a folder inside this repo.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
if (folder === repoRoot || folder.startsWith(repoRoot + sep)) {
  console.error(`Refusing to write results inside the repo: ${folder}`);
  process.exit(1);
}

let entries: string[];
try {
  entries = await readdir(folder);
} catch {
  console.error(`Folder not found: ${folder}`);
  process.exit(1);
}
const photos = entries.filter((entry) => PHOTO_EXTS.has(extname(entry).toLowerCase())).sort();
if (photos.length === 0) {
  console.error(`No photos found in ${folder}`);
  process.exit(1);
}

let answers: Map<string, Expected> | null = null;
try {
  answers = parseAnswersCsv(await readFile(join(folder, "answers.csv"), "utf-8"));
} catch {
  answers = null;
}

const results: PhotoResult[] = [];
for (const file of photos) {
  const ext = extname(file).toLowerCase();
  const dataUrl = `data:${mimeTypes[ext] ?? "application/octet-stream"};base64,${(await readFile(join(folder, file))).toString("base64")}`;
  const { reading, problems, attempts, ms } = await readScreen(dataUrl);
  const expected = answers?.get(file) ?? answers?.get(basename(file)) ?? null;
  const correct = {
    batteryPct: fieldCorrect(reading.batteryPct, expected?.batteryPct, 2),
    loadW: fieldCorrect(reading.loadW, expected?.loadW, Math.max(Math.abs(expected?.loadW ?? 0) * 0.05, 20)),
    pvW: fieldCorrect(reading.pvW, expected?.pvW, Math.max(Math.abs(expected?.pvW ?? 0) * 0.05, 20)),
  };
  results.push({ file, reading, problems, attempts, ms, expected, correct });
  console.log(
    [
      file,
      show(reading.batteryPct),
      show(reading.loadW),
      show(reading.pvW),
      show(reading.acInputOn),
      reading.confidence,
      attempts,
      problems.length === 0 ? "-" : problems.join(" | "),
      ms,
    ].join("\t"),
  );
}

let accuracy: Record<string, { correct: number; compared: number }> | null = null;
if (answers !== null) {
  accuracy = {
    batteryPct: { correct: 0, compared: 0 },
    loadW: { correct: 0, compared: 0 },
    pvW: { correct: 0, compared: 0 },
  };
  for (const result of results) {
    for (const field of ["batteryPct", "loadW", "pvW"] as const) {
      const value = result.correct[field];
      if (value === null) continue;
      accuracy[field].compared += 1;
      if (value) accuracy[field].correct += 1;
    }
  }
  const totalCorrect = results.flatMap((r) => [r.correct.batteryPct, r.correct.loadW, r.correct.pvW]);
  const compared = totalCorrect.filter((v) => v !== null);
  const correct = compared.filter((v) => v === true).length;
  const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}%`);
  for (const field of ["batteryPct", "loadW", "pvW"] as const) {
    const { correct: c, compared: d } = accuracy[field];
    console.log(`accuracy ${field}: ${c}/${d} (${pct(c, d)})`);
  }
  console.log(`accuracy overall: ${correct}/${compared.length} (${pct(correct, compared.length)})`);
} else {
  console.log("no answers.csv: skipping accuracy");
}
const secondAttempts = results.filter((r) => r.attempts === 2).length;
console.log(`second attempts: ${secondAttempts}/${results.length} photos`);

const resultsPath = join(folder, "results.json");
await writeFile(resultsPath, JSON.stringify({ folder, photos: results, accuracy }, null, 2));
console.log(`wrote ${resultsPath}`);
