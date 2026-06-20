-- 0011 — paper-trader theses. Before acting, the autonomous book builds a thesis
-- over (possibly several) days: a `long` thesis accumulates confirmations toward a
-- buy, an `exit` thesis accumulates warning signs toward a sell. `steps` is the
-- full research/decision audit trail, rendered as a flow chart on /paper.
create table if not exists paper_theses (
  id          text        primary key default gen_random_uuid()::text,
  ticker      text        not null,
  direction   text        not null check (direction in ('long', 'exit')),
  status      text        not null default 'building' check (status in ('building', 'acted', 'dropped')),
  strength    numeric     not null default 0,
  days        integer     not null default 1,
  first_date  date        not null,
  steps       jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists paper_theses_ticker_idx on paper_theses (ticker);
