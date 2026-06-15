import { NextResponse } from "next/server";
import {
  derivePositions,
  getRepository,
  type Market,
  type Side,
  type Currency,
  type Transaction,
} from "@trading/core";

// Manual transaction entry (spec §5). Each mutation re-derives positions from the
// full transaction log (avg cost) and upserts them, preserving known sectors.

async function recomputePositions() {
  const repo = getRepository();
  const [txs, existing] = await Promise.all([repo.listTransactions(), repo.listPositions()]);
  const sectorByTicker = new Map(existing.map((p) => [p.ticker, p.sector]));
  const derived = derivePositions(txs).map((p) => ({ ...p, sector: p.sector ?? sectorByTicker.get(p.ticker) }));
  await repo.upsertPositions(derived);
  return derived;
}

export async function GET() {
  const repo = getRepository();
  return NextResponse.json({ transactions: await repo.listTransactions() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Transaction>;
  const required = ["ticker", "market", "side", "qty", "price", "currency", "date"] as const;
  for (const f of required) {
    if (body[f] === undefined || body[f] === "") {
      return NextResponse.json({ error: `שדה חסר: ${f}` }, { status: 400 });
    }
  }

  const repo = getRepository();
  const tx = await repo.addTransaction({
    ticker: String(body.ticker).toUpperCase(),
    market: body.market as Market,
    side: body.side as Side,
    qty: Number(body.qty),
    price: Number(body.price),
    currency: body.currency as Currency,
    date: String(body.date),
    note: body.note ? String(body.note) : undefined,
  });
  const positions = await recomputePositions();
  return NextResponse.json({ transaction: tx, positions }, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
  await getRepository().deleteTransaction(id);
  const positions = await recomputePositions();
  return NextResponse.json({ ok: true, positions });
}
