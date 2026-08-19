import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const getConversationForOrganization = vi.fn(async () => ({
  id: randomUUID(),
  organization_id: randomUUID(),
  contact_id: randomUUID(),
  status: "open" as const,
  channel: "whatsapp" as const,
  whatsapp_config_id: randomUUID(),
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  last_message_at: "2026-01-01T00:00:00Z",
}));

const detectIntent = vi.fn(async () => ({
  intent: "book_appointment" as const,
  requiresClarification: false,
  reason: "classified" as const,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain/conversations/service-repository", () => ({
  getConversationForOrganization,
}));
vi.mock("@/lib/ai/intent-classifier", () => ({
  detectIntent,
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: await getConversationForOrganization(),
            error: null,
          })),
        };
      } else if (table === "messages") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(async () => ({
            data: [
              {
                id: randomUUID(),
                direction: "inbound" as const,
                content: "Can you book an appointment?",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            error: null,
          })),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(),
        maybeSingle: vi.fn(),
      };
    }),
  })),
}));

const { buildConversationStateForOrganization } = await import(
  "@/lib/ai/service-conversation-state"
);

describe("buildConversationStateForOrganization logging", () => {
  let orgId: string;
  let convId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    orgId = randomUUID();
    convId = randomUUID();
  });

  it("logs conversation_load_start with safe metadata only", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_conversation_load_start",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs conversation_load_success with safe metadata only", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_conversation_load_success",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs message_load_start with safe metadata only", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_message_load_start",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs message_load_success with message count but no message content", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_message_load_success",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
          messageCount: expect.any(Number),
        })
      );

      // Verify no message content is logged
      const allLogs = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call));
      const logText = allLogs.join(" ");
      expect(logText).not.toContain("Can you book an appointment?");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs intent_detection_start with message length but no content", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_intent_detection_start",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
          messageLength: expect.any(Number),
        })
      );

      // Verify actual message content is not logged (check for exact message)
      const allLogs = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call));
      const logText = allLogs.join(" ");
      expect(logText).not.toContain("Can you");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs intent_detection_success with intent and reason codes only", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "whatsapp_intent_detection_success",
        expect.objectContaining({
          organizationId: orgId,
          conversationId: convId,
          detectedIntent: "book_appointment",
          reason: "classified",
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("never logs message content in any log entry", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      const allLogs = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call));
      const logText = allLogs.join(" ");

      // Verify message content never appears (exact message phrases)
      expect(logText).not.toContain("Can you book an appointment?");
      expect(logText).not.toContain("Can you");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("never logs sensitive metadata like credentials or tokens", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      const allLogs = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call));
      const logText = allLogs.join(" ");

      // Verify no credentials
      expect(logText).not.toContain("token");
      expect(logText).not.toContain("secret");
      expect(logText).not.toContain("key");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("logs all expected stages in sequence", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await buildConversationStateForOrganization(orgId, convId);

      const calls = consoleErrorSpy.mock.calls;
      const stages = calls
        .filter((call) => call[0] && (call[0] as string).startsWith("whatsapp_"))
        .map((call) => call[0]);

      // Verify expected stages are logged
      expect(stages).toContain("whatsapp_conversation_load_start");
      expect(stages).toContain("whatsapp_conversation_load_success");
      expect(stages).toContain("whatsapp_message_load_start");
      expect(stages).toContain("whatsapp_message_load_success");
      expect(stages).toContain("whatsapp_intent_detection_start");
      expect(stages).toContain("whatsapp_intent_detection_success");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
