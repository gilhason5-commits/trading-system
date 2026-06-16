# Background worker (price refresh + daily pipeline)

`com.trading.worker.plist` is a macOS LaunchAgent that keeps `apps/worker`
running so it refreshes the `quote_cache` every 5 minutes and runs the daily
pipeline at the configured digest time. Pages read from the cache, so they load
instantly without hitting Twelve Data's 8-req/min throttle inline.

Install (copy already lives at `~/Library/LaunchAgents/`):

    cp ops/com.trading.worker.plist ~/Library/LaunchAgents/
    launchctl load -w ~/Library/LaunchAgents/com.trading.worker.plist

Status / logs:

    launchctl list | grep com.trading.worker
    tail -f worker.out.log worker.err.log

Stop / remove:

    launchctl unload -w ~/Library/LaunchAgents/com.trading.worker.plist

Paths in the plist are absolute (node at /opt/homebrew/bin/node, project under
~/Desktop/Trading System) — edit them if either moves. On deploy, run the same
worker on a free always-on host (Render/Railway) instead of this agent.
