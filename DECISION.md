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
