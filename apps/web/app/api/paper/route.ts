import { NextResponse } from "next/server";
import { getMarketData, getRepository, type Currency, type Market } from "@trading/core";

// Paper (demo) portfolio mutations. Adds buy at the *current* price (fetched
// live at add time), so the user just supplies ticker + quantity. Fully isolated
// — touches only paper_positions, never real positions/transactions.

const MARKETS: Market[] = ["US", "TASE", "crypto"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  const market = (MARKETS.includes(body.market) ? body.market : "US") as Market;
  const qty = Number(body.qty);

  if (!ticker) return NextResponse.json({ error: "חסר טיקר" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "כמות לא תקינה" }, { status: 400 });
  }

  // Price at current market value — the whole point of the demo book.
  let price: number;
  try {
    const quote = await getMarketData().getQuote(ticker, market);
    price = quote.price;
    if (!Number.isFinite(price) || price <= 0) throw new Error("no price");
  } catch {
    return NextResponse.json(
      { error: `לא הצלחתי למשוך מחיר נוכחי ל-${ticker}. בדוק את הטיקר/השוק.` },
      { status: 502 },
    );
  }

  const currency: Currency = market === "TASE" ? "ILS" : "USD";
  const position = await getRepository().addPaperPosition({
    ticker,
    market,
    qty,
    avg_cost: price,
    currency,
  });
  return NextResponse.json({ position }, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
  await getRepository().deletePaperPosition(id);
  return NextResponse.json({ ok: true });
}
