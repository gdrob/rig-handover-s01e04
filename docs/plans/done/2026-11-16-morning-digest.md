---
plan: morning-digest
status: cleanup-pending
owner: rook
opened: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.


## Issues and worker evidence

The implementation and review submission are complete. This branch is a draft archive only:
cleanup is pending review, separate human approval, replacement at the same public URL, and
verification that the live link shows `no marker set`. Issue #8 remains open until then.
Do not merge this archive or mark this plan done before that verification.

| # | Issue | Blocked by | Worker | Commit | State |
|---|-------|------------|--------|--------|-------|
| [1](https://github.com/gdrob/rig-handover-s01e04/issues/1) | Define digest contract | — | Codex · inherited parent model · inherited | 86e39c3 | closed |
| [2](https://github.com/gdrob/rig-handover-s01e04/issues/2) | Read nightly logs | #1 | Codex · gpt-6-astra · high | 412de39 | closed |
| [3](https://github.com/gdrob/rig-handover-s01e04/issues/3) | Render digest page | #1 | Codex · gpt-6-luna · medium | 9a9c376 | closed |
| [4](https://github.com/gdrob/rig-handover-s01e04/issues/4) | Add digest JSON endpoint | #1 | Codex · gpt-6-luna · medium | 858a749 | closed |
| [5](https://github.com/gdrob/rig-handover-s01e04/issues/5) | Link nights from board | #1; completion needs #2, #3 | Codex · gpt-6-luna · medium | 0d1baf2 | closed |
| [6](https://github.com/gdrob/rig-handover-s01e04/issues/6) | Test digest routes | #1; completion needs #2–#4 | Codex · gpt-6-luna · medium | 269c3db | closed |
| [7](https://github.com/gdrob/rig-handover-s01e04/issues/7) | Publish review preview | #2–#6; publication approval | Codex · inherited parent model · inherited | 23d14ca | closed |
| [8](https://github.com/gdrob/rig-handover-s01e04/issues/8) | Remove marker and archive plan | #7; review; separate replacement approval | Codex · inherited parent model · inherited | pending live replacement | open |

Validation before review: 20 tests and type checking passed; both fixture nights render and
HTML/JSON job order agrees. The published preview matches the command export. Preview HTML,
marker values, and environment files are not in this repository.
