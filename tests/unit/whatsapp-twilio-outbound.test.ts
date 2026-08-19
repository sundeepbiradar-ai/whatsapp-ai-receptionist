import { beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  value: {
    configId: "config-1",
    organizationId: "organization-1",
    provider: "twilio_whatsapp_sandbox" as const,
    phoneNumberId: "+14155238886",
    businessAccountId: "ACfaketestaccountsid",
    displayPhoneNumber: null,
    accessToken: "fake-twilio-auth-token",
    appSecret: null,
    verifyToken: null,
  } as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/configuration", () => ({
  twilioWhatsAppSandboxProvider: "twilio_whatsapp_sandbox",
  resolveWhatsAppConfigForOrganization: vi.fn(async () => config.value),
}));

import { sendTwilioSandboxText } from "@/lib/whatsapp/twilio-outbound";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("sendTwilioSandboxText", () => {
  beforeEach(() => {
    config.value = {
      configId: "config-1",
      organizationId: "organization-1",
      provider: "twilio_whatsapp_sandbox",
      phoneNumberId: "+14155238886",
      businessAccountId: "ACfaketestaccountsid",
      displayPhoneNumber: null,
      accessToken: "fake-twilio-auth-token",
      appSecret: null,
      verifyToken: null,
    };
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { sid: "SM-outbound-1" })));
  });

  it("sends via the Twilio REST API using Basic auth built from the resolved config", async () => {
    const result = await sendTwilioSandboxText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello from the receptionist",
    });
    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(result).toEqual({
      provider: "twilio_whatsapp_sandbox",
      providerMessageId: "SM-outbound-1",
      recipient: "+14155550123",
    });
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACfaketestaccountsid/Messages.json"
    );
    expect(init).toMatchObject({ method: "POST" });
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(
      `Basic ${Buffer.from("ACfaketestaccountsid:fake-twilio-auth-token").toString("base64")}`
    );
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("To")).toBe("whatsapp:+14155550123");
    expect(body.get("Body")).toBe("Hello from the receptionist");
    expect(JSON.stringify(result)).not.toContain("fake-twilio-auth-token");
  });

  it("rejects a malformed destination without calling the provider", async () => {
    await expect(
      sendTwilioSandboxText({ organizationId: "organization-1", to: "not-a-number", text: "Hello" })
    ).rejects.toMatchObject({ code: "whatsapp_destination_invalid" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws without leaking the auth token when the configuration is unavailable", async () => {
    config.value = null;
    await expect(
      sendTwilioSandboxText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({ code: "whatsapp_configuration_unavailable" });
  });

  it("never leaks the auth token in a provider-rejection error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(400, { message: "bad request" })));
    const error = await sendTwilioSandboxText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello",
    }).catch((value: unknown) => value);
    expect((error as Error).message).not.toContain("fake-twilio-auth-token");
  });
});
