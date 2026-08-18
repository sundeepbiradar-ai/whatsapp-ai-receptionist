import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DomainError } from "@/lib/domain/errors";
import type { Database, Json } from "@/lib/supabase/database";
import {
  classifyWhatsAppFailure,
  whatsAppRetryAfterSeconds,
  type WhatsAppFailureClass,
} from "@/lib/whatsapp/failures";
import { verifyWebhookToken } from "@/lib/whatsapp/meta";
import { sendWhatsAppText } from "@/lib/whatsapp/outbound";
import {
  computeNextAttemptAt,
  hasRemainingAttempts,
  whatsAppRetryPolicy,
} from "@/lib/whatsapp/retry-policy";

const defaultBatchSize = 25;
const defaultBudgetMs = 45_000;

export type WhatsAppRetryWorkerOptions = {
  batchSize?: number;
  budgetMs?: number;
  random?: () => number;
  now?: () => number;
};

export type WhatsAppRetryWorkerResult = {
  released: number;
  claimed: number;
  completed: number;
  rescheduled: number;
  dead: number;
  unconfirmed: number;
  deferred: number;
};

type ClaimedJob = {
  jobId: string;
  organizationId: string;
  messageId: string;
  attemptCount: number;
  maxAttempts: number;
  content: string;
  recipientPhone: string;
};

function workerFailure(): DomainError {
  return new DomainError(
    "whatsapp_retry_worker_failed",
    "The WhatsApp retry worker could not run."
  );
}

function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) throw workerFailure();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function parseClaimedJobs(value: Json): ClaimedJob[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw workerFailure();
  const result = value as { ok?: boolean; jobs?: unknown };
  if (!result.ok || !Array.isArray(result.jobs)) throw workerFailure();
  const jobs: ClaimedJob[] = [];
  for (const entry of result.jobs) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const job = entry as Record<string, unknown>;
    if (
      typeof job["job_id"] !== "string" ||
      typeof job["organization_id"] !== "string" ||
      typeof job["message_id"] !== "string" ||
      typeof job["attempt_count"] !== "number" ||
      typeof job["max_attempts"] !== "number" ||
      typeof job["content"] !== "string" ||
      typeof job["recipient_phone"] !== "string"
    ) {
      continue;
    }
    jobs.push({
      jobId: job["job_id"],
      organizationId: job["organization_id"],
      messageId: job["message_id"],
      attemptCount: job["attempt_count"],
      maxAttempts: job["max_attempts"],
      content: job["content"],
      recipientPhone: job["recipient_phone"],
    });
  }
  return jobs;
}

function failureClassOf(error: unknown): { code: DomainError["code"]; failureClass: WhatsAppFailureClass } {
  const code = error instanceof DomainError ? error.code : "whatsapp_provider_response_invalid";
  return { code, failureClass: classifyWhatsAppFailure(code) };
}

/**
 * Drains a bounded batch of due retry jobs. Safe to run concurrently: claiming
 * uses FOR UPDATE SKIP LOCKED, so instances receive disjoint jobs.
 */
export async function runWhatsAppRetryWorker(
  options: WhatsAppRetryWorkerOptions = {}
): Promise<WhatsAppRetryWorkerResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? defaultBatchSize, 1), 50);
  const budgetMs = Math.max(options.budgetMs ?? defaultBudgetMs, 1_000);
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const supabase = serviceRoleClient();

  const result: WhatsAppRetryWorkerResult = {
    released: 0,
    claimed: 0,
    completed: 0,
    rescheduled: 0,
    dead: 0,
    unconfirmed: 0,
    deferred: 0,
  };

  const reaped = await supabase.rpc("reap_whatsapp_send_job_claims");
  if (reaped.error) throw workerFailure();
  const reapedValue = reaped.data as { released?: unknown } | null;
  if (reapedValue && typeof reapedValue.released === "number") result.released = reapedValue.released;

  const claimed = await supabase.rpc("claim_whatsapp_send_jobs", { target_batch_size: batchSize });
  if (claimed.error) throw workerFailure();
  const jobs = parseClaimedJobs(claimed.data);
  result.claimed = jobs.length;

  for (const job of jobs) {
    if (now() - startedAt > budgetMs) {
      await supabase.rpc("reschedule_whatsapp_send_job", {
        target_job_id: job.jobId,
        target_next_attempt_at: new Date(now()).toISOString(),
        target_error_code: "whatsapp_retry_budget_exhausted",
        target_error_message: "deferred",
      });
      result.deferred += 1;
      continue;
    }

    try {
      const sent = await sendWhatsAppText({
        organizationId: job.organizationId,
        to: job.recipientPhone,
        text: job.content,
      });
      const completed = await supabase.rpc("complete_whatsapp_send_job", {
        target_job_id: job.jobId,
        target_provider_message_id: sent.providerMessageId,
      });
      const outcome = (completed.data as { outcome?: unknown } | null)?.outcome;
      if (outcome === "unconfirmed") result.unconfirmed += 1;
      else result.completed += 1;
    } catch (error) {
      const failure = failureClassOf(error);
      if (failure.failureClass === "ambiguous") {
        await supabase.rpc("terminate_whatsapp_send_job", {
          target_job_id: job.jobId,
          target_message_status: "unconfirmed",
          target_error_code: failure.code,
          target_error_message: failure.failureClass,
        });
        result.unconfirmed += 1;
        continue;
      }
      if (
        failure.failureClass === "permanent" ||
        !hasRemainingAttempts(job.attemptCount, job.maxAttempts)
      ) {
        await supabase.rpc("terminate_whatsapp_send_job", {
          target_job_id: job.jobId,
          target_message_status: "failed",
          target_error_code: failure.code,
          target_error_message: failure.failureClass,
        });
        result.dead += 1;
        continue;
      }
      const retryAfterSeconds = whatsAppRetryAfterSeconds(error);
      await supabase.rpc("reschedule_whatsapp_send_job", {
        target_job_id: job.jobId,
        target_next_attempt_at: computeNextAttemptAt(job.attemptCount + 1, {
          retryAfterSeconds,
          ...(options.random ? { random: options.random } : {}),
          now: now(),
        }),
        target_error_code: failure.code,
        target_error_message: failure.failureClass,
      });
      result.rescheduled += 1;
    }
  }

  return result;
}

export { whatsAppRetryPolicy };

export function verifyRetryWorkerAuthorization(header: string | null): boolean {
  const secret = process.env["WHATSAPP_RETRY_WORKER_SECRET"] ?? null;
  if (!secret || !header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return verifyWebhookToken(secret, match?.[1]?.trim() ?? null);
}
