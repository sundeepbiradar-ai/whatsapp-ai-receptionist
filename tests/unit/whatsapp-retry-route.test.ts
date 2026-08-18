import { beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({
  calls: 0,
  fail: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/retry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/retry")>(
    "@/lib/whatsapp/retry"
  );
  return {
    verifyRetryWorkerAuthorization: actual.verifyRetryWorkerAuthorization,
    runWhatsAppRetryWorker: vi.fn(async () => {
      worker.calls += 1;
      if (worker.fail) throw new Error("service role key rejected");
      return {
        released: 0,
        claimed: 1,
        completed: 1,
        rescheduled: 0,
        dead: 0,
        unconfirmed: 0,
        deferred: 0,
      };
    }),
  };
});

function request(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/internal/whatsapp/retry", {
    method: "POST",
    headers,
  });
}

describe("internal WhatsApp retry route", () => {
  beforeEach(() => {
    worker.calls = 0;
    worker.fail = false;
    process.env["WHATSAPP_RETRY_WORKER_SECRET"] = "worker-secret-value";
  });

  it("drains a batch for an authenticated worker invocation", async () => {
    const { POST } = await import("@/app/api/internal/whatsapp/retry/route");
    const response = await POST(request({ authorization: "Bearer worker-secret-value" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ claimed: 1, completed: 1 });
    expect(worker.calls).toBe(1);
  });

  it.each([
    undefined,
    { authorization: "Bearer wrong-secret" },
    { authorization: "worker-secret-value" },
    { authorization: "Basic worker-secret-value" },
  ])("rejects unauthenticated invocation %s", async (headers) => {
    const { POST } = await import("@/app/api/internal/whatsapp/retry/route");
    const response = await POST(request(headers));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("worker-secret-value");
    expect(worker.calls).toBe(0);
  });

  it("does not run when the worker secret is unconfigured", async () => {
    delete process.env["WHATSAPP_RETRY_WORKER_SECRET"];
    const { POST } = await import("@/app/api/internal/whatsapp/retry/route");
    const response = await POST(request({ authorization: "Bearer worker-secret-value" }));
    expect(response.status).toBe(403);
    expect(worker.calls).toBe(0);
  });

  it("never leaks internal detail when the worker fails", async () => {
    worker.fail = true;
    const { POST } = await import("@/app/api/internal/whatsapp/retry/route");
    const response = await POST(request({ authorization: "Bearer worker-secret-value" }));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("service role key");
    expect(body).not.toContain("worker-secret-value");
  });
});
