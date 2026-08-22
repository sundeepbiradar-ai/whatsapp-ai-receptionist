import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args?: Record<string, unknown> }>,
  jobs: [] as Array<Record<string, unknown>>,
  existingOutbound: null as { id: string } | null,
}));

const runOrchestration = vi.hoisted(() => vi.fn());
const sendDurable = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      state.calls.push({ name, args });
      if (name === "claim_whatsapp_ai_jobs") return { data: { ok: true, jobs: state.jobs }, error: null };
      return { data: { ok: true }, error: null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: state.existingOutbound, error: null })) })),
        })),
      })),
    })),
  })),
}));
vi.mock("@/lib/whatsapp/receptionist-orchestration", () => ({
  runReceptionistOrchestration: runOrchestration,
}));
vi.mock("@/lib/whatsapp/messaging", () => ({
  sendWhatsAppConversationMessage: sendDurable,
}));

const { runWhatsAppAiWorker } = await import("@/lib/whatsapp/ai-worker");

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: "ai-job-1",
    organization_id: "organization-1",
    inbound_message_id: "inbound-1",
    conversation_id: "conversation-1",
    attempt_count: 1,
    max_attempts: 5,
    ...overrides,
  };
}

describe("WhatsApp AI worker", () => {
  beforeEach(() => {
    state.calls = [];
    state.jobs = [job()];
    state.existingOutbound = null;
    runOrchestration.mockReset();
    sendDurable.mockReset();
    sendDurable.mockResolvedValue({ messageId: "outbound-1", providerMessageId: "wamid-1" });
    runOrchestration.mockImplementation(async (input: { sendReply: (text: string) => Promise<unknown> }) => {
      await input.sendReply("Hello");
      return { replied: true, providerMessageId: "wamid-1" };
    });
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service-role";
  });

  it("claims an AI job, runs orchestration, and uses one source-keyed durable send", async () => {
    const result = await runWhatsAppAiWorker();
    expect(result).toMatchObject({ claimed: 1, completed: 1 });
    expect(sendDurable).toHaveBeenCalledWith({
      organizationId: "organization-1",
      conversationId: "conversation-1",
      text: "Hello",
      sourceInboundMessageId: "inbound-1",
    });
    expect(state.calls.filter((call) => call.name === "complete_whatsapp_ai_job")).toHaveLength(1);
  });

  it("reschedules when orchestration fails before outbound reservation", async () => {
    runOrchestration.mockRejectedValueOnce(new Error("model unavailable"));
    const result = await runWhatsAppAiWorker();
    expect(result.rescheduled).toBe(1);
    expect(sendDurable).not.toHaveBeenCalled();
    expect(state.calls.some((call) => call.name === "reschedule_whatsapp_ai_job")).toBe(true);
  });

  it("completes the AI job when outbound ownership already exists", async () => {
    sendDurable.mockRejectedValueOnce(new Error("provider unavailable"));
    state.existingOutbound = { id: "outbound-1" };
    const result = await runWhatsAppAiWorker();
    expect(result.completed).toBe(1);
    expect(state.calls.some((call) => call.name === "reschedule_whatsapp_ai_job")).toBe(false);
    expect(state.calls.filter((call) => call.name === "complete_whatsapp_ai_job")).toHaveLength(1);
  });

  it("does not claim malformed jobs", async () => {
    state.jobs = [job({ inbound_message_id: 42 })];
    const result = await runWhatsAppAiWorker();
    expect(result.claimed).toBe(0);
    expect(runOrchestration).not.toHaveBeenCalled();
  });
});
