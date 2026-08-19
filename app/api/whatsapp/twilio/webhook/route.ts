import { NextResponse } from "next/server";

import {
  resolveWhatsAppConfigByPhoneNumberId,
  twilioWhatsAppSandboxProvider,
} from "@/lib/whatsapp/configuration";
import {
  extractTwilioDestination,
  normalizeTwilioInboundMessage,
  parseTwilioFormBody,
  resolveExternalWebhookUrl,
  verifyTwilioSignature,
} from "@/lib/whatsapp/twilio";
import { DomainError } from "@/lib/domain/errors";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import { runReceptionistOrchestration } from "@/lib/whatsapp/receptionist-orchestration";
import { sendTwilioSandboxText } from "@/lib/whatsapp/twilio-outbound";
import { recordOutboundTwilioReply } from "@/lib/domain/messages/service-repository";

const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function twimlResponse(): Response {
  return new Response(twiml, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });
}

function invalidRequest(): NextResponse<{ error: string }> {
  return NextResponse.json({ error: "Invalid Twilio WhatsApp webhook request." }, { status: 400 });
}

// A single generic message is used for both an unrecognized destination and an
// invalid signature so a caller cannot use the response to probe which
// sandbox destination numbers are configured.
function rejected(): Response {
  return new Response("Webhook signature verification failed.", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return invalidRequest();
  }
  if (!rawBody) return invalidRequest();

  const params = parseTwilioFormBody(rawBody);
  const destination = extractTwilioDestination(params);
  if (!destination) return invalidRequest();

  const config = await resolveWhatsAppConfigByPhoneNumberId(destination, twilioWhatsAppSandboxProvider);
  const signatureHeader = request.headers.get("x-twilio-signature");
  const webhookUrl = resolveExternalWebhookUrl(request);
  if (!config || !verifyTwilioSignature(webhookUrl, params, signatureHeader, config.accessToken)) {
    return rejected();
  }

  let event: ReturnType<typeof normalizeTwilioInboundMessage>;
  try {
    event = normalizeTwilioInboundMessage(params, {
      configId: config.configId,
      organizationId: config.organizationId,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
    });
  } catch {
    return invalidRequest();
  }

  let pipelineResult: Awaited<ReturnType<typeof processInboundWhatsAppMessage>>;
  try {
    pipelineResult = await processInboundWhatsAppMessage(event);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "whatsapp_payload_invalid" || error.code === "whatsapp_pipeline_input_invalid")
    ) {
      return invalidRequest();
    }
    if (error instanceof DomainError && error.code === "whatsapp_duplicate_provider_message") {
      return twimlResponse();
    }
    return new Response("WhatsApp message processing failed.", { status: 500 });
  }

  // Duplicate deliveries (Twilio retries) must never trigger a second AI
  // reply; the pipeline's provider-message-id idempotency already guarantees
  // this, and orchestration is only ever invoked for a freshly persisted
  // message.
  if (!pipelineResult.duplicate) {
    try {
      await runReceptionistOrchestration({
        organizationId: config.organizationId,
        conversationId: pipelineResult.conversationId,
        sendReply: async (text) => {
          const sent = await sendTwilioSandboxText({
            organizationId: config.organizationId,
            to: event.senderPhone,
            text,
          });
          return { providerMessageId: sent.providerMessageId };
        },
        recordReply: async ({ text, providerMessageId }) => {
          await recordOutboundTwilioReply({
            organizationId: config.organizationId,
            conversationId: pipelineResult.conversationId,
            text,
            providerMessageId,
          });
        },
      });
    } catch {
      // The inbound message is already durably persisted; a reply failure is
      // logged upstream by each adapter and must not surface as a webhook
      // failure or trigger a Twilio retry.
    }
  }

  return twimlResponse();
}
