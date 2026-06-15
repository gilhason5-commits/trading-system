# Trading System (MVP, read-only)

Personal trading & research system built from the v2.0 spec (`~/Downloads/MVP-trading-system.m`).
Read-only: it never executes trades. Base currency USD, every value also shown in ILS.

## What it does
1. Tracks a manually-entered portfolio (value, P&L, stats).
2. Daily technical + fundamental analysis per held position → stance (hold/add/trim).
3. Scrapes user-defined social + news sources → signals + new leads → research.
4. Emails a daily Hebrew digest (insights, portfolio update, recommendations, run cost).

## Stack
Next.js (App Router) + TypeScript · Supabase (Postgres) · Vercel · dedicated Worker ·
Claude API · MCP. npm workspaces monorepo.

## Layout
```
packages/core      @trading/core — shared: env, types, money, datasources, claude, db, pipeline
apps/web           Next.js — UI + API route handlers
apps/worker        Node service — price polling + daily pipeline runner
apps/mcp           MCP server — scraping tools
supabase/migrations  SQL schema (14 tables)
```

## Mock-first
Everything runs with **no keys and no database**. `DATA_MODE=mock` (default) makes every
datasource / Claude / DB return deterministic seed data. Set `DATA_MODE=live` and add keys
to go live per-source as each key arrives.

## Develop
```bash
npm install
cp .env.example .env.local   # leave blank to stay in mock mode
npm run dev                  # http://localhost:3000
```
