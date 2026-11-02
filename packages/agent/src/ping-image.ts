import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import { askSpark, imagePart } from "./spark.ts";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: tsx src/ping-image.ts <image-file>");
  process.exit(1);
}

const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const mime = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
const dataUrl = `data:${mime};base64,${(await readFile(filePath)).toString("base64")}`;

const start = Date.now();
const reply = await askSpark([
  {
    role: "user",
    content: [
      { type: "text", text: "What device is this and what numbers are on its screen?" },
      imagePart(dataUrl),
    ],
  },
]);
const ms = Date.now() - start;
console.log(reply);
console.log(`took ${ms} ms`);
