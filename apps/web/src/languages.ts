/** Voice languages for mic recognition and read-aloud. Codes are BCP-47 tags. */
export const LANGUAGES: { name: string; code: string }[] = [
  { name: "English", code: "en-NG" },
  { name: "Nigerian Pidgin", code: "en-NG" },
  { name: "Yorùbá", code: "yo-NG" },
  { name: "Hausa", code: "ha-NG" },
  { name: "French", code: "fr-FR" },
  { name: "Swahili", code: "sw-KE" },
  { name: "Arabic", code: "ar-EG" },
  { name: "Portuguese", code: "pt-BR" },
  { name: "Spanish", code: "es-MX" },
  { name: "Hindi", code: "hi-IN" },
  { name: "Bengali", code: "bn-BD" },
  { name: "Filipino", code: "fil-PH" },
  { name: "Indonesian", code: "id-ID" },
  { name: "Mandarin Chinese", code: "zh-CN" },
  { name: "Korean", code: "ko-KR" },
  { name: "Japanese", code: "ja-JP" },
];

/** Common alternate names that are not in LANGUAGES, lower-cased. */
const ALIASES: Record<string, string> = {
  yoruba: "yo-NG",
  pidgin: "en-NG",
  tagalog: "fil-PH",
  chinese: "zh-CN",
  mandarin: "zh-CN",
};

/** Speech code for a language name. Matches case-insensitively; defaults to en-US. */
export function codeFor(language: string): string {
  const key = language.trim().toLowerCase();
  for (const l of LANGUAGES) {
    if (l.name.toLowerCase() === key) return l.code;
  }
  return ALIASES[key] ?? "en-US";
}
