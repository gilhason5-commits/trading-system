-- 0015 — store a human-readable technical-analysis summary on each tracked name.
-- The tracking stage already fetches the indicators (RSI/MACD/SMA50/SMA200/trend)
-- to compute technical_score, so it builds a readable Hebrew summary at the same
-- time (no extra Twelve Data calls). The thesis flow chart then shows it as a
-- "ניתוח טכני" step that validates (or weakens) the thesis.
alter table tracked_recommendations
  add column if not exists technical_summary text;
