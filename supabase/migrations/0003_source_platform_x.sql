-- 0003 — allow the "x" (Twitter) platform on sources.
alter table sources drop constraint if exists sources_platform_check;
alter table sources
  add constraint sources_platform_check
  check (platform in ('youtube', 'tiktok', 'instagram', 'rss', 'x'));
