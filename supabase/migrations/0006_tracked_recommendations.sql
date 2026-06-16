-- 0006 — recommendation tracking: once a ticker is recommended it's followed for
-- 7 days (price since entry, sentiment trend). If it reappears in the daily
-- recommendations it's reinforced and we record whether sentiment strengthened
-- or weakened. One row per ticker.
create table if not exists tracked_recommendations (
  id                   text        primary key default gen_random_uuid()::text,
  ticker               text        not null unique,
  first_date           date        not null,
  last_seen_date       date        not null,
  entry_price          numeric,
  entry_currency       text        check (entry_currency in ('USD', 'ILS')),
  initial_social_score numeric     not null,
  last_social_score    numeric     not null,
  reinforce_count      integer     not null default 0,
  sentiment_trend      text        not null default 'new'
                        check (sentiment_trend in ('new', 'strengthened', 'weakened', 'stable')),
  expires_date         date        not null,
  created_at           timestamptz not null default now()
);
