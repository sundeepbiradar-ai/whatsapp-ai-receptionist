import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";

vi.mock("server-only", () => ({}));

const { requestModelCompletion } = await import("@/lib/ai/provider");

const messages = [{ role: "system" as const, content: "classify" }];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AI provider boundary", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env["OPENAI_API_KEY"] = "sk-test-not-a-real-key";
    delete process.env["OPENAI_INTENT_MODEL"];
  });

  it("returns the model message content on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, { choices: [{ message: { content: '{"intent":"greeting"}' } }] })
      )
    );
    await expect(requestModelCompletion({ messages })).resolves.toBe('{"intent":"greeting"}');
  });

  it("requests deterministic JSON output from a fixed endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: "{}" } }] }))
    );
    await requestModelCompletion({ messages });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body["temperature"]).toBe(0);
    expect(body["response_format"]).toEqual({ type: "json_object" });
    expect(body["model"]).toBe("gpt-4o-mini");
  });

  it("fails closed when the API key is unconfigured", async () => {
    delete process.env["OPENAI_API_KEY"];
    vi.stubGlobal("fetch", vi.fn());
    await expect(requestModelCompletion({ messages })).rejects.toMatchObject({
      code: "ai_configuration_invalid",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "ai_provider_unauthorized"],
    [403, "ai_provider_unauthorized"],
    [429, "ai_provider_rate_limited"],
    [500, "ai_provider_unavailable"],
    [503, "ai_provider_unavailable"],
    [400, "ai_provider_unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(status, { error: { message: "sk-test-not-a-real-key" } }))
    );
    const error = await requestModelCompletion({ messages }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code });
    expect((error as Error).message).not.toContain("sk-test-not-a-real-key");
  });

  it("maps an aborted request to a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      })
    );
    await expect(requestModelCompletion({ messages })).rejects.toMatchObject({
      code: "ai_provider_timeout",
    });
  });

  it("maps a transport failure without exposing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Bearer sk-test-not-a-real-key socket hang up");
      })
    );
    const error = await requestModelCompletion({ messages }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "ai_provider_unavailable" });
    expect((error as Error).message).not.toContain("sk-test-not-a-real-key");
  });

  it.each([
    { choices: [] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: "   " } }] },
    { choices: [{ message: { content: 42 } }] },
    {},
  ])("rejects an unusable provider payload %j", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, body))
    );
    await expect(requestModelCompletion({ messages })).rejects.toMatchObject({
      code: "ai_provider_response_invalid",
    });
  });

  it("rejects a non-JSON provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 }))
    );
    await expect(requestModelCompletion({ messages })).rejects.toMatchObject({
      code: "ai_provider_response_invalid",
    });
  });

  it("sends the key only as an authorization header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: "{}" } }] }))
    );
    await requestModelCompletion({ messages });
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const request = init as RequestInit;
    expect((request.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer sk-test-not-a-real-key"
    );
    expect(String(request.body)).not.toContain("sk-test-not-a-real-key");
  });
});
