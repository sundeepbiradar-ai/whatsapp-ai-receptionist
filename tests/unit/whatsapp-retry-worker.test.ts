import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/domain/errors";
import { WhatsAppProviderError } from "@/lib/whatsapp/failures";

type RpcCall = { name: string; args: Record<string, unknown> };

const store = vi.hoisted(() => ({
  calls: [] as RpcCall[],
  jobs: [] as Array<Record<string, unknown>>,
  claimError: null as { message: string } | null,
  completeOutcome: "completed" as string,
}));

const send = vi.hoisted(() => vi.fn(async () => ({ providerMessageId: "wamid-retry-1" })));

const rpc = vi.hoisted(() =>
  vi.fn(async (name: string, args: Record<string, unknown>) => {
    store.calls.push({ name, args });
    if (name === "reap_whatsapp_send_job_claims")
      return { data: { ok: true, released: 2, retired: 0 }, error: null };
    if (name === "claim_whatsapp_send_jobs") {
      if (store.claimError) return { data: null, error: store.claimError };
      return { data: { ok: true, jobs: store.jobs }, error: null };
    }
    if (name === "complete_whatsapp_send_job")
      return { data: { ok: true, outcome: store.completeOutcome }, error: null };
    return { data: { ok: true }, error: null };
  })
);

const createClient = vi.hoisted(() => vi.fn(() => ({ rpc })));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/whatsapp/outbound", () => ({ sendWhatsAppText: send }));

const { runWhatsAppRetryWorker, verifyRetryWorkerAuthorization } = await import(
  "@/lib/whatsapp/retry"
);

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: "job-1",
    organization_id: "organization-1",
    message_id: "message-1",
    attempt_count: 1,
    max_attempts: 5,
    content: "Hello there",
    recipient_phone: "+14155550123",
    ...overrides,
  };
}

function callsNamed(name: string): RpcCall[] {
  return store.calls.filter((call) => call.name === name);
}

