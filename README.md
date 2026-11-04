# KEEPLIT
 
**An AI operator for small solar + battery + generator sites.** It plans the next 24 hours every hour, so the generator burns less fuel and the critical load (a clinic's vaccine fridge) never loses power. It runs in the browser, on the phone, and keeps working with no internet.
 
**Live demo:** https://keeplit-web.vercel.app
 
## The problem
 
Across Nigeria, and in much of the world, small clinics, shops and homes run on solar panels, a battery and a petrol generator, with a grid that goes off for hours at a time. The inverter decides when the generator runs using a fixed rule: start it when the battery falls to 20%, stop it at 80%. That rule doesn't know the sun will be up in two hours, or that the grid usually comes back in the evening. It burns fuel the site didn't need to burn, at around ₦1,000 a litre.
 
## What KEEPLIT does
 
| Tab | What it shows |
|---|---|
| **Live** | Where power is flowing right now, and the next action: "Generator off until 14:00", with the reason. |
| **Plan** | The next 24 hours: battery level, and which hours run on sun, battery, grid or generator. |
| **Ask** | "Can I run the sterilizer now?" Answered by re-planning with that load added: *yes now*, *wait until 10:00*, or *it will cost about 0.4 L of fuel*. Typed or spoken, in 16 languages (see below). |
| **Compare** | The old inverter rule and KEEPLIT running the same week side by side, in litres and naira. |
| **Sites** | Switch between a Lagos clinic (grid with long outages) and a village in Palawan, Philippines (no grid). Money is shown in the site's own currency. |
| **Scan** | Photograph the inverter screen. KEEPLIT reads it, checks the reading against physics, and plans from the real battery level. |
 
## Results
 
Lagos clinic (3.6 kWp solar, 7.2 kWh battery, 4 kW petrol generator, grid off 6–12 h twice a day), averaged over 5 simulated weeks, with grid outage times forecast up to ±1 h wrong:
 
| Per week | Old inverter rule | KEEPLIT |
|---|---|---|
| Fuel | 14.6 L | **9.3 L (−36%)** |
| Generator running | 9.1 h | 6.8 h (−25%) |
| Battery below 20% | 1.4 h | 0.7 h (−52%) |
| Fridge without power | 0 min | 0 min |
| Spare loads switched off | 0 kWh | 0.6 kWh |
 
That is roughly **₦275,000 a year** for one clinic at ₦1,000/L.
 
Where it doesn't help: on a village site with no grid and a generator that has to run most evenings anyway (Palawan, Philippines), KEEPLIT used slightly *more* fuel than the simple rule (21.9 vs 21.3 L/week). The savings come from knowing when the grid and the sun will be back; when there is nothing to wait for, there is little to plan. Reproduce both with `npx tsx packages/planner/src/compare.ts 5`.
 
## How it works
 
**The planner (runs on the device).** Every hour KEEPLIT solves a mixed-integer linear program over the next 24 one-hour slots: battery energy balance with charge/discharge efficiencies and limits, generator on/off with a minimum 70% load (generators are inefficient when lightly loaded), a start-up cost, a soft battery reserve, and a large penalty on the fridge losing power. Costs are expressed in litres of fuel, so it works in any currency. The battery left at the end of the horizon is valued at what it would cost to refill, so the plan doesn't drain it just because tomorrow is out of view. The solver is [HiGHS](https://highs.dev) compiled to WebAssembly, running in a Web Worker: a plan takes under a second on a laptop and needs no server.
 
**Meta Muse Spark (when online).**
- *Screen reading.* Spark returns a strict JSON reading of the inverter screen (battery %, battery voltage, load, solar, AC input). A physics check rejects impossible values: a battery outside 0–100%, a voltage that fits no 12/24/48 V system, kilowatts misread as watts. If the check fails, Spark gets one more look with the problems named. KEEPLIT won't plan from a reading that still fails. When the screen can't be read, Spark says so instead of guessing.
- *Questions.* Spark only works out what is being asked (which appliance, how long, which language). The planner computes the answer. Spark then phrases it in the person's language using only the planner's numbers, and every answer shows the planner's verdict underneath so you can see where the numbers came from.
 
**Offline.** KEEPLIT is a PWA. Everything, including the 3.5 MB solver, is cached after the first visit, so Live, Plan, Compare and the appliance picker on Ask keep working with no connection. Scanning and free-text questions need internet and say so.
 
**The key stays on the server.** The browser calls `/spark`; a small server function (`api/spark.ts`) adds the Meta API key, accepts only Spark models and rejects oversized requests.
 
## Languages
 
Ask understands questions in 16 languages. Spark detects the language, picks the appliance from the site's list, the planner does the maths, and the answer comes back in the same language.
 
| Region | Languages |
|---|---|
| Nigeria / West Africa | English, Nigerian Pidgin, Yorùbá, Hausa, French |
| East Africa | Swahili |
| North Africa / Middle East | Arabic |
| Americas | Spanish, Portuguese |
| South Asia | Hindi, Bengali |
| East and Southeast Asia | Mandarin Chinese, Japanese, Korean, Filipino, Indonesian |
 
Tested with `packages/agent/src/agent-check.ts`: "Can I run the water pump for an hour?" in English and 13 other languages, plus "Can I turn on the AC?" in Nigerian Pidgin and Yorùbá. Result in our last run: **16/16 understood correctly**. The first runs got about 13/16, with a different few failing each time. What fixed it (all in [docs/muse-log.md](docs/muse-log.md)): Spark may only answer with an appliance name from the site's list, the appliance's power is looked up from that list instead of taken from the model, a named appliance is treated as a "can I run it?" question, and a dropped network connection is retried once.
 
## How it was built
 
Built by Jubreel Oduwale (400L Mechanical Engineering, FUNAAB) for the Meta Global AI Developer Hackathon.
 
The simulator, planner and first screens were developed with guidance from his brother Dokun and Claude. From Nov 1, the Meta AI features (screen reading with the physics check, the agent, voice, deployment) were written with **Muse Code**, from prompts in the repo, reviewed and tested by Jubreel. Every Muse task, prompt, result and hand fix is in [docs/muse-log.md](docs/muse-log.md). Muse also wrote test suites for the Spark client, the physics check and the agent without being asked.
 
## Run it
 
```bash
npm ci
npm run dev -w @keeplit/web             # the app, at localhost:5173
npm test -w @keeplit/agent              # Spark client, physics check and agent tests (no API calls)
npx tsx packages/planner/src/compare.ts 5   # old rule vs KEEPLIT over 5 simulated weeks
```
 
For the Meta features, put your key in a `.env` file at the repo root (it is git-ignored):
 
```
META_API_KEY=...
```
 
and run scripts with `npx tsx --env-file=.env …`. The dev server reads the same file.
 
## Layout
 
```
packages/sim       plant simulator (15-min steps), Lagos and Palawan scenarios, the old inverter rule
packages/planner   MILP planner (HiGHS), "can I run X?" what-if, old-vs-KEEPLIT comparison
packages/agent     Spark client, screen reading + physics check, agent, eval scripts
apps/web           React + Vite + Tailwind PWA; planner in Web Workers
api/spark.ts       server function that holds the API key
```
 
## Limits
 
- The fuel results come from simulated weeks with realistic solar, load and outage patterns, not from a site's logged data.
- Screen reading has been tested on only a handful of photos so far, not a measured benchmark.
- Voice input uses the browser's speech recognition, so which spoken languages work depends on the browser (Chrome hears most of the 16; spoken Yorùbá and Hausa are limited). Typed questions work in all 16. Meta's own transcription model doesn't cover Yorùbá or Hausa yet.
- One site's appliance list is fixed for the demo; there is no "set up your own site" form yet.
 
## License
 
MIT