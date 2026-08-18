import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";
import { WhatsAppProviderError } from "@/lib/whatsapp/failures";

type MessageRow = {
  id: string;
  delivery_status: string | null;
  delivery_error_code: string | null;
  delivery_error_message: string | null;
  provider_message_id: string | null;
  content: string;
  direction: string;
};

const store = vi.hoisted(() => ({
  conversation: null as Record<string, unknown> | null,
  contact: null as Record<string, unknown> | null,
  messages: [] as MessageRow[],
  insertError: null as { message: string } | null,
  correlationError: null as { message: string } | null,
  enqueueError: null as { message: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  organizationId: "organization-1",
}));

const send = vi.hoisted(() => vi.fn(async () => ({ providerMessageId: "wamid-out-1" })));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain/context", () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: "ready",
    currentOrganization: { id: store.organizationId },
  })),
}));
vi.mock("@/lib/whatsapp/outbound", () => ({ sendWhatsAppText: send }));
vi.mock("@/lib/whatsapp/configuration", () => ({ metaWhatsAppProvider: "meta_whatsapp_cloud" }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    rpc(name: string, args: Record<string, unknown>) {
      store.rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: store.enqueueError });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        insert(values: Record<string, unknown>) {
          if (store.insertError) return { ...builder, error: store.insertError };
          const row: MessageRow = {
            id: `message-${store.messages.length + 1}`,
            delivery_status: (values["delivery_status"] as string | null) ?? null,
            delivery_error_code: null,
            delivery_error_message: null,
            provider_message_id: (values["provider_message_id"] as string | null) ?? null,
            content: values["content"] as string,
            direction: values["direction"] as string,
          };
          store.messages.push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: row.id }, error: null }),
            }),
          };
        },
        update(values: Record<string, unknown>) {
          const updateBuilder = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return updateBuilder;
            },
            select: () => ({
              maybeSingle: async () => {
                if (store.correlationError) return { data: null, error: store.correlationError };
                const applied = apply(values, filters);
                return { data: applied ? { id: applied.id } : null, error: null };
              },
            }),
            then: (resolve: (value: unknown) => unknown) => {
              apply(values, filters);
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return updateBuilder;
        },
        maybeSingle: async () => {
          if (table === "conversations") return { data: store.conversation, error: null };
          if (table === "contacts") return { data: store.contact, error: null };
          return { data: null, error: null };
        },
      };
      return builder;
    },
  })),
}));

function apply(values: Record<string, unknown>, filters: Record<string, unknown>): MessageRow | null {
  const row = store.messages.find(
    (message) => message.id === filters["id"] && store.organizationId === filters["organization_id"]
  );
  if (!row) return null;
  if ("delivery_status" in values) row.delivery_status = values["delivery_status"] as string;
  if ("delivery_error_code" in values)
    row.delivery_error_code = (values["delivery_error_code"] as string | null) ?? null;
  if ("delivery_error_message" in values)
    row.delivery_error_message = (values["delivery_error_message"] as string | null) ?? null;
  if ("provider_message_id" in values)
    row.provider_message_id = values["provider_message_id"] as string;
  return row;
}

const { sendWhatsAppConversationMessage } = await import("@/lib/whatsapp/messaging");

