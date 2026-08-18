import { NextResponse } from "next/server";

import {
  resolveWhatsAppConfigByPhoneNumberId,
  resolveWhatsAppConfigByVerifyToken,
} from "@/lib/whatsapp/configuration";
import {
  extractPhoneNumberId,
  normalizeMetaWebhookEvents,
  parseWebhookJson,
  verifyMetaWebhookSignature,
} from "@/lib/whatsapp/meta";
import { DomainError } from "@/lib/domain/errors";
import { processInboundWhatsAppMessage } from "@/lib/whatsapp/pipeline";
import { applyWhatsAppStatusEvent } from "@/lib/whatsapp/reliability";

const provider = "meta_whatsapp_cloud" as const;

function invalidRequest(): NextResponse<{ error: string }> {
  return NextResponse.json({ error: "Invalid WhatsApp webhook request." }, { status: 400 });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const suppliedToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !suppliedToken || !challenge) return invalidRequest();

  try {
    const config = await resolveWhatsAppConfigByVerifyToken(suppliedToken, provider);
    if (!config) {
      return new Response("Webhook verification failed.", { status: 403 });
    }
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof DomainError)
      return new Response("Webhook verification failed.", { status: 403 });
    return new Response("Webhook verification failed.", { status: 403 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
  } catch {
    return invalidRequest();
  }
  if (rawBody.length === 0) return invalidRequest();

  let payload: unknown;
  try {
    payload = parseWebhookJson(rawBody);
  } catch {
    return invalidRequest();
  }
  const phoneNumberId = extractPhoneNumberId(payload);
  if (!phoneNumberId) return invalidRequest();

  try {
    const config = await resolveWhatsAppConfigByPhoneNumberId(phoneNumberId, provider);
    if (
      !config ||
      !verifyMetaWebhookSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        config.appSecret
      )
    ) {
      return new Response("Webhook signature verification failed.", { status: 403 });
    }

    const events = normalizeMetaWebhookEvents(payload, config);
    for (const event of events) {
      if (event.kind === "message") await processInboundWhatsAppMessage(event);
      else await applyWhatsAppStatusEvent(event);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "whatsapp_payload_invalid" ||
        error.code === "whatsapp_pipeline_input_invalid")
    )
      return invalidRequest();
    if (error instanceof DomainError && error.code === "whatsapp_duplicate_provider_message") {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    if (
      error instanceof DomainError &&
      (error.code === "whatsapp_pipeline_persistence_failed" ||
        error.code === "whatsapp_status_persistence_failed")
    ) {
      return new Response("WhatsApp message processing failed.", { status: 500 });
    }
    return new Response("Webhook signature verification failed.", { status: 403 });
  }
}
