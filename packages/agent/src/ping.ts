import { askSpark } from "./spark.ts";

const start = Date.now();
const reply = await askSpark([{ role: "user", content: "Say OK in one word." }]);
const ms = Date.now() - start;
console.log(reply);
console.log(`took ${ms} ms`);
