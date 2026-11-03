export const config = { maxDuration: 60 };

const DEFAULT_BASE = "https://api.meta.ai/v1";
const MAX_BODY_BYTES = 3 * 1024 * 1024;

// Server-side proxy for Meta Model API calls from the browser. The key lives
// only in the server environment here; it is never logged or sent back.
export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    return new Response("Spark is not configured", { status: 500 });
  }
  const base = process.env.META_API_BASE ?? DEFAULT_BASE;
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Request body must be JSON", { status: 400 });
  }
  const model = typeof body === "object" && body !== null ? (body as { model?: unknown }).model : undefined;
  if (typeof model !== "string" || !model.startsWith("muse-spark")) {
    return new Response("Model not allowed", { status: 403 });
  }
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: raw,
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
