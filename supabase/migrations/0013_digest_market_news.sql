-- 0013 — store the digest's general capital-market headlines (Israel + US)
-- structured, so /digests can render them as a separate, full-width section
-- instead of burying them in the model-written HTML.
alter table daily_digests add column if not exists market_news jsonb;
