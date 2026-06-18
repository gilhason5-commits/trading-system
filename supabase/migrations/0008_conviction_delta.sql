-- 0008 — store the day-over-day change in conviction so the tracking table can
-- show how many points a fresh mention (or shifting technicals) added/removed.
alter table tracked_recommendations
  add column if not exists conviction_delta numeric;
