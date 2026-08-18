import { NextResponse } from "next/server";

import { runWhatsAppRetryWorker, verifyRetryWorkerAuthorization } from "@/lib/whatsapp/retry";

export const dynamic = "force-dynamic";

// The worker accepts no caller-supplied tenant, message, or provider input.
export async function POST(request: Request): Promise<Response> {
  if (!verifyRetryWorkerAuthorization(request.headers.get("authorization"))) {
    return new Response("Forbidden.", { status: 403 });
  }
  try {
    const result = await runWhatsAppRetryWorker();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return new Response("WhatsApp retry worker failed.", { status: 500 });
  }
}