describe("WhatsApp retry worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.calls = [];
    store.jobs = [job()];
    store.claimError = null;
    store.completeOutcome = "completed";
    send.mockResolvedValue({ providerMessageId: "wamid-retry-1" });
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
  });

  it("reaps expired claims before claiming a bounded batch", async () => {
    const result = await runWhatsAppRetryWorker({ batchSize: 10 });
    expect(store.calls[0]?.name).toBe("reap_whatsapp_send_job_claims");
    expect(store.calls[1]).toMatchObject({
      name: "claim_whatsapp_send_jobs",
      args: { target_batch_size: 10 },
    });
    expect(result.released).toBe(2);
  });

  it("clamps the batch size to a safe range", async () => {
    await runWhatsAppRetryWorker({ batchSize: 5000 });
    expect(callsNamed("claim_whatsapp_send_jobs")[0]?.args["target_batch_size"]).toBe(50);
  });

  it("correlates the provider message id on a successful retry", async () => {
    const result = await runWhatsAppRetryWorker();
    expect(send).toHaveBeenCalledWith({
      organizationId: "organization-1",
      to: "+14155550123",
      text: "Hello there",
    });
    expect(callsNamed("complete_whatsapp_send_job")[0]?.args).toEqual({
      target_job_id: "job-1",
      target_provider_message_id: "wamid-retry-1",
    });
    expect(result.completed).toBe(1);
  });

  it("reschedules a retryable failure with bounded backoff", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_unavailable",
        "The WhatsApp provider is temporarily unavailable."
      )
    );
    const result = await runWhatsAppRetryWorker({ random: () => 0.5 });
    const call = callsNamed("reschedule_whatsapp_send_job")[0];
    expect(call?.args["target_error_code"]).toBe("whatsapp_provider_unavailable");
    expect(Date.parse(String(call?.args["target_next_attempt_at"]))).toBeGreaterThan(Date.now());
    expect(result.rescheduled).toBe(1);
    expect(callsNamed("terminate_whatsapp_send_job")).toHaveLength(0);
  });

  it("respects Retry-After when rescheduling a rate-limited retry", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_rate_limited",
        "The WhatsApp provider rate limited the message.",
        1200
      )
    );
    await runWhatsAppRetryWorker({ random: () => 0 });
    const call = callsNamed("reschedule_whatsapp_send_job")[0];
    expect(
      Date.parse(String(call?.args["target_next_attempt_at"])) - Date.now()
    ).toBeGreaterThan(1_180_000);
  });

  it("marks the job dead and the message failed when attempts are exhausted", async () => {
    store.jobs = [job({ attempt_count: 5, max_attempts: 5 })];
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_unavailable",
        "The WhatsApp provider is temporarily unavailable."
      )
    );
    const result = await runWhatsAppRetryWorker();
    expect(callsNamed("terminate_whatsapp_send_job")[0]?.args).toMatchObject({
      target_job_id: "job-1",
      target_message_status: "failed",
      target_error_code: "whatsapp_provider_unavailable",
    });
    expect(callsNamed("reschedule_whatsapp_send_job")).toHaveLength(0);
    expect(result.dead).toBe(1);
  });

  it("marks the job dead immediately on a permanent failure", async () => {
    send.mockRejectedValue(
      new DomainError("whatsapp_destination_invalid", "The WhatsApp destination is invalid.")
    );
    const result = await runWhatsAppRetryWorker();
    expect(callsNamed("terminate_whatsapp_send_job")[0]?.args).toMatchObject({
      target_message_status: "failed",
      target_error_message: "permanent",
    });
    expect(result.dead).toBe(1);
  });

  it("marks an ambiguous outcome unconfirmed and stops retrying it", async () => {
    send.mockRejectedValue(
      new WhatsAppProviderError(
        "whatsapp_provider_network_failure",
        "The WhatsApp provider request outcome is unknown."
      )
    );
    const result = await runWhatsAppRetryWorker();
    expect(callsNamed("terminate_whatsapp_send_job")[0]?.args).toMatchObject({
      target_message_status: "unconfirmed",
      target_error_message: "ambiguous",
    });
    expect(callsNamed("reschedule_whatsapp_send_job")).toHaveLength(0);
    expect(result.unconfirmed).toBe(1);
  });

  it("reports an unconfirmed completion reported by the database", async () => {
    store.completeOutcome = "unconfirmed";
    const result = await runWhatsAppRetryWorker();
    expect(result.unconfirmed).toBe(1);
    expect(result.completed).toBe(0);
  });

  it("skips malformed claim entries instead of sending", async () => {
    store.jobs = [job({ recipient_phone: 42 }), job({ job_id: "job-2" })];
    const result = await runWhatsAppRetryWorker();
    expect(result.claimed).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("defers remaining jobs when the execution budget is spent", async () => {
    store.jobs = [job(), job({ job_id: "job-2" })];
    let current = 0;
    const result = await runWhatsAppRetryWorker({
      budgetMs: 1_000,
      now: () => {
        current += 5_000;
        return current;
      },
    });
    expect(result.deferred).toBe(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed without service credentials and never sends", async () => {
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    await expect(runWhatsAppRetryWorker()).rejects.toMatchObject({
      code: "whatsapp_retry_worker_failed",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("raises a safe error when claiming fails", async () => {
    store.claimError = { message: "service role key rejected" };
    const error = await runWhatsAppRetryWorker().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as Error).message).not.toContain("service role key");
  });
});

describe("WhatsApp retry worker authorization", () => {
  beforeEach(() => {
    process.env["WHATSAPP_RETRY_WORKER_SECRET"] = "worker-secret-value";
  });

  it("accepts only the exact bearer secret", () => {
    expect(verifyRetryWorkerAuthorization("Bearer worker-secret-value")).toBe(true);
    expect(verifyRetryWorkerAuthorization("bearer worker-secret-value")).toBe(true);
  });

  it("rejects missing, malformed, and incorrect credentials", () => {
    expect(verifyRetryWorkerAuthorization(null)).toBe(false);
    expect(verifyRetryWorkerAuthorization("")).toBe(false);
    expect(verifyRetryWorkerAuthorization("worker-secret-value")).toBe(false);
    expect(verifyRetryWorkerAuthorization("Bearer wrong-secret")).toBe(false);
    expect(verifyRetryWorkerAuthorization("Basic worker-secret-value")).toBe(false);
  });

  it("fails closed when the worker secret is not configured", () => {
    delete process.env["WHATSAPP_RETRY_WORKER_SECRET"];
    expect(verifyRetryWorkerAuthorization("Bearer worker-secret-value")).toBe(false);
  });
});
