import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";
import type { WhatsAppStatusEvent } from "@/lib/whatsapp/meta";

const rpc = vi.hoisted(() =>
  vi.fn(async () => ({ data: { ok: true, outcome: "applied" }, error: null }) as unknown)
);
const createClient = vi.hoisted(() => vi.fn(() => ({ rpc })));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { applyWhatsAppStatusEvent } = await import("@/lib/whatsapp/reliability");

function statusEvent(overrides: Partial<WhatsAppStatusEvent> = {}): WhatsAppStatusEvent {
  return {
    kind: "status",
    provider: "meta_whatsapp_cloud",
    organizationId: "organization-1",
    configId: "config-1",
    phoneNumberId: "phone-1",
    providerMessageId: "wamid-1",
    status: "delivered",
    timestamp: "2099-01-01T10:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("WhatsApp status reliability handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    rpc.mockResolvedValue({
      data: { ok: true, outcome: "applied", message_id: "message-1", status: "delivered" },
      error: null,
    } as never);
  });

  it("correlates using organization, configuration and provider message id only", async () => {
    await applyWhatsAppStatusEvent(statusEvent());
    expect(rpc).toHaveBeenCalledWith("apply_whatsapp_message_status", {
      target_organization_id: "organization-1",
      target_whatsapp_config_id: "config-1",
      target_provider_message_id: "wamid-1",
      target_status: "delivered",
      target_status_at: "2099-01-01T10:00:00.000Z",
      target_error_code: undefined,
      target_error_message: undefined,
      target_provider: "meta_whatsapp_cloud",
    });
  });

  it("returns the applied transition result", async () => {
    const result = await applyWhatsAppStatusEvent(statusEvent());
    expect(result).toEqual({
      organizationId: "organization-1",
      providerMessageId: "wamid-1",
      outcome: "applied",
      messageId: "message-1",
      status: "delivered",
      previousStatus: null,
    });
  });

  it("forwards provider failure metadata for failed statuses", async () => {
    await applyWhatsAppStatusEvent(
      statusEvent({ status: "failed", errorCode: "131047", errorMessage: "Re-engagement message" })
    );
    expect(rpc).toHaveBeenCalledWith(
      "apply_whatsapp_message_status",
      expect.objectContaining({
        target_status: "failed",
        target_error_code: "131047",
        target_error_message: "Re-engagement message",
      })
    );
  });

  it("reports an unknown provider message without mutating anything", async () => {
    rpc.mockResolvedValue({ data: { ok: true, outcome: "unknown_message" }, error: null } as never);
    const result = await applyWhatsAppStatusEvent(statusEvent({ providerMessageId: "wamid-other" }));
    expect(result.outcome).toBe("unknown_message");
    expect(result.messageId).toBeNull();
  });

  it("surfaces duplicate and stale outcomes as successful no-ops", async () => {
    for (const outcome of ["ignored_duplicate", "ignored_stale", "ignored_terminal"] as const) {
      rpc.mockResolvedValue({
        data: { ok: true, outcome, message_id: "message-1", status: "read" },
        error: null,
      } as never);
      await expect(applyWhatsAppStatusEvent(statusEvent())).resolves.toMatchObject({ outcome });
    }
  });

  it("rejects invalid status events before reaching the database", async () => {
    await expect(applyWhatsAppStatusEvent(statusEvent({ providerMessageId: "  " }))).rejects.toThrow(
      DomainError
    );
    await expect(
      applyWhatsAppStatusEvent(statusEvent({ organizationId: "" }))
    ).rejects.toMatchObject({ code: "whatsapp_pipeline_input_invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a tenant mismatch result to a tenant error", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, error_code: "whatsapp_tenant_mismatch" },
      error: null,
    } as never);
    await expect(applyWhatsAppStatusEvent(statusEvent())).rejects.toMatchObject({
      code: "whatsapp_tenant_mismatch",
    });
  });

  it("maps transport errors to a persistence failure without leaking detail", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "service role key rejected" } } as never);
    await expect(applyWhatsAppStatusEvent(statusEvent())).rejects.toMatchObject({
      code: "whatsapp_status_persistence_failed",
      message: "The WhatsApp delivery status could not be persisted.",
    });
  });

  it("fails closed when service credentials are unavailable", async () => {
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    await expect(applyWhatsAppStatusEvent(statusEvent())).rejects.toMatchObject({
      code: "whatsapp_status_persistence_failed",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
