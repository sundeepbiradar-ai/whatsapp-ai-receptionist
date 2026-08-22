import "server-only";

/**
 * TEST-ONLY Meta webhook simulation harness.
 *
 * This module exists so developers can exercise the real inbound WhatsApp
 * pipeline (parse -> verify -> normalize -> persist -> AI receptionist ->
 * outbound record) with a simulated Meta Cloud API delivery, without a live
 * Meta test phone number. It is wired ONLY into the gated test-only route
 * app/api/test/whatsapp/meta-harness/route.ts (404 in production and unless
 * WHATSAPP_TEST_HARNESS_ENABLED=true) and into tests. It must never be
 * imported by production routes.
 *
 * What is real here: JSON parsing, phone-number-id extraction, configuration
 * resolution (Vault-backed), webhook signature verification (the harness
 * signs the body with the resolved app secret, simulating Meta's signed
 * delivery, then runs the real verification), event normalization, inbound
 * persistence, receptionist orchestration, scheduling/business rules.
 *
 * What is simulated: ONLY the final provider delivery. The capturing
 * transport records the reply instead of calling the Meta Graph API and
 * returns an explicit simulated result (provider "meta_test_capture",
 * provider message id prefixed "wamid.SIMULATED_"). The simulated outbound
 * record is persisted with a NULL delivery_status so it is never mistaken
 * for a real provider delivery (null = internal/simulated per the
 * messages.delivery_status schema contract).
 */

import { createHmac, randomUUID } from "node:crypto";

import { safeFallbackReply } from "@/lib/ai/receptionist-reply";
import { DomainError } from "@/lib/domain/errors";
import { queryAppointmentsForOrganizationAndContact } from "@/lib/domain/appointments/service-repository";
import { getReceptionistContextForOrganization } from "@/lib/domain/business/service-repository";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  metaWhatsAppProvider,
  resolveWhatsAppConfigByPhoneNumberId,
} from "@/lib/whatsapp/configuration";
import {
  extractPhoneNumberId,
  normalizeMetaWebhookEvents,
  parseWebhookJson,
  verifyMetaWebhookSignature,
  type WhatsAppInboundMessageEvent,
} from "@/lib/whatsapp/meta";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import { runReceptionistOrchestration } from "@/lib/whatsapp/receptionist-orchestration";
import { applyWhatsAppStatusEvent } from "@/lib/whatsapp/reliability";

export const simulatedMetaProvider = "meta_test_capture" as const;
export const simulatedProviderMessageIdPrefix = "wamid.SIMULATED_" as const;

export type MetaTestHarnessInbound = {
  senderPhone: string;
  text: string;
  providerMessageId: string;
};

export type MetaTestHarnessProcessed = {
  organizationId: string;
  contactId: string;
  conversationId: string;
  inboundMessageId: string | null;
  duplicate: boolean;
};

export type MetaTestHarnessAi = {
  replied: boolean;
  replyText: string | null;
  /** True when the reply equals the fixed safe fallback (AI provider unavailable/failed). */
  fallbackUsed: boolean;
  /** Orchestration failure/timeout reason when no reply was produced. */
  reason: string | null;
};

export type MetaTestHarnessOutbound = {
  simulatedProvider: typeof simulatedMetaProvider;
  recipient: string;
  capturedText: string;
  providerMessageId: string;
  recordedMessageId: string;
};

export type MetaTestHarnessScheduling = {
  /**
   * The webhook orchestration path never executes booking/reschedule/cancel
   * mutations (service-scheduling-tools returns "sandbox_mutation_unavailable");
   * only read-only query_appointments can execute.
   */
  mutationExecutionSupported: false;
  upcomingAppointmentsForContact: number;
};

export type MetaTestHarnessMessageResult = {
  inbound: MetaTestHarnessInbound;
  processed: MetaTestHarnessProcessed;
  ai: MetaTestHarnessAi;
  outbound: MetaTestHarnessOutbound | null;
  scheduling: MetaTestHarnessScheduling;
  receptionistContext: { hasInstructions: boolean; hasFaq: boolean };
};

export type MetaTestHarnessResult = {
  simulatedProvider: typeof simulatedMetaProvider;
  signatureVerified: true;
  events: { messageEvents: number; statusEvents: number; statusEventsApplied: number };
  messages: MetaTestHarnessMessageResult[];
};

/**
 * Persists the simulated reply as an outbound message with an explicitly
 * non-delivered state: synthetic provider message id and NULL delivery
 * status. Mirrors the shape of recordOutboundTwilioReply without claiming a
 * real provider send happened.
 */
async function recordSimulatedOutboundReply(input: {
  organizationId: string;
  conversationId: string;
  text: string;
  providerMessageId: string;
}): Promise<{ messageId: string }> {
  const supabase = createServiceRoleClient("whatsapp_pipeline_persistence_failed");
  const { data, error } = await supabase
    .from("messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      direction: "outbound",
      content: input.text,
      provider: metaWhatsAppProvider,
      provider_message_id: input.providerMessageId,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new DomainError(
      "whatsapp_pipeline_persistence_failed",
      "The simulated WhatsApp reply could not be recorded."
    );
  }
  return { messageId: data.id };
}

