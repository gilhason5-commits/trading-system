import { NextResponse } from "next/server";
import { getRepository, type Settings } from "@trading/core";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<Settings> = {};

  if (body.digest_time !== undefined && body.digest_time !== "") {
    patch.digest_time = String(body.digest_time);
  }
  if (body.concentration_threshold !== undefined && body.concentration_threshold !== "") {
    const val = Number(body.concentration_threshold);
    if (isNaN(val) || val < 0 || val > 1) {
      return NextResponse.json(
        { error: "סף ריכוזיות חייב להיות מספר בין 0 ל-1" },
        { status: 400 },
      );
    }
    patch.concentration_threshold = val;
  }
  if (body.digest_email !== undefined && body.digest_email !== "") {
    patch.digest_email = String(body.digest_email);
  }

  const repo = getRepository();
  const updated = await repo.updateSettings(patch);
  return NextResponse.json({ settings: updated });
}
