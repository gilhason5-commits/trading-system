-- 0007 — daily conviction breakdown on tracked recommendations: technical,
-- fundamental and social sub-scores (0–100, 50 = neutral) plus the blended
-- buy-conviction, recomputed each run so a name strengthens toward >80 buy or
-- <20 (i.e. >80 sell) only when all three dimensions agree.
alter table tracked_recommendations
  add column if not exists technical_score   numeric,
  add column if not exists fundamental_score numeric,
  add column if not exists social_score      numeric,
  add column if not exists conviction        numeric;
