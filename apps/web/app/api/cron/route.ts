import { NextResponse } from "next/server";
import { pollPrices } from "@trading/core";

// Vercel Cron trigger (spec §2). Cron should only kick off lightweight work — the
// heavy daily pipeline runs in the dedicated Worker. Here we refresh prices and
// snapshot the portfolio, which fits comfortably in a serverless function budget.
// Production: gate with a CRON_SECRET and have this enqueue a job the Worker drains.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await pollPrices();
    return NextResponse.json({ ok: true, polled_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