describe("outbound WhatsApp message persistence and correlation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.messages = [];
    store.insertError = null;
    store.correlationError = null;
    store.enqueueError = null;
    store.rpcCalls = [];
    store.organizationId = "organization-1";
    store.conversation = {
      id: "00000000-0000-4000-8000-000000000001",
      contact_id: "00000000-0000-4000-8000-000000000002",
      channel: "whatsapp",
      whatsapp_config_id: "00000000-0000-4000-8000-000000000003",
    };
    store.contact = { id: "00000000-0000-4000-8000-000000000002", phone: "+14155550123" };
    send.mockResolvedValue({ providerMessageId: "wamid-out-1" });
  });

  it("persists the outbound message and correlates the provider message id", async () => {
    const result = await sendWhatsAppConversationMessage({
      conversationId: "00000000-0000-4000-8000-000000000001",
      text: "Hello there",
    });
    expect(result.providerMessageId).toBe("wamid-out-1");
    expect(result.deliveryStatus).toBe("sent");
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      direction: "outbound",
      delivery_status: "sent",
      provider_message_id: "wamid-out-1",
    });
  });

  it("sends to the conversation contact of the caller organization only", async () => {
    await sendWhatsAppConversationMessage({
      conversationId: "00000000-0000-4000-8000-000000000001",
      text: "Hello there",
    });
    expect(send).toHaveBeenCalledWith({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello there",
    });
  });

  it("records a durable failure and enqueues no job for a permanent rejection", async () => {
    send.mockRejectedValue(
      new DomainError("whatsapp_provider_rejected", "The WhatsApp provider rejected the message.")
    );
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "whatsapp_provider_rejected" });
    expect(store.messages[0]).toMatchObject({
      delivery_status: "failed",
      delivery_error_code: "whatsapp_provider_rejected",
      delivery_error_message: "permanent",
    });
    expect(store.rpcCalls).toHaveLength(0);
  });

  it("enqueues exactly one retry job for a safe retryable failure", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_unavailable",
        "The WhatsApp provider is temporarily unavailable."
      )
    );
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
        random: () => 1,
      })
    ).rejects.toMatchObject({ code: "whatsapp_provider_unavailable" });
    expect(store.rpcCalls).toHaveLength(1);
    expect(store.rpcCalls[0]?.name).toBe("enqueue_whatsapp_send_job");
    expect(store.rpcCalls[0]?.args).toMatchObject({
      target_organization_id: "organization-1",
      target_message_id: "message-1",
      target_error_code: "whatsapp_provider_unavailable",
    });
    // The message must stay pending so the durable worker can claim the job.
    expect(store.messages[0]).toMatchObject({ delivery_status: "pending" });
  });

  it("honours Retry-After when scheduling the first retry", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_rate_limited",
        "The WhatsApp provider rate limited the message.",
        900
      )
    );
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
        random: () => 0,
      })
    ).rejects.toMatchObject({ code: "whatsapp_provider_rate_limited" });
    const scheduled = Date.parse(
      String(store.rpcCalls[0]?.args["target_next_attempt_at"])
    );
    expect(scheduled - Date.now()).toBeGreaterThan(880_000);
  });

  it("marks an ambiguous network outcome unconfirmed and enqueues no job", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_network_failure",
        "The WhatsApp provider request outcome is unknown."
      )
    );
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "whatsapp_provider_network_failure" });
    expect(store.messages[0]).toMatchObject({
      delivery_status: "unconfirmed",
      delivery_error_code: "whatsapp_provider_network_failure",
      delivery_error_message: "ambiguous",
    });
    expect(store.rpcCalls).toHaveLength(0);
  });

  it("marks provider success with failed correlation as unconfirmed", async () => {
    store.correlationError = { message: "update failed" };
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "whatsapp_message_unconfirmed" });
    expect(store.messages[0]).toMatchObject({
      delivery_status: "unconfirmed",
      delivery_error_code: "whatsapp_message_unconfirmed",
    });
    expect(store.rpcCalls).toHaveLength(0);
  });

  it("falls back to unconfirmed when the retry job cannot be enqueued", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_unavailable",
        "The WhatsApp provider is temporarily unavailable."
      )
    );
    store.enqueueError = { message: "enqueue failed" };
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "whatsapp_provider_unavailable" });
    expect(store.messages[0]).toMatchObject({ delivery_status: "unconfirmed" });
  });

  it("never stores provider credentials in delivery metadata", async () => {
    send.mockRejectedValue(
      new DomainError(
        "whatsapp_configuration_unavailable",
        "WhatsApp provider configuration is unavailable."
      )
    );
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toBeInstanceOf(DomainError);
    const stored = JSON.stringify(store.messages);
    expect(stored).not.toContain("Bearer");
    expect(stored).not.toContain("access");
  });

  it("rejects non-WhatsApp conversations before touching the provider", async () => {
    store.conversation = {
      id: "00000000-0000-4000-8000-000000000001",
      contact_id: "00000000-0000-4000-8000-000000000002",
      channel: null,
      whatsapp_config_id: null,
    };
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "whatsapp_conversation_invalid" });
    expect(send).not.toHaveBeenCalled();
    expect(store.messages).toHaveLength(0);
  });

  it("rejects a conversation outside the caller organization", async () => {
    store.conversation = null;
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "Hello there",
      })
    ).rejects.toMatchObject({ code: "not_found" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects empty message text before reserving a row", async () => {
    await expect(
      sendWhatsAppConversationMessage({
        conversationId: "00000000-0000-4000-8000-000000000001",
        text: "   ",
      })
    ).rejects.toMatchObject({ code: "whatsapp_message_invalid" });
    expect(store.messages).toHaveLength(0);
  });
});