async function runMessageEvent(
  event: WhatsAppInboundMessageEvent
): Promise<MetaTestHarnessMessageResult> {
  const pipelineResult = await processInboundWhatsAppMessage(event);

  const base: Omit<MetaTestHarnessMessageResult, "ai" | "outbound" | "scheduling" | "receptionistContext"> =
    {
      inbound: {
        senderPhone: event.senderPhone,
        text: event.text,
        providerMessageId: event.providerMessageId,
      },
      processed: {
        organizationId: pipelineResult.organizationId,
        contactId: pipelineResult.contactId,
        conversationId: pipelineResult.conversationId,
        inboundMessageId: pipelineResult.messageId,
        duplicate: pipelineResult.duplicate,
      },
    };

  if (pipelineResult.duplicate) {
    // Mirrors the Twilio route: duplicate deliveries must never trigger a
    // second AI reply.
    return {
      ...base,
      ai: { replied: false, replyText: null, fallbackUsed: false, reason: "duplicate_delivery" },
      outbound: null,
      scheduling: { mutationExecutionSupported: false, upcomingAppointmentsForContact: 0 },
      receptionistContext: { hasInstructions: false, hasFaq: false },
    };
  }

  const captured: { text: string; providerMessageId: string; recordedMessageId: string | null }[] =
    [];
  const orchestrationResult = await runReceptionistOrchestration({
    organizationId: pipelineResult.organizationId,
    conversationId: pipelineResult.conversationId,
    sendReply: async (text) => {
      // TEST TRANSPORT: capture only. No Meta Graph API call is made.
      const providerMessageId = `${simulatedProviderMessageIdPrefix}${randomUUID()}`;
      captured.push({ text, providerMessageId, recordedMessageId: null });
      return { providerMessageId };
    },
    recordReply: async ({ text, providerMessageId }) => {
      const recorded = await recordSimulatedOutboundReply({
        organizationId: pipelineResult.organizationId,
        conversationId: pipelineResult.conversationId,
        text,
        providerMessageId,
      });
      const entry = captured.find((item) => item.providerMessageId === providerMessageId);
      if (entry) entry.recordedMessageId = recorded.messageId;
    },
  });

  const reply = captured[0] ?? null;
  const [receptionistContext, appointments] = await Promise.all([
    getReceptionistContextForOrganization(pipelineResult.organizationId),
    queryAppointmentsForOrganizationAndContact(pipelineResult.organizationId, pipelineResult.contactId, {
      statuses: ["pending", "confirmed"],
      pageSize: 20,
    }),
  ]);

  return {
    ...base,
    ai: {
      replied: orchestrationResult.replied,
      replyText: reply?.text ?? null,
      fallbackUsed: reply !== null && reply.text === safeFallbackReply,
      reason: orchestrationResult.replied ? null : orchestrationResult.reason,
    },
    outbound:
      reply && reply.recordedMessageId
        ? {
            simulatedProvider: simulatedMetaProvider,
            recipient: event.senderPhone,
            capturedText: reply.text,
            providerMessageId: reply.providerMessageId,
            recordedMessageId: reply.recordedMessageId,
          }
        : null,
    scheduling: {
      mutationExecutionSupported: false,
      upcomingAppointmentsForContact: appointments.length,
    },
    receptionistContext: {
      hasInstructions: Boolean(receptionistContext.instructions?.trim()),
      hasFaq: Boolean(receptionistContext.faq?.trim()),
    },
  };
}

/**
 * Runs a simulated Meta webhook delivery through the real inbound pipeline.
 * The payload must be a realistic Meta WhatsApp Cloud API webhook body built
 * from synthetic test values only.
 */
export async function runMetaWebhookSimulation(payload: unknown): Promise<MetaTestHarnessResult> {
  // Serialize once so signature, parsing and normalization all operate on the
  // exact bytes a real Meta POST would carry.
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  const parsed = parseWebhookJson(rawBody);

  const phoneNumberId = extractPhoneNumberId(parsed);
  if (!phoneNumberId) {
    throw new DomainError(
      "whatsapp_payload_invalid",
      "The simulated payload has no metadata.phone_number_id; the harness target config cannot be resolved."
    );
  }

  const config = await resolveWhatsAppConfigByPhoneNumberId(phoneNumberId, metaWhatsAppProvider);
  if (!config || !config.appSecret) {
    throw new DomainError(
      "whatsapp_configuration_unavailable",
      "No active meta_whatsapp_cloud configuration exists for the simulated phone_number_id. Seed a synthetic test configuration first."
    );
  }

  // Simulate Meta's signed delivery, then run the REAL signature verification.
  const signature = `sha256=${createHmac("sha256", config.appSecret).update(rawBody).digest("hex")}`;
  if (!verifyMetaWebhookSignature(rawBody, signature, config.appSecret)) {
    throw new DomainError(
      "whatsapp_payload_invalid",
      "The simulated webhook signature verification failed."
    );
  }

  const events = normalizeMetaWebhookEvents(parsed, config);
  const messageEvents = events.filter((event) => event.kind === "message");
  const statusEvents = events.filter((event) => event.kind === "status");

  const messages: MetaTestHarnessMessageResult[] = [];
  for (const event of messageEvents) {
    messages.push(await runMessageEvent(event));
  }

  let statusEventsApplied = 0;
  for (const event of statusEvents) {
    await applyWhatsAppStatusEvent(event);
    statusEventsApplied += 1;
  }

  return {
    simulatedProvider: simulatedMetaProvider,
    signatureVerified: true,
    events: {
      messageEvents: messageEvents.length,
      statusEvents: statusEvents.length,
      statusEventsApplied,
    },
    messages,
  };
}
