import { NextResponse } from "next/server";
import { getRepository, type Platform } from "@trading/core";

const VALID_PLATFORMS: Platform[] = ["youtube", "tiktok", "instagram", "rss", "x"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { platform, handle } = body as { platform?: string; handle?: string };

  if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      { error: `פלטפורמה לא תקינה. ערכים מותרים: ${VALID_PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!handle || String(handle).trim() === "") {
    return NextResponse.json({ error: "שדה ידית חסר" }, { status: 400 });
  }

  const repo = getRepository();
  const source = await repo.addSource({
    platform: platform as Platform,
    handle: String(handle).trim(),
    active: true,
  });
  return NextResponse.json({ source }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { id, active } = body as { id?: string; active?: boolean };

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "שדה id חסר" }, { status: 400 });
  }
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "שדה active חייב להיות boolean" }, { status: 400 });
  }

  const repo = getRepository();
  await repo.setSourceActive(id, active);
  return NextResponse.json({ ok: true });
}
