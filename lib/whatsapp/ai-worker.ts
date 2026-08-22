import "server-only";

import { DomainError } from "@/lib/domain/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { runReceptionistOrchestration } from "@/lib/whatsapp/receptionist-orchestration";
import { sendWhatsAppConversationMessage } from "@/lib/whatsapp/messaging";

const defaultBatchSize = 10;
const retryDelayMs = 30_000;

type AiJob = {
  jobId: string;
  organizationId: string;
  inboundMessageId: string;
  conversationId: string;
  attemptCount: number;
  maxAttempts: number;
};

export type WhatsAppAiWorkerResult = {
  claimed: number;
  completed: number;
  rescheduled: number;
  dead: number;
};

function parseJobs(value: unknown): AiJob[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("whatsapp_retry_worker_failed", "The WhatsApp retry worker could not run.");
  const jobs = (value as { ok?: unknown; jobs?: unknown }).jobs;
  if (!(value as { ok?: unknown }).ok || !Array.isArray(jobs)) throw new DomainError("whatsapp_retry_worker_failed", "The WhatsApp retry worker could not run.");
  return jobs.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const job = entry as Record<string, unknown>;
    if (typeof job["job_id"] !== "string" || typeof job["organization_id"] !== "string" || typeof job["inbound_message_id"] !== "string" || typeof job["conversation_id"] !== "string" || typeof job["attempt_count"] !== "number" || typeof job["max_attempts"] !== "number") return [];
    return [{ jobId: job["job_id"], organizationId: job["organization_id"], inboundMessageId: job["inbound_message_id"], conversationId: job["conversation_id"], attemptCount: job["attempt_count"], maxAttempts: job["max_attempts"] }];
  });
}

export async function runWhatsAppAiWorker(options: { batchSize?: number } = {}): Promise<WhatsAppAiWorkerResult> {
  const supabase = createServiceRoleClient("whatsapp_retry_worker_failed");
  const batchSize = Math.min(Math.max(options.batchSize ?? defaultBatchSize, 1), 50);
  const reaped = await supabase.rpc("reap_whatsapp_ai_job_claims");
  if (reaped.error) throw new DomainError("whatsapp_retry_worker_failed", "The WhatsApp retry worker could not run.");
  const claimed = await supabase.rpc("claim_whatsapp_ai_jobs", { target_batch_size: batchSize });
  if (claimed.error) throw new DomainError("whatsapp_retry_worker_failed", "The WhatsApp retry worker could not run.");
  const jobs = parseJobs(claimed.data);
  const result = { claimed: jobs.length, completed: 0, rescheduled: 0, dead: 0 };

  for (const job of jobs) {
    try {
      const orchestrationResult = await runReceptionistOrchestration({
        organizationId: job.organizationId,
        conversationId: job.conversationId,
        sendReply: async (text) => {
          const sent = await sendWhatsAppConversationMessage({
            organizationId: job.organizationId,
            conversationId: job.conversationId,
            text,
            sourceInboundMessageId: job.inboundMessageId,
          });
          return { providerMessageId: sent.providerMessageId };
        },
        recordReply: async () => undefined,
      });
      if (!orchestrationResult.replied) {
        throw new DomainError("whatsapp_retry_worker_failed", orchestrationResult.reason);
      }
      await supabase.rpc("complete_whatsapp_ai_job", { target_job_id: job.jobId });
      result.completed += 1;
    } catch (error) {
      const existing = await supabase
        .from("messages")
        .select("id")
        .eq("organization_id", job.organizationId)
        .eq("source_inbound_message_id", job.inboundMessageId)
        .maybeSingle();
      if (existing.data) {
        await supabase.rpc("complete_whatsapp_ai_job", { target_job_id: job.jobId });
        result.completed += 1;
        continue;
      }
      await supabase.rpc("reschedule_whatsapp_ai_job", {
        target_job_id: job.jobId,
        target_next_attempt_at: new Date(Date.now() + retryDelayMs).toISOString(),
        target_error_code: error instanceof DomainError ? error.code : "whatsapp_ai_processing_failed",
      });
      if (job.attemptCount >= job.maxAttempts) result.dead += 1;
      else result.rescheduled += 1;
    }
  }
  return result;
}
