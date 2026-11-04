# Muse Code log

How KEEPLIT was built with Muse Code (muse-spark-1.3): what we asked, and what happened.

## Nov 1

**Task:** Spark client + ping script
**Prompt:** Create packages/agent with src/spark.ts exporting askSpark(messages, opts) that POSTs to the Meta Model API chat/completions with optional JSON schema output, plus src/ping.ts that asks Spark to "Say OK".
**Result:** Muse wrote both files. First run failed: DNS timeout on api.meta.ai. Fixed with NODE_OPTIONS=--dns-result-order=ipv4first. Spark replies "OK" in ~2 s.
**Changed by hand:** nothing.

## Nov 2

**Task:** Spark can see (images + dev proxy)
**Prompt:** Extend spark.ts to send images (OpenAI-style image_url parts) and run in both Node and the browser; in the browser call /spark with no key, and add a Vite dev proxy that attaches the key server-side. Add ping-image.ts.
**Result:** Works. Muse also wrote 10 tests (spark.test.ts) that fake Meta's server, without being asked. Checked that the key does not appear in the built web bundle.
**Changed by hand:** nothing. (First run failed only because the key wasn't set in the new terminal; moved the key to an ignored .env file and run scripts with --env-file=.env.)

**Task:** Screen reading + physics check
**Prompt:** readScreen() asks Spark for a strict JSON reading (battery %, battery V, load W, PV W, AC input, brand, confidence, notes); validate() rejects impossible values (battery % outside 0–100, battery V outside 12/24/48 V bands, kW read as W, nothing readable); if the check fails, Spark gets one second look with the problems named. eval-screens.ts runs a folder of photos and scores them against answers.csv.
**Result:** 21 tests pass. On two internet photos Spark read no values and said why ("too distant/blurry to decipher any digits"; "LED indicators only, no numeric display") instead of guessing. The physics check caught the empty reading and asked again.
**Changed by hand:** nothing.

**Task:** Scan button in the app
**Prompt:** ScanCard on the Live screen: take a photo, shrink it to 1280 px, readScreen in the browser, show the values and a PHYSICS CHECK list; "Plan from this reading" only when the check passes; offline message if no internet. useSiteWeek applies the scanned battery % before the next plan.
**Result:** Build and lint pass. A reading that fails the physics check cannot be used to plan.
**Changed by hand:** nothing.

**Task:** Scan fixes
**Prompt:** Rename useReading to applyReading (use* is for React hooks); apply a scanned % to the old-rules twin too so Compare stays fair; reasoning_effort "low" for screen reading; read LED indicator lights on units with no digits.
**Result:** Tests and build pass.
**Changed by hand:** nothing.

**Task:** Agent: understands questions, planner answers
**Prompt:** understand() turns a question into an intent (what_if / status / plan / other) and detects the language; whatIf from the planner computes the answer; reply() phrases it in the user's language using only numbers from the planner. Text box and chat bubbles on the Ask tab, with a PLANNER line under each answer.
**Result:** agent-check.ts output:
- "Can I run the water pump for an hour?" → what_if, Water pump 0.75 kW, 60 min, English
- "Abeg, make I on AC now?" → what_if, Air conditioner 1.2 kW, 30 min, Nigerian Pidgin
- "Ṣé mo lè tan ẹ̀rọ amúlétutù báyìí?" → what_if, Air conditioner 1.2 kW, 30 min, Yorùbá
- "How much battery do I have?" → status
- "What's the plan tonight?" → plan
- "Can I iron clothes?" → other (power unknown, so it asks instead of guessing)
Muse added agent tests unprompted.
**Changed by hand:** nothing.

**Task:** Voice
**Prompt:** Mic button on the Ask tab (browser speech recognition behind a Transcriber interface so Meta's transcriber can replace it later); answers read aloud in the matching language.
**Result:** Works on the laptop in Chrome. Known gap: if recognition stops with no speech and no error, the mic button needs one extra tap.
**Changed by hand:** nothing.

## Nov 3

**Task:** Deploy to Vercel
**Prompt:** api/spark.ts server function holds the key (only muse-spark models allowed, body limits, never logs the key); vercel.json builds the web app; service worker ignores /spark and /api; rename the root package to "keeplit".
**Result:** First Vercel build failed: "Cannot find module 'highs'". The web app imports highs directly but only the planner declared it. Fixed by adding highs to apps/web's dependencies. Live at https://keeplit-web.vercel.app/
**Changed by hand:** the highs dependency fix (npm install highs -w @keeplit/web).

## Nov 4

**Task:** Morning fixes before submission
**Prompt:** Add "type": "module" to the root package.json (the Vercel function crashed with FUNCTION_INVOCATION_FAILED because its ESM output was loaded as CommonJS); delete the stray t1.json; append the Nov 2–3 log; show the real Spark error instead of the offline message when online.
**Result:** First attempt failed with Muse API error 400 ("reasoning encrypted_content was not issued to this caller"); a fresh session fixed it. Muse applied the fixes and the build and tests passed, but it deleted the log draft without appending it, so the Nov 2–3 entries were added by hand.
**Changed by hand:** appended the Nov 2–3 log.
