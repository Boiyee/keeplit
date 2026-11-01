export type SparkMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AskSparkOpts = {
  model?: string;
  json?: object;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_BASE = "https://api.meta.ai/v1";
const DEFAULT_MODEL = "muse-spark-1.3";

export async function askSpark(messages: SparkMessage[], opts?: AskSparkOpts): Promise<string> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    throw new Error("META_API_KEY is not set");
  }
  const base = process.env.META_API_BASE ?? DEFAULT_BASE;
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
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
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
