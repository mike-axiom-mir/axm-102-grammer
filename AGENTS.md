# AXM 102 Grammar Agent Rules

## Pull request continuity

**One AI instance = one pull request.**

- Do not create a new PR for every task, edit, fix, or commit.
- When an AI instance already has an open PR, keep using that same branch and PR for all related work from that instance until the PR is merged or closed.
- Add new work as additional commits to the existing instance PR.
- Keep the work modular inside the PR so individual changes remain easy to inspect, review, and merge.
- Start a new PR only for a genuinely separate AI instance/workstream, or after the previous instance PR has been merged or closed.
- Before creating a PR, check whether the current AI instance already has one open.

Reason: fewer parallel PRs makes the repository much easier to watch, compare, merge, and recover without losing the active direction.
