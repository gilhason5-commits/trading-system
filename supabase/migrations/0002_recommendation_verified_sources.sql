-- 0002 — add verified_sources audit trail to recommendations.
-- Records which objective data sources actually returned data during lead research
-- (e.g. Twelve Data technicals, Finnhub news), for the lead "reasoning trail" UI.
alter table recommendations
  add column if not exists verified_sources text[] not null default '{}';
