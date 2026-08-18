import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";
import { unknownResult, type IntentResult } from "@/lib/ai/intent";

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  created_at: string;
};

const store = vi.hoisted(() => ({
  organizationId: "00000000-0000-4000-8000-0000000000aa",
  conversation: null as Record<string, unknown> | null,
  conversationError: null as { message: string } | null,
  messages: [] as MessageRow[],
  messagesError: null as { message: string } | null,
  filters: [] as Array<Record<string, unknown>>,
  limits: [] as number[],
}));

const detect = vi.hoisted(() =>
  vi.fn(
    async (): Promise<IntentResult> => ({
      intent: "book_appointment",
      requiresClarification: false,
      reason: "classified",
    })
  )
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/intent-classifier", () => ({ detectIntent: detect }));
vi.mock("@/lib/domain/context", () => ({
  requireDomainOrganization: vi.fn(async () => ({
    status: "ready",
    currentOrganization: { id: store.organizationId },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from(table: string) {
      const applied: Record<string, unknown> = { table };
      store.filters.push(applied);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          applied[column] = value;
          return builder;
        },
        order: () => builder,
        limit: (value: number) => {
          store.limits.push(value);
          return Promise.resolve(
            store.messagesError
              ? { data: null, error: store.messagesError }
              : { data: store.messages, error: null }
          );
        },
        maybeSingle: async () =>
          store.conversationError
            ? { data: null, error: store.conversationError }
            : { data: store.conversation, error: null },
      };
      return builder;
    },
  })),
}));

const { buildConversationState, recentMessageLimit } = await import("@/lib/ai/conversation-state");

const conversationId = "00000000-0000-4000-8000-000000000001";
const contactId = "00000000-0000-4000-8000-000000000002";

function message(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "message-1",
    direction: "inbound",
    content: "I want to book an appointment",
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

/** The mocked client returns newest-first, matching the real descending query. */
function newestFirst(rows: MessageRow[]): MessageRow[] {
  return [...rows].reverse();
}

describe("buildConversationState ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.organizationId = "00000000-0000-4000-8000-0000000000aa";
    store.conversation = { id: conversationId, contact_id: contactId, status: "open" };
    store.conversationError = null;
    store.messages = [message()];
    store.messagesError = null;
    store.filters = [];
    store.limits = [];
  });

  it("accepts no caller-supplied organization id", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/ai/conversation-state.ts"), "utf8");
    const signature = source.slice(
      source.indexOf("export async function buildConversationState"),
      source.indexOf("): Promise<ConversationState>")
    );
    expect(signature).toContain("conversationId: string");
    expect(signature).not.toContain("organizationId");
    expect(source).toContain("context.currentOrganization.id");
  });

  it("scopes both queries to the session organization", async () => {
    await buildConversationState({ conversationId });
    const conversationFilter = store.filters.find((entry) => entry["table"] === "conversations");
    const messagesFilter = store.filters.find((entry) => entry["table"] === "messages");
    expect(conversationFilter).toMatchObject({
      organization_id: store.organizationId,
      id: conversationId,
    });
    expect(messagesFilter).toMatchObject({
      organization_id: store.organizationId,
      conversation_id: conversationId,
    });
  });

  it("rejects a conversation that is not visible to the organization", async () => {
    store.conversation = null;
    await expect(buildConversationState({ conversationId })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(detect).not.toHaveBeenCalled();
  });

  it("rejects an invalid conversation identifier before querying", async () => {
    await expect(buildConversationState({ conversationId: "not-a-uuid" })).rejects.toBeInstanceOf(
      DomainError
    );
    expect(store.filters).toHaveLength(0);
  });

  it("maps a conversation load failure without leaking database detail", async () => {
    store.conversationError = { message: 'relation "messages" permission denied for role anon' };
    const error = await buildConversationState({ conversationId }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as Error).message).not.toContain("permission denied");
  });

  it("maps a history load failure without leaking database detail", async () => {
    store.messagesError = { message: "column messages.secret does not exist" };
    const error = await buildConversationState({ conversationId }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as Error).message).not.toContain("does not exist");
  });
});

