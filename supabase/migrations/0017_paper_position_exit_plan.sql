-- 0017 — per-position exit plan. Stop-loss / take-profit are now derived per name
-- from the chart (ATR volatility) + fundamentals (reward:risk) + the analyst
-- targets, instead of flat ±% rules. Store the levels on the position so the exit
-- check enforces each position's own plan. NULL = legacy positions (global rules).
alter table paper_positions
  add column if not exists stop_price   numeric,
  add column if not exists target_price numeric;
