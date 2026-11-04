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
  "Je peux allumer la pompe à eau pendant une heure ?",
  "Naweza kuwasha pampu ya maji kwa saa moja?",
  "Zan iya kunna famfon ruwa na awa daya?",
  "هل يمكنني تشغيل مضخة الماء لمدة ساعة؟",
  "Posso ligar a bomba de água por uma hora?",
  "¿Puedo encender la bomba de agua una hora?",
  "क्या मैं एक घंटे के लिए पानी का पंप चला सकता हूँ?",
  "আমি কি এক ঘণ্টার জন্য পানির পাম্প চালাতে পারি?",
  "Puwede ko bang buksan ang water pump nang isang oras?",
  "Bolehkah saya menyalakan pompa air selama satu jam?",
  "我可以开水泵一个小时吗？",
  "물 펌프를 한 시간 동안 켜도 될까요?",
  "水のポンプを1時間使ってもいいですか？",
];

// The run-the-appliance questions: the first three (water pump, air conditioner,
// air conditioner in Yorùbá) plus the thirteen water-pump translations at the end.
const isApplianceQuestion = (i: number) => i < 3 || i >= questions.length - 13;

let correct = 0;
for (const [i, question] of questions.entries()) {
  try {
    const { intent, language, raw } = await understand(question, ctx);
    console.log(`Q: ${question}`);
    console.log(`  intent: ${JSON.stringify(intent)} language: ${language}`);
    console.log(`  raw: kind=${JSON.stringify(raw.kind)} appliance=${JSON.stringify(raw.appliance)}`);
    if (isApplianceQuestion(i) && intent.kind === "what_if") correct += 1;
  } catch (err) {
    console.log(`Q: ${question}`);
    console.log(`  error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`what_if correct: ${correct}/16`);