describe("buildConversationState history window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.conversation = { id: conversationId, contact_id: contactId, status: "open" };
    store.conversationError = null;
    store.messagesError = null;
    store.filters = [];
    store.limits = [];
  });

  it("bounds the history to the documented limit", async () => {
    store.messages = [message()];
    await buildConversationState({ conversationId });
    expect(recentMessageLimit).toBe(20);
    expect(store.limits).toEqual([20]);
  });

  it("returns recent messages in deterministic chronological order", async () => {
    const chronological = [
      message({ id: "m1", created_at: "2026-01-01T10:00:00.000Z", content: "first" }),
      message({ id: "m2", created_at: "2026-01-01T10:01:00.000Z", content: "second" }),
      message({ id: "m3", created_at: "2026-01-01T10:02:00.000Z", content: "third" }),
    ];
    store.messages = newestFirst(chronological);
    const state = await buildConversationState({ conversationId });
    expect(state.recentMessages.map((entry) => entry.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("selects the newest inbound message even when the newest message is outbound", async () => {
    store.messages = newestFirst([
      message({ id: "m1", direction: "inbound", content: "older question" }),
      message({ id: "m2", direction: "inbound", content: "cancel my appointment" }),
      message({ id: "m3", direction: "outbound", content: "Sure, one moment" }),
    ]);
    const state = await buildConversationState({ conversationId });
    expect(state.latestInboundMessageId).toBe("m2");
    expect(state.latestInboundMessageText).toBe("cancel my appointment");
    expect(detect).toHaveBeenCalledWith({ messageText: "cancel my appointment" });
  });

  it("never classifies an outbound message as customer intent", async () => {
    store.messages = newestFirst([
      message({ id: "m1", direction: "outbound", content: "How can we help?" }),
      message({ id: "m2", direction: "outbound", content: "Still there?" }),
    ]);
    const state = await buildConversationState({ conversationId });
    expect(detect).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      hasRecentInboundMessage: false,
      latestInboundMessageId: null,
      latestInboundMessageText: null,
      detectedIntent: "unknown",
      requiresClarification: true,
      intentReason: "no_inbound_message",
    });
  });

  it("handles a conversation with no messages safely", async () => {
    store.messages = [];
    const state = await buildConversationState({ conversationId });
    expect(state.recentMessages).toEqual([]);
    expect(state.hasRecentInboundMessage).toBe(false);
    expect(state.intentReason).toBe("no_inbound_message");
    expect(detect).not.toHaveBeenCalled();
  });
});

describe("buildConversationState intent and clarification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.conversation = { id: conversationId, contact_id: contactId, status: "open" };
    store.conversationError = null;
    store.messages = [message()];
    store.messagesError = null;
    store.filters = [];
    store.limits = [];
  });

  it.each([
    ["book_appointment", false],
    ["reschedule_appointment", false],
    ["cancel_appointment", false],
    ["query_appointment", false],
    ["general_question", false],
    ["greeting", false],
  ] as const)("surfaces %s without clarification", async (intent, requiresClarification) => {
    detect.mockResolvedValue({ intent, requiresClarification, reason: "classified" });
    const state = await buildConversationState({ conversationId });
    expect(state.detectedIntent).toBe(intent);
    expect(state.requiresClarification).toBe(false);
  });

  it("surfaces an unknown classification as requiring clarification", async () => {
    detect.mockResolvedValue(unknownResult("schema_mismatch"));
    const state = await buildConversationState({ conversationId });
    expect(state).toMatchObject({
      detectedIntent: "unknown",
      requiresClarification: true,
      intentReason: "schema_mismatch",
    });
  });

  it("degrades safely when the classifier reports a provider failure", async () => {
    detect.mockResolvedValue(unknownResult("provider_unavailable"));
    const state = await buildConversationState({ conversationId });
    expect(state.detectedIntent).toBe("unknown");
    expect(state.requiresClarification).toBe(true);
    expect(state.latestInboundMessageText).toBe("I want to book an appointment");
  });

  it("does not generate any clarification or reply text", async () => {
    detect.mockResolvedValue(unknownResult("low_signal"));
    const state = await buildConversationState({ conversationId });
    expect(Object.keys(state)).not.toContain("replyText");
    expect(Object.keys(state)).not.toContain("clarificationMessage");
  });

  it("classifies only the latest inbound text, not the whole history", async () => {
    store.messages = newestFirst([
      message({ id: "m1", content: "hello" }),
      message({ id: "m2", content: "actually cancel it" }),
    ]);
    await buildConversationState({ conversationId });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledWith({ messageText: "actually cancel it" });
  });

  it("reports conversation status flags", async () => {
    store.conversation = { id: conversationId, contact_id: contactId, status: "closed" };
    const state = await buildConversationState({ conversationId });
    expect(state.conversationStatus).toBe("closed");
    expect(state.isConversationOpen).toBe(false);
  });
});

describe("Phase 6.2 side-effect boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/ai/conversation-state.ts"), "utf8");

  it.each([
    "@/lib/domain/appointments",
    "@/lib/whatsapp",
    "sendWhatsAppText",
    "sendWhatsAppConversationMessage",
    "createMessage",
    "updateConversationStatus",
    "@supabase/supabase-js",
    "SUPABASE_SERVICE_ROLE_KEY",
  ])("never references %s", (specifier) => {
    expect(source).not.toContain(specifier);
  });

  it.each([".insert(", ".update(", ".upsert(", ".delete(", ".rpc("])(
    "performs no %s operation",
    (operation) => {
      expect(source).not.toContain(operation);
    }
  );

  it("stays server-only", () => {
    expect(source).toContain('import "server-only"');
  });

  it("is not wired into the WhatsApp webhook in Phase 6.2", () => {
    const webhook = readFileSync(
      resolve(process.cwd(), "app/api/whatsapp/webhook/route.ts"),
      "utf8"
    );
    expect(webhook).not.toContain("buildConversationState");
    expect(webhook).not.toContain("@/lib/ai/");
  });
});
