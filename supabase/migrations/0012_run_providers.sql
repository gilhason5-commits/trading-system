-- 0012 — record which LLM provider(s) served each run ("Claude", "Grok", or
-- "Claude+Grok") so the run-history breakdown can show Claude vs Grok usage.
alter table runs add column if not exists providers text;
