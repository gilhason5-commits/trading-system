# Reliable scheduling via cron-job.org → GitHub workflow_dispatch

GitHub's own `schedule:` cron is best-effort and frequently drops runs (especially
weekends). Instead, an external scheduler (cron-job.org, free) fires at an **exact**
time and triggers the existing `automations.yml` workflow over the GitHub REST API.
Same jobs, same secrets — only the trigger changes.

The GitHub `schedule:` blocks in `automations.yml` can stay as a harmless fallback;
the once-a-day DB guards dedupe if both fire.

## Step 1 — Create a GitHub token (one-time)

Fine-grained PAT (recommended):
- https://github.com/settings/personal-access-tokens/new
- **Repository access** → Only select repositories → `trading-system`
- **Permissions** → Repository permissions → **Actions: Read and write**
  (Metadata: Read-only is added automatically)
- Generate, copy the token (starts with `github_pat_…`). You won't see it again.

(Classic token alternative: scopes `repo` + `workflow`.)

## Step 2 — Create 3 jobs on cron-job.org

Account: https://cron-job.org (free). For **every** job below use the same request:

- **URL:** `https://api.github.com/repos/gilhason5-commits/trading-system/actions/workflows/automations.yml/dispatches`
- **Method:** POST  (Advanced → Request method)
- **Headers:**
  ```
  Accept: application/vnd.github+json
  Authorization: Bearer <YOUR_PAT>
  X-GitHub-Api-Version: 2022-11-28
  Content-Type: application/json
  ```
- **Timezone:** Asia/Jerusalem  (cron-job.org handles DST automatically)
- A successful trigger returns HTTP **204** (cron-job.org shows it as success).

### Job A — scrape
- Schedule: every day, **14:30**
- Body: `{"ref":"main","inputs":{"job":"scrape"}}`

### Job B — digest
- Schedule: every day, **23:00**
- Body: `{"ref":"main","inputs":{"job":"digest"}}`

### Job C — poll (price refresh, US market hours)
- Schedule: **every 30 min**, Mon–Fri, **16:00–23:00**
- Body: `{"ref":"main","inputs":{"job":"poll"}}`

## Step 3 — Verify

After creating, hit "Run now" on the scrape job in cron-job.org (or wait for 14:30),
then check the run appears:

    gh run list --workflow=automations.yml --limit 5

A 204 response + a new run in the list = working.

## Notes
- Token rotation: if the PAT expires, the jobs will start returning 401 — just
  generate a new token and update the Authorization header in all 3 jobs.
- The local Mac LaunchAgent (`com.trading.worker.plist`) is now redundant and can
  stay unloaded.
