# Decision Log

Chronological log of decisions and notable work, oldest first. **Append only**: never delete or rewrite old entries.
Since 2026-10-11 this file replaces the "Log" section at the bottom of `AGENT.md` (that section keeps the history before
this date). Rules and project state stay in `AGENT.md`.

- **2026-10-11**: Logging moved from `AGENT.md` to this file (user's rule). `AGENT.md` rules, `CLAUDE.md` and
  `.vercelignore` updated (this file is not published on the website).
- **2026-10-11**: Dependabot PRs #1 (`actions/checkout` 5.1.0 -> 7.0.1) and #2 (`actions/setup-python` 6.3.0 -> 7.0.0)
  reviewed: each changes one pinned line of `update-prices.yml`; the pinned commits match the release tags
  (3d3c42e... = v7.0.1, 5fda3b9... = v7.0.0); neither release affects `ref: main` or `python-version: 3.12`. User asked to
  update them. Merge was refused by the permission system, so the user runs the two `gh pr merge` commands.
- **2026-10-11**: Final quality check before calling the project finished. All pass: JS and Python syntax, `vercel.json`, manifest and
  workflow YAML valid; data files fresh (15:19 Tbilisi, five companies, prices 1-10 GEL); i18n parity (ka/ru miss only the
  intentional English-fallback card and tier names); no inline scripts or handlers; no secrets in tracked files; browser smoke
  test on georgia-fuel-prices.vercel.app in real Chrome at 1440 and 390 px (28 checks: podium height constant across the 5
  fuels, card/self-service exclusivity, en/ka/ru switching, charts drawn, tabs, no console or network errors).
- **2026-10-11**: Merged Dependabot PRs #1 (`actions/checkout` 7.0.1) and #2 (`actions/setup-python` 7.0.0) at the user's request
  (squash, branches deleted). A manual run (38141024554) on the new versions succeeded: prices, history and push all green.
  Annotations were the known ones: Wissol's history API times out from GitHub's runners (fallback keeps its series), and the
  notice that `ubuntu-latest` becomes Ubuntu 26 on 2026-10-19 (consider pinning `ubuntu-24.04`). Project declared finished.
- **2026-10-12**: Workflow run #70 failed because rompetrol.ge answered the GitHub runner with HTTP 403 (bot filter). By design the
  script kept Rompetrol's last good prices, the other four were committed, and the final step marked the run failed. Next run (#71)
  was fine. Not changed: 403 is still raised at once; option offered to retry 403 like 5xx. README: "georgiafuel.ge" is now a link.
- **2026-10-12**: Run #73 (scheduled, 12:00 UTC) failed the same way as #70: rompetrol.ge answered the GitHub runner with HTTP 403
  (Cloudflare; fine from other networks, 200 from the dev PC), the other four sources were fine and committed, and the final step marked the
  run red. Two fixes in `scripts/update_prices.py`: (1) `fetch()` retries 403 and 429 like 5xx/timeouts and sends Accept /
  Accept-Language headers; (2) a failing source only fails the run when its kept prices are older than `STALE_HOURS` = 24, otherwise
  it is a `::warning::` (the limit is a full day because the overnight gap between slots is 14 h). Chose this over changing the data
  source: nothing else publishes Rompetrol prices and the 403 is on their side. Added `scripts/test_update_prices.py` (retry,
  stale and exit-code checks, all pass). Not fixable from our side: if Cloudflare keeps blocking the runner for 24 h the run does go red.
- **2026-10-12**: Failure-email strategy (planned in Opus plan mode, then implemented). Reviewed all 7 failed runs of 75: #1 Wissol history
  timeout (fallback added 4 Oct), #5/#9/#60 push rejected by a concurrent push to main (`ref: main` + `pull --rebase`), #43 wissol.ge
  HTTP 500 (retries), #70/#73 rompetrol.ge 403 from Cloudflare (403/429 retried + 24 h staleness rule, commit dabdf2c). Every one was an
  outside hiccup or a race that turned into a red run although the site kept working. New finding: the history step took ~306 s of ~350 s per
  run because Wissol's archive never answers from GitHub (3 x 90 s). Changes: Wissol history gets one 20 s try (run ~6 min -> ~1 min);
  request timeout 60 -> 30 s; `::error::` names the stale source and its age; workflow pinned to `ubuntu-24.04` (ubuntu-latest becomes
  Ubuntu 26 on 19 Oct), step timeouts 6/4 min, job 10 min, 3-try `pull --rebase` + `push` loop. Not done on purpose: external scheduler or
  VM (user keeps the current stack; note GitHub's cron fires only ~2 of 8 slots a day, so with the laptop off the manual "Run workflow"
  button is the fallback), parallel fetching, a second Rompetrol source (none exists), auto-accepting >25% jumps, a CI test workflow.
  Tests: `scripts/test_update_prices.py` extended (all pass), push loop simulated (fails twice then works / always fails), YAML parsed.
- **2026-10-12**: Verified the failure-email changes on GitHub (run 38250499264, ubuntu-24.04): green, job 69 s (was ~350 s), "Refresh 5-year
  history" 27 s (was 306 s), Wissol fallback warning still shown, all five companies' history complete up to today. Failed runs so far: 7 of 76,
  none since the fixes. To watch over the next 24 h: `gh run list --workflow update-prices.yml` should show no new failure.
- **2026-10-12**: Vercel emailed "Production deployment failed" for the bot commit 190a22b (12:41 UTC): GitHub answered Vercel's repo fetch with
  403 "secondary rate limit". Cause: a burst of 3 pushes in 3 minutes (my verification run #76, its price commit, two of my doc/code pushes)
  after 4 other deploys that hour. No impact: the next deployment (a075f6a, 12:42) was READY and contains the same data. Normal operation is
  ~4 commits/day spread out, so no change made; if it recurs, use Redeploy in the Vercel dashboard. Option not taken: skip the commit when only
  `checkedAt` changed (would make the "updated HH:MM" on the site look stale).
