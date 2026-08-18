import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  value: {
    configId: "config-1",
    organizationId: "organization-1",
    provider: "meta_whatsapp_cloud" as const,
    phoneNumberId: "phone-number-1",
    businessAccountId: "business-1",
    displayPhoneNumber: null,
    accessToken: "fake-access-token",
    appSecret: null,
    verifyToken: null,
  } as {
    configId: string;
    organizationId: string;
    provider: "meta_whatsapp_cloud";
    phoneNumberId: string;
    businessAccountId: string;
    displayPhoneNumber: string | null;
    accessToken: string;
    appSecret: string | null;
    verifyToken: string | null;
  } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/configuration", () => ({
  metaWhatsAppProvider: "meta_whatsapp_cloud",
  resolveWhatsAppConfigForOrganization: vi.fn(async () => config.value),
}));

import { DomainError } from "@/lib/domain/errors";
import { WhatsAppProviderError } from "@/lib/whatsapp/failures";
import { sendWhatsAppText } from "@/lib/whatsapp/outbound";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sendWhatsAppText", () => {
  beforeEach(() => {
    config.value = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "meta_whatsapp_cloud",
      phoneNumberId: "phone-number-1",
      businessAccountId: "business-1",
      displayPhoneNumber: null,
      accessToken: "fake-access-token",
      appSecret: null,
      verifyToken: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200, { messages: [{ id: "wamid.test-1" }] }))
    );
  });

  it("resolves organization configuration and normalizes a successful Meta response", async () => {
    const result = await sendWhatsAppText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello from the receptionist",
    });
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(result).toEqual({
      provider: "meta_whatsapp_cloud",
      providerMessageId: "wamid.test-1",
      recipient: "+14155550123",
    });
    expect(url).toBe("https://graph.facebook.com/v20.0/phone-number-1/messages");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer fake-access-token",
        "content-type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      to: "+14155550123",
      type: "text",
      text: { body: "Hello from the receptionist" },
    });
    expect(JSON.stringify(result)).not.toContain("fake-access-token");
  });

  it.each(["", "12345", "+0123456789", "+141555501234567890"])(
    "rejects malformed destination %s",
    async (to) => {
      await expect(
        sendWhatsAppText({ organizationId: "organization-1", to, text: "Hello" })
      ).rejects.toMatchObject({
        code: "whatsapp_destination_invalid",
      });
    }
  );

  it("rejects empty and overlong text without truncating", async () => {
    await expect(
      sendWhatsAppText({ organizationId: "organization-1", to: "+14155550123", text: "  " })
    ).rejects.toMatchObject({
      code: "whatsapp_message_invalid",
    });
    await expect(
      sendWhatsAppText({
        organizationId: "organization-1",
        to: "+14155550123",
        text: "x".repeat(4097),
      })
    ).rejects.toMatchObject({
      code: "whatsapp_message_invalid",
    });
  });

  it("rejects missing active configuration", async () => {
    config.value = null;
    await expect(
      sendWhatsAppText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({
      code: "whatsapp_configuration_unavailable",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, "whatsapp_provider_rejected"],
    [401, "whatsapp_provider_rejected"],
    [429, "whatsapp_provider_rate_limited"],
    [500, "whatsapp_provider_unavailable"],
    [503, "whatsapp_provider_unavailable"],
  ] as const)("maps provider HTTP %s failures safely", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(status, { access_token: "secret-not-exposed" }))
    );
    const error = await sendWhatsAppText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code });
    expect(error).toBeInstanceOf(DomainError);
    expect((error as Error).message).not.toContain("secret-not-exposed");
  });

  it("maps network failures without exposing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Bearer fake-access-token network failure");
      })
    );
    const error = await sendWhatsAppText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "whatsapp_provider_network_failure" });
    expect((error as Error).message).not.toContain("fake-access-token");
  });

  it("rejects malformed provider responses and missing message IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200, { messages: [] }))
    );
    await expect(
      sendWhatsAppText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({
      code: "whatsapp_provider_response_invalid",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 }))
    );
    await expect(
      sendWhatsAppText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({
      code: "whatsapp_provider_response_invalid",
    });
  });

  it("does not allow callers to override provider routing fields", async () => {
    await sendWhatsAppText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" });
    const [url] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toContain("phone-number-1");
    expect(url).not.toContain("arbitrary-provider-url");
  });

  it.each(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"])(
    "treats connect-phase cause %s as definitely unreachable",
    async (causeCode) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw Object.assign(new Error("fetch failed"), { cause: { code: causeCode } });
        })
      );
      const error = await sendWhatsAppText({
        organizationId: "organization-1",
        to: "+14155550123",
        text: "Hello",
      }).catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "whatsapp_provider_unreachable" });
    }
  );

  it.each(["ECONNRESET", "UND_ERR_SOCKET", "ETIMEDOUT"])(
    "treats post-request cause %s as ambiguous",
    async (causeCode) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw Object.assign(new Error("fetch failed"), { cause: { code: causeCode } });
        })
      );
      const error = await sendWhatsAppText({
        organizationId: "organization-1",
        to: "+14155550123",
        text: "Hello",
      }).catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "whatsapp_provider_network_failure" });
    }
  );

  it("surfaces a numeric Retry-After on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: {} }), {
            status: 429,
            headers: { "retry-after": "120" },
          })
      )
    );
    const error = await sendWhatsAppText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello",
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(WhatsAppProviderError);
    expect((error as WhatsAppProviderError).retryAfterSeconds).toBe(120);
  });

  it("caps and normalizes unusual Retry-After values", async () => {
    async function retryAfterFor(header: string | null): Promise<number | null> {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("{}", {
              status: 429,
              ...(header ? { headers: { "retry-after": header } } : {}),
            })
        )
      );
      const error = await sendWhatsAppText({
        organizationId: "organization-1",
        to: "+14155550123",
        text: "Hello",
      }).catch((value: unknown) => value);
      return (error as WhatsAppProviderError).retryAfterSeconds;
    }

    expect(await retryAfterFor("99999")).toBe(3600);
    expect(await retryAfterFor("not-a-number")).toBeNull();
    expect(await retryAfterFor(null)).toBeNull();
    expect(await retryAfterFor(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("carries no Retry-After for non-rate-limit failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(503, {}))
    );
    const error = await sendWhatsAppText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello",
    }).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "whatsapp_provider_unavailable" });
    expect((error as WhatsAppProviderError).retryAfterSeconds).toBeNull();
  });
});
