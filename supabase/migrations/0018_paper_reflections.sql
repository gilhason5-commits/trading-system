-- 0018 — end-of-day self-reflection for the autonomous paper trader. In the 23:00
-- digest run it reviews the day's trades + open positions (P&L) and writes concise,
-- honest lessons on where its analysis can improve. Shown under the trade log, and
-- read back at the next 14:30 prep run (injected into the thesis research) so the
-- book actually learns from its own decisions over time.
create table if not exists paper_reflections (
  id          text        primary key default gen_random_uuid()::text,
  date        date        not null unique,
  reflection  text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists paper_reflections_date_idx on paper_reflections (date desc);
