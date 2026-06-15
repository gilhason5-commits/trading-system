-- =============================================================================
-- 0001_init.sql — Initial schema for the Trading System
--
-- Target: Supabase Postgres (PostgreSQL 15+)
-- RLS is intentionally left OFF — all access is via service-role key
-- from the worker/server processes only.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- transactions
-- Manually-entered trades; source of truth for holdings (spec §5).
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id            text primary key default gen_random_uuid()::text,
  ticker        text        not null,
  market        text        not null check (market in ('US', 'TASE', 'crypto')),
  side          text        not null check (side in ('buy', 'sell')),
  qty           numeric     not null,
  price         numeric     not null,
  currency      text        not null check (currency in ('USD', 'ILS')),
  date          date        not null,
  note          text,
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- positions
-- Derived holdings computed from transactions (avg cost basis).
-- Surrogate id + unique(ticker) since a ticker appears once per holding.
-- ---------------------------------------------------------------------------
create table if not exists positions (
  id            text        primary key default gen_random_uuid()::text,
  ticker        text        not null,
  market        text        not null check (market in ('US', 'TASE', 'crypto')),
  qty           numeric     not null,
  avg_cost      numeric     not null,
  currency      text        not null check (currency in ('USD', 'ILS')),
  sector        text,
  unique (ticker)
);


-- ---------------------------------------------------------------------------
-- fx_rates
-- Latest USD/ILS exchange rate snapshot.
-- ---------------------------------------------------------------------------
create table if not exists fx_rates (
  pair          text        not null check (pair in ('USD/ILS')),
  rate          numeric     not null,
  as_of         timestamptz not null
);


-- ---------------------------------------------------------------------------
-- portfolio_snapshots
-- End-of-day portfolio value snapshots.
-- ---------------------------------------------------------------------------
create table if not exists portfolio_snapshots (
  id                text        primary key default gen_random_uuid()::text,
  date              date        not null,
  total_value_usd   numeric     not null,
  total_value_ils   numeric     not null,
  total_pl_usd      numeric     not null
);


-- ---------------------------------------------------------------------------
-- analyses
-- Claude's daily per-position analysis (spec §6).
-- ---------------------------------------------------------------------------
create table if not exists analyses (
  id                    text        primary key default gen_random_uuid()::text,
  ticker                text        not null,
  date                  date        not null,
  stance                text        not null check (stance in ('hold', 'add', 'trim')),
  technical_summary     text        not null,
  fundamental_summary   text        not null,
  key_events            text[]      not null default '{}',
  risk_flags            text[]      not null default '{}',
  confidence            numeric     not null,
  created_at            timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- sources
-- Social / RSS sources to scrape.
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id          text        primary key default gen_random_uuid()::text,
  platform    text        not null check (platform in ('youtube', 'tiktok', 'instagram', 'rss')),
  handle      text        not null,
  active      boolean     not null default false,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- posts
-- Scraped content items from sources.
-- Dedup via unique(source_id, external_id).
-- ---------------------------------------------------------------------------
create table if not exists posts (
  id            text        primary key default gen_random_uuid()::text,
  source_id     text        not null references sources (id),
  external_id   text        not null,
  url           text        not null,
  title         text,
  text          text,
  transcript    text,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null,
  unique (source_id, external_id)
);


-- ---------------------------------------------------------------------------
-- signals
-- Ticker-level signals extracted from posts.
-- ---------------------------------------------------------------------------
create table if not exists signals (
  id          text        primary key default gen_random_uuid()::text,
  post_id     text        not null references posts (id),
  ticker      text        not null,
  sentiment   text        not null check (sentiment in ('bullish', 'bearish', 'neutral')),
  claim       text        not null,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- leads
-- Tickers being tracked as potential new positions.
-- unique(ticker) — one lead per ticker.
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id            text        primary key default gen_random_uuid()::text,
  ticker        text        not null,
  market        text        not null check (market in ('US', 'TASE', 'crypto')),
  status        text        not null check (status in ('new', 'researching', 'recommended', 'dismissed')),
  mention_count integer     not null default 0,
  first_seen    timestamptz not null,
  updated_at    timestamptz not null,
  unique (ticker)
);


-- ---------------------------------------------------------------------------
-- recommendations
-- Scored buy recommendations produced from leads (spec §8).
-- ---------------------------------------------------------------------------
create table if not exists recommendations (
  id                text        primary key default gen_random_uuid()::text,
  lead_id           text        not null references leads (id),
  ticker            text        not null,
  date              date        not null,
  system_score      numeric     not null,
  social_score      numeric     not null,
  rationale         text        not null,
  manipulation_flag boolean     not null default false,
  created_at        timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- daily_digests
-- HTML digest emails generated each evening.
-- ---------------------------------------------------------------------------
create table if not exists daily_digests (
  id            text        primary key default gen_random_uuid()::text,
  date          date        not null,
  html          text        not null,
  key_insights  text[]      not null default '{}',
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- runs
-- Cost log for daily pipeline runs (spec §5).
-- ---------------------------------------------------------------------------
create table if not exists runs (
  id              text        primary key default gen_random_uuid()::text,
  date            date        not null,
  tokens_in       integer     not null,
  tokens_out      integer     not null,
  claude_cost     numeric     not null,
  scraping_cost   numeric     not null,
  total_cost      numeric     not null,
  started_at      timestamptz not null,
  finished_at     timestamptz,
  status          text        not null default 'running' check (status in ('running', 'ok', 'error'))
);


-- ---------------------------------------------------------------------------
-- alerts
-- System alerts shown in the dashboard.
-- ---------------------------------------------------------------------------
create table if not exists alerts (
  id          text        primary key default gen_random_uuid()::text,
  kind        text        not null check (kind in ('concentration', 'manipulation', 'error', 'earnings')),
  ticker      text,
  message     text        not null,
  created_at  timestamptz not null default now(),
  read        boolean     not null default false
);


-- ---------------------------------------------------------------------------
-- settings
-- Single-row application settings.
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id                        text        primary key default gen_random_uuid()::text,
  digest_time               text        not null,
  concentration_threshold   numeric     not null,
  digest_email              text        not null
);


-- =============================================================================
-- Indexes
-- =============================================================================

create index if not exists analyses_ticker_date      on analyses        (ticker, date);
create index if not exists signals_ticker            on signals         (ticker);
create index if not exists recommendations_date      on recommendations (date);
create index if not exists runs_date                 on runs            (date);
create index if not exists alerts_read               on alerts          (read);


-- =============================================================================
-- Seed — default settings row (matches packages/core/src/db/seed.ts)
-- =============================================================================

insert into settings (id, digest_time, concentration_threshold, digest_email)
values ('settings_1', '23:30', 0.25, 'gilh207@gmail.com')
on conflict do nothing;
