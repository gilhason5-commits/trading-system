-- 0010 — autonomous paper-trading book: a cash account + a trade log. The engine
-- buys/sells paper_positions against paper_account.cash and records every action
-- (with its reason + conviction) in paper_trades for the /paper decision log.

create table if not exists paper_account (
  id             text        primary key default gen_random_uuid()::text,
  starting_cash  numeric     not null,
  cash           numeric     not null,
  currency       text        not null default 'USD' check (currency = 'USD'),
  updated_at     timestamptz not null default now()
);

create table if not exists paper_trades (
  id          text        primary key default gen_random_uuid()::text,
  date        date        not null,
  ticker      text        not null,
  action      text        not null check (action in ('buy', 'sell')),
  qty         numeric     not null,
  price       numeric     not null,
  currency    text        not null check (currency in ('USD', 'ILS')),
  value_usd   numeric     not null,
  conviction  numeric,
  reason      text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists paper_trades_date_idx on paper_trades (date desc);
