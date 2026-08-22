import { NextResponse } from "next/server";

import { DomainError } from "@/lib/domain/errors";
import { runMetaWebhookSimulation } from "@/lib/whatsapp/test-harness";

export const dynamic = "force-dynamic";

/**
 * TEST-ONLY Meta webhook simulation harness.
 *
 * This endpoint lets developers drive the real inbound WhatsApp pipeline with
 * a simulated, realistically-shaped Meta Cloud API webhook payload — no live
 * Meta test phone number required. It never calls the Meta Graph API; the
 * final outbound delivery is captured by a test transport and reported as an
 * explicit simulated result.
 *
 * It is impossible to use as a production messaging endpoint:
 * - it returns 404 whenever NODE_ENV === "production", unconditionally; and
 * - it returns 404 unless WHATSAPP_TEST_HARNESS_ENABLED === "true"
 *   (a test-only environment flag that must never be set in production; the
 *   environment contract warns if any test-only variable is present there).
 *
 * Database isolation: the harness uses the REAL persistence pipeline, so it
 * can write synthetic rows. To guarantee those writes can never reach a
 * production (or any non-test) Supabase project, the route additionally
 * requires NEXT_PUBLIC_SUPABASE_URL to exactly equal SUPABASE_TEST_URL, which
 * the environment contract defines as a dedicated non-production test project
 * that must never be set in production. A local environment pointed at real
 * Supabase data therefore cannot enable the harness at all.
 *
 * The response contains only safe, synthetic test metadata — never access
 * tokens, app secrets, verify tokens, service-role keys or Vault contents.
 */
function harnessUnavailable(): Response {
  return new Response("Not found.", { status: 404 });
}

function harnessEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env["WHATSAPP_TEST_HARNESS_ENABLED"] !== "true") return false;
  const appSupabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim();
  const testSupabaseUrl = process.env["SUPABASE_TEST_URL"]?.trim();
  return Boolean(
    appSupabaseUrl && testSupabaseUrl && appSupabaseUrl === testSupabaseUrl
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!harnessEnabled()) return harnessUnavailable();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await runMetaWebhookSimulation(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DomainError) {
      // DomainError messages are fixed, developer-authored strings with no
      // secret material; they are safe to surface from this test-only route.
      const status =
        error.code === "whatsapp_payload_invalid" ||
        error.code === "whatsapp_pipeline_input_invalid"
          ? 400
          : error.code === "whatsapp_configuration_unavailable"
            ? 422
            : 500;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "The test harness simulation failed." }, { status: 500 });
  }
}
