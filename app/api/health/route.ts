import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Application liveness only. It performs no database or provider call, so it
// cannot leak dependency detail or be used to probe configuration.
export async function GET(): Promise<Response> {
  return NextResponse.json(
    { status: "ok", version: process.env["NEXT_PUBLIC_APP_VERSION"] ?? "unknown" },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
