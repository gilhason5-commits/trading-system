-- 0014 — score observations: an immutable, point-in-time record of every ticker
-- the moment it's first recommended — the factor scores, the raw social evidence
-- behind the social score (which account said what), and the forward returns
-- (filled in as days pass). Unlike tracked_recommendations (mutated daily, dropped
-- after 7 days), these rows are append-only: the validation dataset we measure the
-- score against (IC, quantiles, per-source social IC). For a social-driven edge
-- that can't be cleanly backtested, this live capture IS the validation — every
-- day not logged is lost forever, so it accrues from the day it's wired.
create table if not exists score_observations (
  id                text        primary key default gen_random_uuid()::text,
  ticker            text        not null,
  market            text        not null default 'US',
  obs_date          date        not null,
  entry_price       numeric,
  entry_currency    text        check (entry_currency in ('USD', 'ILS')),
  technical_score   numeric,
  fundamental_score numeric,
  social_score      numeric,
  conviction        numeric,
  bull_count        integer     not null default 0,
  bear_count        integer     not null default 0,
  mention_count     integer     not null default 0,
  -- raw social evidence snapshot: [{platform, handle, claim, url, sentiment}]
  social_evidence   jsonb       not null default '[]'::jsonb,
  -- forward returns (%) vs entry_price, backfilled on later runs as each mark elapses
  ret_1d            numeric,
  ret_3d            numeric,
  ret_5d            numeric,
  ret_7d            numeric,
  created_at        timestamptz not null default now(),
  unique (ticker, obs_date)
);
create index if not exists score_observations_obs_date_idx on score_observations (obs_date);
