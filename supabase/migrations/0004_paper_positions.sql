-- 0004 — paper (demo) portfolio: an isolated experimental book the user builds
-- from recommendations / free-hand picks, priced + analysed like the real
-- portfolio but never touching positions/transactions or any other page.
create table if not exists paper_positions (
  id            text        primary key default gen_random_uuid()::text,
  ticker        text        not null,
  market        text        not null check (market in ('US', 'TASE', 'crypto')),
  qty           numeric     not null,
  avg_cost      numeric     not null,
  currency      text        not null check (currency in ('USD', 'ILS')),
  sector        text,
  created_at    timestamptz not null default now()
);
