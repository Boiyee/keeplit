/** Live speech-to-text. Kept behind this interface so a Meta realtime
 * transcriber can replace the browser one later without touching AskScreen. */
export interface Transcriber {
  start(onText: (text: string, final: boolean) => void, onError: (msg: string) => void): void;
  stop(): void;
}

// Minimal Web Speech API shapes, declared here so no new packages are needed.
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionInstance {
  interimResults: boolean;
  continuous: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** Browser speech recognition, or null where unsupported. Interim results on, one utterance per start. */
export function browserTranscriber(lang = "en-NG"): Transcriber | null {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return null;
  let rec: SpeechRecognitionInstance | null = null;
  return {
    start(onText, onError) {
      const r = new Ctor();
      rec = r;
      r.interimResults = true;
      r.continuous = false;
      r.lang = lang;
      r.onresult = (e) => {
        let interim = "";
        let said = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0]?.transcript ?? "";
          if (e.results[i].isFinal) said += transcript;
          else interim += transcript;
        }
        if (said !== "") onText(said.trim(), true);
        else if (interim !== "") onText(interim.trim(), false);
      };
      r.onerror = (e) => onError(e.error);
      r.start();
    },
    stop() {
      rec?.stop();
      rec = null;
    },
  };
}

/** Reads text aloud. Cancels anything already speaking; picks a matching voice when one exists. */
export function speak(text: string, lang?: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (lang) {
    utter.lang = lang;
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (voice) utter.voice = voice;
  }
  synth.speak(utter);
}
