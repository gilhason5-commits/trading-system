import { NextResponse } from "next/server";
import { getRepository } from "@trading/core";

// Dismiss a ticker the user doesn't want: removes its recommendation, lead and
// tracking. If it's recommended again later it re-enters fresh.
export async function DELETE(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "חסר טיקר" }, { status: 400 });
  await getRepository().dismissTicker(ticker.trim());
  return NextResponse.json({ ok: true });
}
