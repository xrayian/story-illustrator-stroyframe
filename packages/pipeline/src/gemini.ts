import { GoogleGenAI } from "@google/genai";

export interface StructuredGenerationOptions {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  /** Plain JSON Schema (draft 2020-12) the model output must conform to. */
  jsonSchema: object;
}

/**
 * Calls Gemini with a schema-constrained JSON response. Retries the whole
 * call (including JSON parse + revalidation by the caller) up to `retries`
 * times, since schema-constrained generation occasionally still fails.
 */
export async function generateStructuredJson(
  opts: StructuredGenerationOptions,
  input: string,
  retries = 2
): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model: opts.model,
        input,
        system_instruction: opts.systemInstruction,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: opts.jsonSchema,
        },
      });
      const raw = interaction.output_text;
      if (!raw) throw new Error("Gemini returned no output_text");
      return JSON.parse(raw) as unknown;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Gemini structured generation failed after ${retries + 1} attempt(s): ${String(lastError)}`
  );
}