import { understand, type SiteContext } from "./agent.ts";

const ctx: SiteContext = {
  siteName: "Lagos clinic",
  clock: "Tue 19:00",
  batteryPct: 64,
  solarKw: 0,
  loadKw: 0.6,
  gridOn: false,
  genKw: 0,
  appliances: [
    { name: "Sterilizer", kw: 1.8 },
    { name: "Water pump", kw: 0.75 },
    { name: "Air conditioner", kw: 1.2 },
    { name: "Lab centrifuge", kw: 0.4 },
  ],
  plan: "generator stays off; lowest battery 41% at 05:00.",
};

const questions = [
  "Can I run the water pump for an hour?",
  "Abeg, make I on AC now?",
  "Ṣé mo lè tan ẹ̀rọ amúlétutù báyìí?",
  "How much battery do I have?",
  "What's the plan tonight?",
  "Can I iron clothes?",
];

for (const question of questions) {
  const { intent, language } = await understand(question, ctx);
  console.log(`Q: ${question}`);
  console.log(`  intent: ${JSON.stringify(intent)} language: ${language}`);
}
