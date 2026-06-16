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

  const repo = getRepository();
  const currency: Currency = market === "TASE" ? "ILS" : "USD";

  // Price at current market value — the whole point of the demo book. Use the
  // background cache when it's fresh (instant); otherwise fetch live once and
  // warm the cache so the page shows it immediately.
  let price: number | undefined;
  const cached = (await repo.listCachedQuotes()).find((c) => c.ticker === ticker);
  if (cached && Date.now() - Date.parse(cached.updated_at) < 10 * 60_000) {
    price = cached.price;
  } else {
    try {
      const quote = await getMarketData().getQuote(ticker, market);
      if (Number.isFinite(quote.price) && quote.price > 0) {
        price = quote.price;
        await repo.upsertCachedQuotes([
          {
            ticker,
            market,
            price: quote.price,
            percent_change: quote.percent_change,
            currency: quote.currency,
            previous_close: quote.previous_close,
          },
        ]);
      }
    } catch {
      /* fall through to the error below */
    }
  }
  if (price === undefined) {
    return NextResponse.json(
      { error: `לא הצלחתי למשוך מחיר נוכחי ל-${ticker}. בדוק את הטיקר/השוק.` },
      { status: 502 },
    );
  }

  const position = await repo.addPaperPosition({ ticker, market, qty, avg_cost: price, currency });
  return NextResponse.json({ position }, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
  await getRepository().deletePaperPosition(id);
  return NextResponse.json({ ok: true });
}
