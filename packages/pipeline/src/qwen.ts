/**
 * Qwen/Qwen3.8-2.4T-A95B via Modal proxy — OpenAI-compatible story analysis
 * fallback when Gemini Pro is 429/quota. Uses the endpoint:
 *   baseURL: https://xrayian--ep-qwen3-8-2-4t-a95b-server.us-west.modal.direct/v1
 *   apiKey:  `${MODAL_PROXY_TOKEN_ID}.${MODAL_PROXY_TOKEN_SECRET}`
 */

export const QWEN_DEFAULT_BASE_URL =
  "https://xrayian--ep-qwen3-8-2-4t-a95b-server.us-west.modal.direct/v1";
export const QWEN_DEFAULT_MODEL = "Qwen/Qwen3.8-2.4T-A95B";

export interface QwenStructuredOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemInstruction?: string;
  jsonSchema: object;
}

async function qwenFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => "");
      const err = new Error(`Qwen ${path} failed (${res.status}): ${body.slice(0, 500)}`);
      if (!retryable || attempt >= retries) throw err;
      lastError = err;
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = retryAfter
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 1000, 8000) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /429|5\d\d|timeout|aborted|fetch failed/i.test(msg);
      if (!transient || attempt >= retries) throw err;
      lastError = err;
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    }
  }
  throw new Error(`Qwen request failed after ${retries + 1} attempts: ${String(lastError)}`);
}

/**
 * Calls an OpenAI-compatible chat completions endpoint with JSON-mode
 * and parses the result. The Qwen endpoint is expected to support
 * `response_format: {type:"json_object"}`.
 */
export async function generateStructuredJsonWithQwen(
  opts: QwenStructuredOptions,
  input: string,
  retries = 2
): Promise<unknown> {
  const systemInstruction = opts.systemInstruction ?? "";
  const schemaText = JSON.stringify(opts.jsonSchema, null, 2);
  // Embed the JSON Schema in the system prompt so the model knows the exact shape.
  const fullSystem = `${systemInstruction}\n\nYou MUST output ONLY a single JSON object that conforms to this JSON Schema (draft 2020-12). No markdown, no prose outside the JSON.\n${schemaText}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await qwenFetch(
        opts.baseUrl,
        opts.apiKey,
        "/chat/completions",
        {
          method: "POST",
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: "system", content: fullSystem },
              { role: "user", content: input },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        },
        2
      );
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: unknown;
      };
      if (data.error) throw new Error(`Qwen API error: ${JSON.stringify(data.error).slice(0, 500)}`);
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Qwen returned no content");
      // Some proxies wrap JSON in markdown fences — strip them.
      const stripped = content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      return JSON.parse(stripped) as unknown;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Don't retry on schema/JSON parse errors that are not transient.
      if (/JSON\.parse|not valid JSON/i.test(msg) && attempt >= 0) {
        // Still retry once for malformed JSON — sometimes the model fixes itself.
        if (attempt >= retries) break;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
        continue;
      }
      break;
    }
  }
  throw new Error(`Qwen structured generation failed after ${retries + 1} attempt(s): ${String(lastError)}`);
}