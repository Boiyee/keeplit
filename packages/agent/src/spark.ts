export type SparkTextPart = {
  type: "text";
  text: string;
};

export type SparkImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type SparkPart = SparkTextPart | SparkImagePart;

export type SparkMessage = {
  role: "system" | "user" | "assistant";
  content: string | SparkPart[];
};

export function imagePart(dataUrl: string): SparkImagePart {
  return { type: "image_url", image_url: { url: dataUrl } };
}

export type AskSparkOpts = {
  model?: string;
  json?: object;
  base?: string;
  key?: string;
  reasoningEffort?: string;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_BASE = "https://api.meta.ai/v1";
const BROWSER_BASE = "/spark";
const DEFAULT_MODEL = "muse-spark-1.3";

// typeof guard keeps this file runnable in the browser, where `process` does not exist.
function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}

export async function askSpark(messages: SparkMessage[], opts?: AskSparkOpts): Promise<string> {
  const isBrowser = typeof window !== "undefined";
  const base = opts?.base ?? (isBrowser ? BROWSER_BASE : (env("META_API_BASE") ?? DEFAULT_BASE));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!isBrowser) {
    const apiKey = opts?.key ?? env("META_API_KEY");
    if (!apiKey) {
      throw new Error("META_API_KEY is not set");
    }
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const body: Record<string, unknown> = {
    model: opts?.model ?? DEFAULT_MODEL,
    messages,
  };
  if (opts?.json !== undefined) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "answer",
        schema: opts.json,
        strict: true,
      },
    };
  }
  if (opts?.reasoningEffort !== undefined) {
    body.reasoning_effort = opts.reasoningEffort;
  }
  const url = `${base}/chat/completions`;
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // The request never reached the server (ECONNRESET, "fetch failed", ...):
    // wait 800 ms and retry once with the same request. HTTP error
    // responses are returned, never retried.
    await new Promise((r) => setTimeout(r, 800));
    res = await fetch(url, init);
  }
  const responseBody = await res.text();
  if (!res.ok) {
    throw new Error(`Meta API request failed with status ${res.status}: ${responseBody}`);
  }
  let data: ChatCompletionsResponse;
  try {
    data = JSON.parse(responseBody) as ChatCompletionsResponse;
  } catch {
    throw new Error(`Meta API request failed with status ${res.status}: invalid JSON response: ${responseBody}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Meta API request failed with status ${res.status}: missing content in response: ${responseBody}`);
  }
  return content;
}
