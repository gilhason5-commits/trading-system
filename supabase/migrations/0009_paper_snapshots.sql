-- 0009 — paper-portfolio value snapshots. Same shape as portfolio_snapshots but
-- for the isolated paper book, so /paper can chart its development over time.
-- Written once a day by pollPrices when the paper book is non-empty.
create table if not exists paper_snapshots (
  id                text        primary key default gen_random_uuid()::text,
  date              date        not null,
  total_value_usd   numeric     not null,
  total_value_ils   numeric     not null,
  total_pl_usd      numeric     not null
);
