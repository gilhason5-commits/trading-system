-- 0005 — quote cache: latest price per ticker, refreshed in the background by
-- pollPrices (worker loop / cron) every few minutes. Pages read from here so they
-- load instantly and never hit Twelve Data's 8-req/min free-tier throttle inline.
create table if not exists quote_cache (
  ticker         text        primary key,
  market         text        not null check (market in ('US', 'TASE', 'crypto')),
  price          numeric     not null,
  percent_change numeric     not null default 0,
  currency       text        not null check (currency in ('USD', 'ILS')),
  previous_close numeric     not null default 0,
  updated_at     timestamptz not null default now()
);
