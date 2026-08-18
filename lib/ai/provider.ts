import "server-only";

import { DomainError, type DomainErrorCode } from "@/lib/domain/errors";

const completionsUrl = "https://api.openai.com/v1/chat/completions";
const defaultModel = "gpt-4o-mini";
const defaultTimeoutMs = 10_000;
const defaultMaxOutputTokens = 100;

export type ModelMessage = { role: "system" | "user"; content: string };

export type ModelCompletionRequest = {
  messages: ModelMessage[];
  maxOutputTokens?: number;
  timeoutMs?: number;
};

function providerError(code: DomainErrorCode, message: string): DomainError {
  return new DomainError(code, message);
}

/**
 * Only fixed messages escape this boundary: provider bodies, credentials and
 * stack traces are never surfaced to callers.
 */
export async function requestModelCompletion(request: ModelCompletionRequest): Promise<string> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw providerError("ai_configuration_invalid", "The AI provider is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? defaultTimeoutMs);

  let response: Response;
  try {
    response = await fetch(completionsUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env["OPENAI_INTENT_MODEL"] ?? defaultModel,
        temperature: 0,
        max_tokens: request.maxOutputTokens ?? defaultMaxOutputTokens,
        response_format: { type: "json_object" },
        messages: request.messages,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw providerError("ai_provider_timeout", "The AI provider timed out.");
    }
    throw providerError("ai_provider_unavailable", "The AI provider could not be reached.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw providerError("ai_provider_unauthorized", "The AI provider rejected the credentials.");
  }
  if (response.status === 429) {
    throw providerError("ai_provider_rate_limited", "The AI provider rate limited the request.");
  }
  if (!response.ok) {
    throw providerError("ai_provider_unavailable", "The AI provider is unavailable.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw providerError("ai_provider_response_invalid", "The AI provider response is invalid.");
  }

  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw providerError("ai_provider_response_invalid", "The AI provider response is invalid.");
  }
  return content;
}
