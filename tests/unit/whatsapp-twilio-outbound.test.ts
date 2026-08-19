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
    vi.restoreAllMocks();
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

  it("logs safe Twilio rejection diagnostics without request secrets or content", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const twilioMessage = [
      "Invalid destination",
      "fake-twilio-auth-token",
      "ACfaketestaccountsid",
      "+14155238886",
      "+14155550123",
      "Sensitive message body",
    ].join(" ");
    vi.stubGlobal("fetch", vi.fn(async () => response(400, { code: 63016, message: twilioMessage })));

    await expect(sendTwilioSandboxText({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Sensitive message body",
    })).rejects.toMatchObject({
      code: "whatsapp_provider_rejected",
      message: "The WhatsApp provider rejected the message.",
    });

    expect(consoleError).toHaveBeenCalledWith("twilio_whatsapp_outbound_rejected", {
      status: 400,
      twilioCode: 63016,
      twilioMessage:
        "Invalid destination [REDACTED] [REDACTED] [REDACTED] [REDACTED] [REDACTED]",
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("fake-twilio-auth-token");
    expect(logged).not.toContain("ACfaketestaccountsid");
    expect(logged).not.toContain("+14155238886");
    expect(logged).not.toContain("+14155550123");
    expect(logged).not.toContain("Sensitive message body");
  });

  it.each([
    [429, "whatsapp_provider_rate_limited", "The WhatsApp provider rate limited the message."],
    [500, "whatsapp_provider_unavailable", "The WhatsApp provider is temporarily unavailable."],
    [400, "whatsapp_provider_rejected", "The WhatsApp provider rejected the message."],
  ])("preserves the error mapping for status %i", async (status, code, message) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => response(status, { code: 20003, message: "Rejected" })));

    await expect(
      sendTwilioSandboxText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({ code, message });
  });

  it("preserves error handling when Twilio returns invalid JSON", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 400 })));

    await expect(
      sendTwilioSandboxText({ organizationId: "organization-1", to: "+14155550123", text: "Hello" })
    ).rejects.toMatchObject({
      code: "whatsapp_provider_rejected",
      message: "The WhatsApp provider rejected the message.",
    });
    expect(consoleError).toHaveBeenCalledWith("twilio_whatsapp_outbound_rejected", {
      status: 400,
      twilioCode: undefined,
      twilioMessage: undefined,
    });
  });
});
