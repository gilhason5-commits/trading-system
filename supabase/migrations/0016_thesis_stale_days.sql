-- 0016 — track consecutive trading days a building thesis went without improving,
-- so the engine can auto-release a stalled thesis (2 trading days, Fri→Mon
-- counting as consecutive) and move on instead of accumulating it forever.
alter table paper_theses
  add column if not exists stale_days integer not null default 0;
