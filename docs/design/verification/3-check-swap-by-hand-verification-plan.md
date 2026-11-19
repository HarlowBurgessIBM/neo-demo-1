# Feature #3 Check a proposed swap by hand — Verification Plan

## Scope and status

- **Every case starts `Not Run`.** Status: **check set approved by the BE; run 2 at the re-pinned SHA.** Run 1 (stale) is summarised in the tester record.
- **Source:** `b60a56dd76661f80bedbb62f589a5e6ff441b838` on `feature/3-check-swap-by-hand` (re-pinned for run 2). The tree is clean and HEAD equals `origin/feature/3-check-swap-by-hand`. The only local change is this untracked plan file.
- **The earlier pin is stale.** Run 1 ran at `a137e48e113893fe367aac604f9197a8b3bb2d4b`. `b60a56d` changes only `AGENTS.md` (the status line and the dev-users roster note). Run 1's results are stale; they are kept only as history in the tester record, and every block is re-run at the new pin.
- **Merged task pull requests.** Each head is an ancestor of the pinned SHA; block 0 re-checks this.

  | Pull request | Head |
  | --- | --- |
  | #9 | `1aeab0f` |
  | #10 | `bf41b1c` |
  | #11 | `6eda751` |
  | #12 | `8f33e32` |
  | #13 | `93005ab` |
  | #14 | `2829bd1` |

- **Spec revision:**
  - `docs/design/requirements/shift-swap-pilot/feature-1-check-swap-by-hand.md` at the pinned SHA, signed 2026-11-16. The body of #3 does not differ from it in substance.
  - The task issues #4, #5, #6, #7 and #8, with their bodies as read on the pin date.
  - The `## NFR coverage matrix` comment on #3.
- **Covers:**
  - Feature verification steps 1–8.
  - Additional checks ADD-1, ADD-2, ADD-3, ADD-5 and ADD-6.
  - The "Left to task" items LT-1 to LT-4.
  - Every validation criterion of #4 to #8.
  - The in-stage NFRs.
- **Does not cover:**
  - Anything that needs staging or production.
  - The previous major Edge release.
  - Colour contrast in automated tests: jsdom does not evaluate it.
  - Rule interpretation beyond the spec's own figures.
- **NFRs:**

  | NFR | Stage · layer | Disposition | Owner | Treatment in this plan |
  | --- | --- | --- | --- | --- |
  | PRIV-001 | task · integration | in stage | Marcus Ellery | N-PRIV |
  | A11Y-001 | task · static-analysis | in stage | Marcus Ellery | N-A11Y. Contrast is excluded; see Limitations. |
  | PERF-001 | feature-verification · load/performance | in stage | Marcus Ellery | N-PERF, **Blocked**: there is no staging environment (engineering standard § 9). |
  | COMPAT-001 | feature-verification · live-procedure | in stage | Marcus Ellery | N-COMPAT1 (current Edge, run by the BE). The previous major release is **Blocked**. |
  | REL-001 | operations · live-procedure | **deferred** | — | No case. |
  | COMP-001 | — | **n/a** | Simone Arceneaux | Guard cases only: N-COMP. |
  | COMPAT-002 | — | **waived** | — | Feature doc Constraints, lines 128–134. Signed by Harlow Burgess and Marcus Ellery. Revisit before any use outside the control rooms, or at the end-of-pilot decision; neither has been reached. |

- **BE decisions, made before execution.** The affected cases are marked ⚑ in the matrix.
  - **D1, interim-501 criteria. Decided: superseded by #8.**
    - The criteria: #4 c7, the 501 path of #4 c13, the 501 half of #5 c3, #6 c11, and the last sentence of #7 c7.
    - #8 removed the interim 501.
    - Each is recorded as **Superseded**. The replacement behaviour must still be proven: Step 1 gives 200 results, and there is no 501 anywhere in the sweep.
  - **D2, #5 c17. Decided: the 503 is accepted.**
    - The case: a parseable roster whose `operators` is absent or not an array.
    - On `GET /api/shifts` and `POST /api/swap-checks` it gives 503 `roster-unavailable`, and `GET /api/dev/users` lists only the supervisors, as AGENTS.md documents at `b60a56d`. (Updated under D5; the earlier wording was `{users:[]}`.)
  - **D3, H-START-DEV-EXIT. Decided: informational.**
    - The result of `npm run dev:api` (`tsx watch`) on a bad `SHIFTSWAP_NOW` is recorded, but it does not count toward the gate.
    - Its `FAIL` line in group T does not close the gate. Block T's exit code is judged on its other `RESULT` lines.
    - H-START-DIRECT and H-START-DEV-MSG stay required.
  - **D4, Z-PIN base branch. Decided after run 1: the expected result was mis-stated, and is corrected.**
    - Pull requests #11 to #14 were stacked by design: each one's base is the head branch of the pull request below it.
    - Correct expectation: every pull request is `MERGED`, its head commit is an ancestor of the pinned SHA, and its base is either `feature/3-check-swap-by-hand` or the head branch of the pull request below it in the stack. Block 0 now checks this in code.
    - Run 1's Fail and its reason stay in the record. This corrects the check; it is not a change to match the result, and it does not go back to the builder.
  - **D5, H-503 `GET /api/dev/users` with no usable `operators`. Decided after run 1: mis-documented, not mis-built.**
    - AGENTS.md is corrected at `b60a56d`: with no usable operators list, `GET /api/dev/users` lists only the supervisors.
    - D2 and the H-503 expectation are updated to match. Run 1's Fail stays in the record.

## Prerequisites and safety

- Windows, PowerShell 7, and Node 22.13 or later (Node 24.19.0 is installed). You also need `git`, plus `gh` authenticated with read access to this repository.
- **Evidence directory** `$EV`, outside the repository: `C:\Users\HarlowBurgess\.copilot\session-state\27c57277-ba7c-4818-87a1-fd1230133421\files\evidence\b60a56d`.
- **Probe API port:** 3917.
  - Ports 3000 and 5173 are left free for the BE's live procedure.
  - Probes never run at the same time as the BE's servers.
- **Must not be touched:**
  - `docs/standards/`, `docs/discovery/`, `data/` and `docs/design/quality/nfr-register.md`.
  - All production code and tests.
  - Altered rosters for the 503 and parseable-file probes are written only under `$EV\rosters` and passed via `SHIFTSWAP_ROSTER_PATH`.
- **No secrets.** Identity is two plain headers taken from the fictional sample roster. No tokens are recorded.
- **Two scripts.** `probe.mjs` (black-box HTTP probes against a real API process) and `e-check.mjs` (per-criterion test-title check on the Vitest JSON report) are written out verbatim in the appendices.
  - Block 0 extracts them and records their SHA-256.
  - They change nothing in the repository.
- **Shared preamble.** Every block runs in a fresh PowerShell 7 process from the repository root and starts with this preamble:

```powershell
$REPO = (git rev-parse --show-toplevel) -replace '/', '\'
$EV   = 'C:\Users\HarlowBurgess\.copilot\session-state\27c57277-ba7c-4818-87a1-fd1230133421\files\evidence\b60a56d'
Set-Location $REPO
```

## Automated checks

Run the blocks one at a time, in this order: 0, A, B, C, D, E, F, G, P, Q, R, S, T, U, V.

- Record each block's exit code before starting the next.
- A nonzero exit is recorded. A later successful run does not clear it.
- If a block fails, do not substitute a different command. Investigate and record what happened.

### 0. Pin, extract scripts, confirm ancestry and roster hash

```powershell
New-Item -ItemType Directory -Force $EV | Out-Null
$fail = 0
$plan = Join-Path $REPO 'docs\design\verification\3-check-swap-by-hand-verification-plan.md'
$md = Get-Content -Raw $plan
$f = [string][char]96 * 3
foreach ($n in 'probe.mjs', 'e-check.mjs') {
  $e = [regex]::Escape($n)
  $m = [regex]::Match($md, '<!-- ' + $e + ':begin -->\s*' + $f + 'js\r?\n(.*?)\r?\n' + $f + '\s*<!-- ' + $e + ':end -->', 'Singleline')
  if (-not $m.Success) { "MISSING $n"; $fail = 1; continue }
  Set-Content -NoNewline -Encoding utf8NoBOM -Path (Join-Path $EV $n) -Value $m.Groups[1].Value
  "{0} sha256 {1}" -f $n, (Get-FileHash (Join-Path $EV $n) -Algorithm SHA256).Hash
}
$sha = git rev-parse HEAD; $br = git rev-parse --abbrev-ref HEAD
"HEAD $sha"; "BRANCH $br"
if ($sha -ne 'b60a56dd76661f80bedbb62f589a5e6ff441b838') { 'SHA MISMATCH'; $fail = 1 }
if ($br -ne 'feature/3-check-swap-by-hand') { 'BRANCH MISMATCH'; $fail = 1 }
$st = @(git status --porcelain --untracked-files=all)
"STATUS:"; $st
if (($st | Where-Object { $_ -ne '?? docs/design/verification/3-check-swap-by-hand-verification-plan.md' }).Count -gt 0) { 'UNEXPECTED LOCAL CHANGE'; $fail = 1 }
$prs = 9, 10, 11, 12, 13, 14
$info = @{}
foreach ($pr in $prs) { $info[$pr] = gh pr view $pr --json headRefOid,headRefName,state,baseRefName | ConvertFrom-Json }
foreach ($pr in $prs) {
  $i = $info[$pr]
  git merge-base --is-ancestor $i.headRefOid HEAD; $anc = $LASTEXITCODE
  $below = @($prs | Where-Object { $_ -ne $pr -and $info[$_].headRefName -eq $i.baseRefName })
  $baseOk = ($i.baseRefName -eq 'feature/3-check-swap-by-hand') -or ($below.Count -eq 1)
  $bl = if ($below.Count -eq 1) { '#' + $below[0] } else { '-' }
  "PR #$pr $($i.headRefOid) $($i.state) base $($i.baseRefName) below $bl base-ok $baseOk ancestor-exit $anc"
  if ($anc -ne 0 -or $i.state -ne 'MERGED' -or -not $baseOk) { $fail = 1 }
}
$rh = git hash-object data/roster.sample.json; $rt = git rev-parse HEAD:data/roster.sample.json
"ROSTER $rh vs HEAD $rt"; if ($rh -ne $rt) { $fail = 1 }
$global:LASTEXITCODE = $fail
$LASTEXITCODE
```

**Expected:**

- Both scripts are extracted, and their hashes are printed.
- HEAD is `b60a56dd76661f80bedbb62f589a5e6ff441b838` and the branch is `feature/3-check-swap-by-hand`.
- The status lists only this plan file.
- Each pull request is `MERGED`, its head commit is an ancestor of the pinned SHA (ancestry exit code `0`), and its base is either `feature/3-check-swap-by-hand` or the head branch of the pull request below it in the stack (`base-ok True`), per D4. The stack is #9 → #11 → #12 → #13 → #14; #10 targets the feature branch.
- The roster hash equals HEAD's.
- The block exits `0`.

### A. Install

```powershell
npm ci 2>&1 | Tee-Object "$EV\npm-ci.log"
$LASTEXITCODE
```

**Expected:** exit `0`.

### B. Build (typecheck all workspaces, bundle the web app)

```powershell
npm run build 2>&1 | Tee-Object "$EV\build.log"
$LASTEXITCODE
```

**Expected:** exit `0`, and the log contains no `error TS`.

### C. Lint

```powershell
npm run lint 2>&1 | Tee-Object "$EV\lint.log"
$LASTEXITCODE
```

**Expected:** exit `0`, with 0 errors and 0 warnings reported.

### D. Full test suite with JSON report

```powershell
npm test -- --reporter=default --reporter=json "--outputFile.json=$EV\vitest.json" 2>&1 | Tee-Object "$EV\vitest.log"
$LASTEXITCODE
```

**Expected:**

- Exit `0`, and `vitest.json` is written.
- Selected-test floors: rules ≥ 226, api ≥ 222, web ≥ 72, total ≥ 520. These are the static `test(`/`it(` declaration counts at the pin. Block E enforces the floors.

### E. Per-criterion test-title check

```powershell
node "$EV\e-check.mjs" "$EV\vitest.json" $REPO 2>&1 | Tee-Object "$EV\e-check.log"
$LASTEXITCODE
```

**Expected:**

- Overall:
  - `success` is true.
  - The failed, pending, skipped and todo counts are all 0.
  - Every test file's status is `passed`.
  - The project floors from block D are met.
  - Every tracked `*.test.ts(x)` file appears in the report.
- For every map case, the script prints `CASE <id> PASS`. A case passes when:
  - every map entry matches at least its minimum number of passed tests, and
  - no matching test failed.
- A map entry with zero matches is recorded as **Inconclusive**, together with the closest actual title. The verifier returns to the BE before changing the map.

### F. Static checks: web boundary, fixtures, no database use, no writes

```powershell
$fail = 0
git --no-pager grep -nE "(apps/api|packages/rules|@shiftswap/(api|rules))" -- apps/web; $x = $LASTEXITCODE; "web-boundary grep exit $x (expect 1)"; if ($x -ne 1) { $fail = 1 }
node -e "const p=require('./apps/web/package.json');const d={...p.dependencies,...p.devDependencies,...p.peerDependencies};const bad=Object.keys(d).filter(k=>k.startsWith('@shiftswap/'));console.log('web deps',Object.keys(d).join(','),'bad',bad.join(','));process.exit(bad.length?1:0)"; if ($LASTEXITCODE -ne 0) { $fail = 1 }
$fx = 'add-3','add-6','cannot-determine-missing-exported-at','cannot-determine-now-before-export','cannot-determine-shift-end-not-after-start','cannot-determine-stale-and-horizon','dev-users','shifts-102286','shifts-104417','step-1','step-2','step-3','step-4','step-5','step-6','step-7','step-8','unchanged-shift-qualification','unchanged-window-hours'
git ls-files --error-unmatch ($fx | ForEach-Object { "fixtures/responses/$_.json" }) | Measure-Object | ForEach-Object { "tracked fixtures $($_.Count) (expect 19)"; if ($_.Count -ne 19) { $fail = 1 } }
if ($LASTEXITCODE -ne 0) { $fail = 1 }
$sq = @(git --no-pager grep -lE "node:sqlite|openDatabase" -- apps packages); "sqlite files: $($sq -join ', ')"
if ((($sq | Sort-Object) -join ',') -ne 'apps/api/src/app.test.ts,apps/api/src/db.ts') { $fail = 1 }
git --no-pager grep -nE "(^|[^A-Za-z_])(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|mkdtemp|rename|renameSync|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|copyFile|copyFileSync|cp|cpSync|truncate|truncateSync)[[:space:]]*\(" -- apps/api/src packages/rules/src apps/web/src ":!*.test.ts" ":!*.test.tsx"; $x = $LASTEXITCODE; "write-call grep exit $x (expect 1)"; if ($x -ne 1) { $fail = 1 }
$fsi = @(git --no-pager grep -nE 'from "(node:)?fs(/promises)?"' -- apps/api/src packages/rules/src apps/web/src ":!*.test.ts" ":!*.test.tsx"); "fs imports:"; $fsi
$want = 'apps/api/src/roster.ts:1:import { readFileSync } from "node:fs";', 'apps/api/src/test-support.ts:1:import { readFileSync } from "node:fs";'
if ((($fsi | Sort-Object) -join '|') -ne ($want -join '|')) { 'fs import set differs'; $fail = 1 }
$global:LASTEXITCODE = $fail
$LASTEXITCODE
```

**Expected:**

- Both greps exit `1`: there are no matches.
- The web app's dependencies are only `react` and `react-dom`.
- All 19 fixtures are tracked.
- `node:sqlite` appears only in `apps/api/src/db.ts` and `apps/api/src/app.test.ts`.
- The only `fs` imports outside tests are the two `readFileSync` imports.
- The block exits `0`.

If the `fs` import lines differ only in trailing punctuation, the verifier records the actual lines and classifies the difference before setting a result.

### G. Client inputs and the register are unchanged

```powershell
git fetch origin main --quiet
$mb = git merge-base origin/main HEAD; "merge-base $mb"
$fail = 0
foreach ($p in 'docs/standards', 'docs/discovery', 'data', 'docs/design/quality/nfr-register.md') {
  git diff --quiet $mb HEAD -- $p; $a = $LASTEXITCODE
  git diff --quiet HEAD -- $p;     $b = $LASTEXITCODE
  "$p branch-diff $a worktree-diff $b"; if ($a -ne 0 -or $b -ne 0) { $fail = 1 }
}
$global:LASTEXITCODE = $fail
$LASTEXITCODE
```

**Expected:** every path shows `branch-diff 0 worktree-diff 0`, and the block exits `0`.

### P–U. Black-box probes against a real API process

How each group runs:

- Each group starts `node --import tsx src/server.ts` in `apps/api` on port 3917, with a cleaned environment: `SHIFTSWAP_NOW`, `SHIFTSWAP_ROSTER_PATH`, `NODE_ENV` and `PORT` are removed, then set per probe.
- The API's stdout and stderr are kept as `$EV\api-<tag>.out.log` / `.err.log`.
- When the group finishes, the API is stopped and the port is checked free (H-PORT).
- Each group prints `CASE <id> PASS|FAIL <detail>`, writes `$EV\probe-<G>.json`, and exits `1` on any failure.

| Group | Proves | Clock (`SHIFTSWAP_NOW`) |
| --- | --- | --- |
| P | Steps 1–6 and 8, ADD-2, ADD-3, ADD-6, identity, owner checks, the dev users route, the route surface, statelessness, fixture equality | `2027-03-07T14:00:00Z` |
| Q | Step 7, the 26 h age boundary, the now-before-export boundary, an unset clock, and ADD-5 (fresh process) | varies per case |
| R | Production mode, roster-unavailable 503 (and the 401/403 ordering before it), a parseable file with an invalid field, reading the roster on every request | `2027-03-07T14:00:00Z` |
| S | Sweep of all 4,748 ordered cross-owner picks: privacy and symmetry | `2027-03-07T14:00:00Z` |
| T | Startup refusal for a malformed `SHIFTSWAP_NOW`: direct and via `npm run dev:api` | malformed values |
| U | Log privacy scan over every probe log, with a positive control | — |

```powershell
node "$EV\probe.mjs" P $REPO $EV 2>&1 | Tee-Object "$EV\probe-P.log"
$LASTEXITCODE
```

```powershell
node "$EV\probe.mjs" Q $REPO $EV 2>&1 | Tee-Object "$EV\probe-Q.log"
$LASTEXITCODE
```

```powershell
node "$EV\probe.mjs" R $REPO $EV 2>&1 | Tee-Object "$EV\probe-R.log"
$LASTEXITCODE
```

```powershell
node "$EV\probe.mjs" S $REPO $EV 2>&1 | Tee-Object "$EV\probe-S.log"
$LASTEXITCODE
```

```powershell
node "$EV\probe.mjs" T $REPO $EV 2>&1 | Tee-Object "$EV\probe-T.log"
$LASTEXITCODE
```

```powershell
node "$EV\probe.mjs" U $REPO $EV 2>&1 | Tee-Object "$EV\probe-U.log"
$LASTEXITCODE
```

**Expected:** every `CASE` line in each group says `PASS`, and every group exits `0`.

- Group Q depends on `p-bodies.json`, so run P first.
- Group U depends on the logs of P–T, so run it last of the probe groups.

### V. Post-run: no writes, no database, roster unchanged

```powershell
$fail = 0
$rh = git hash-object data/roster.sample.json; $rt = git rev-parse HEAD:data/roster.sample.json
"ROSTER $rh vs HEAD $rt"; if ($rh -ne $rt) { $fail = 1 }
$st = @(git status --porcelain --untracked-files=all); "STATUS:"; $st
if (($st | Where-Object { $_ -ne '?? docs/design/verification/3-check-swap-by-hand-verification-plan.md' }).Count -gt 0) { $fail = 1 }
$db = @(Get-ChildItem -Recurse -File -Force -Include *.db, *.sqlite, *.sqlite3, *.db-journal, *.db-wal, *.sqlite-wal -Path $REPO -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' })
"db files: $($db.Count)"; $db.FullName; if ($db.Count -ne 0) { $fail = 1 }
git status --porcelain --ignored | Where-Object { $_ -like '!!*' } | Tee-Object "$EV\ignored.txt"
$global:LASTEXITCODE = $fail
$LASTEXITCODE
```

**Expected:**

- The roster hash equals HEAD's.
- The status lists only this plan file.
- There are 0 database files outside `node_modules`.
- The ignored listing is recorded. It should hold only `node_modules/` and build output such as `dist/`; any other entry is classified before a result is set.
- The block exits `0`.

## Case matrix

How to read the matrix:

- The `E:` cases rely on the titles in e-check's MAP (Appendix B) and on block D passing.
- A row marked ⚑ is governed by one of the BE decisions D1 to D5.
- A row marked ◐ is partial evidence. Its limitation is stated in the row.

### Gates and integrity

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| Z-PIN ⚑ D4 | Block 0 | The SHA and branch are as pinned. Every pull request is `MERGED`, its head is an ancestor of the pin, and its base is the feature branch or the head branch of the pull request below it in the stack (D4). The roster hash is as pinned. The only local change is this plan. Exit 0. | **Pass** — block 0 exit 0. HEAD b60a56d, branch as pinned, status lists only this plan; all six PRs `MERGED`, ancestry exit 0, `base-ok True` (#9, #10 base the feature branch; #11 below #9, #12 below #11, #13 below #12, #14 below #13); roster 9ac55bec = HEAD. `block-0.out`. Run 1 (`a137e48`, stale): **Fail** — the base of #11 to #14 was a stacked session branch, not `feature/3-check-swap-by-hand`; the check was corrected under D4, not returned to the builder. |
| G-INSTALL | Block A | `npm ci` exits 0. | **Pass** — exit 0; 241 packages added; 7 moderate `npm audit` advisories (informational). `npm-ci.log` |
| G-BUILD | Block B | Exit 0, and no `error TS`. | **Pass** — exit 0; 0 `error TS`; vite bundle built. `build.log` |
| G-LINT | Block C | Exit 0. | **Pass** — exit 0; eslint reported nothing. `lint.log` |
| G-TEST | Block D | Exit 0. | **Pass** — exit 0; 27 files, 955 selected, 955 passed, 0 failed, 0 skipped; `vitest.json` written. `vitest.log` |
| E-TOTALS | Block E, totals | `success`. 0 failed, pending, skipped and todo. All files passed. Floors met: rules ≥ 226, api ≥ 222, web ≥ 72, total ≥ 520. Every tracked test file is in the report. | **Pass** — success true; 955/955; 0 failed/pending/todo; rules 525 ≥ 226, api 293 ≥ 222, web 137 ≥ 72, total 955 ≥ 520; 27/27 tracked files in report. `block-E.out` |
| G-STATIC | Block F | Exit 0 (see the block for the details). | **Pass** — exit 0. Both greps exit 1; runtime `dependencies` exactly `react`, `react-dom` (devDependencies are build/test tools; no `@shiftswap/*`); 19 fixtures tracked; sqlite only in `db.ts`, `app.test.ts`; only the two `readFileSync` imports. `block-F.out` |
| G-INPUTS | Block G | No diff in `docs/standards`, `docs/discovery`, `data` or the NFR register, against the merge base or in the worktree. | **Pass** — exit 0; all four paths `branch-diff 0 worktree-diff 0` vs merge base d05bf46. `block-G.out` |
| G-POST | Block V | Roster unchanged, no stray files, no database files. Exit 0. | **Pass** — exit 0; roster 9ac55bec = HEAD; status lists only this plan; 0 db files; ignored: `apps/web/dist/`, `node_modules/` only. `block-V.out`, `ignored.txt` |

### Feature verification steps, black box (blocks P and Q)

All of these run against the real API on port 3917 with the sample roster.

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| F-S1 | Step 1. P: caller 104417 gives `CDU-CON1-0318-N` and takes `CDU-CON1-0319-N`. | **200** `approved-without-review`. No findings or triggers for either employee. Maya off duty 36 h before / 156 h after; Luis 48 / 36. Each one's worst window containing a swapped date is 48 h. `guidance` equals `step-1.json`'s. | **Pass** — P: 200 `approved-without-review`; Maya 36/156, Luis 48/36; no findings or triggers; fixture equal. `block-P.out` |
| F-S2 | Step 2. P: 106640 gives `HCU-CON2-0312-N` and takes `HCU-CON1-0310-D`. | **200** `review-required`, with no findings. The only trigger is Aisha's 4.2(a) of 11 h. Aisha 11 / 107; Priya 72 / 71. Aisha's window 03-14..03-20 is 60 h. The body has no key naming a reviewing unit. | **Pass** — P: 200 `review-required`; only trigger Aisha 4.2(a) 11 h; Aisha 11/107. `block-P.out` |
| F-S3 | Step 3. P: 104417 gives `CDU-CON1-0310-D` and takes `CDU-CON1-0312-D`. | **200** `cannot-be-approved`. The only finding is Luis's 3.1 of 0 h. Maya has no findings and no triggers. `guidance` contains `VE-HSSE-PRC-021`. | **Pass** — P: 200 `cannot-be-approved`; only finding Luis 3.1 0 h. `block-P.out` |
| F-S4 | Step 4. P: 104417 gives `CDU-CON1-0310-D` and takes `HCU-CON1-0314-D`. | **200** `cannot-be-approved`. The only finding is Maya's 3.1 of **10 h (not 11)**. Maya's off duty after is 49 h. Dwayne has no findings and is 169 / 47. | **Pass** — P: 200 `cannot-be-approved`; only finding Maya 3.1 **10 h**; Maya after 49. `block-P.out` |
| F-S5 | Step 5. P: 103078 gives `CDU-FLD1-0309-D` and takes `CDU-FLD1-0318-D`. | **200** `cannot-be-approved`. The only finding is Tom's 3.2, 03-15..03-21, 84 h. Tom's windows 03-14 and 03-16 are 72 h. Jerome has no findings, is 156 / 36, and his window 03-07..03-13 is **47 h**. Derived from the body, his `0313-N` contributes 11 h. | **Pass** — P: 200 `cannot-be-approved`; Tom 3.2 84 h 03-15; Jerome window 47 h. `block-P.out` |
| F-S6 | Step 6. P: 107903 gives `HCU-CON1-0308-D` and takes `HCU-CON1-0317-D`. | **200** `cannot-be-approved`. The only finding is Priya's 3.3 on `HCU-CON1-0317-D`: HCU / CONSOLE, start 2027-03-17, `validThrough` 2027-03-15, changed by the swap. Dwayne has no findings and is 120 / 96. | **Pass** — P: 200 `cannot-be-approved`; Priya 3.3 on `HCU-CON1-0317-D`. `block-P.out` |
| F-S7 | Step 7. Q: the Step 1 pick with `SHIFTSWAP_NOW=2027-03-08T12:00:00Z`. | **200**. The body deep-equals `step-7.json`: `cannot-determine` with `[{export-stale, ageHours 28, ageMinutes 0, limitHours 26}]`, and no `employees` or `guidance`. | **Pass** — Q: 200, deep-equal `step-7.json` (`export-stale`, 28 h). `block-Q.out` |
| F-S8 | Step 8. P: 104417 gives `CDU-CON1-0318-N` and takes `FCC-CON1-0318-D`. | **422** with exactly `{kind:"refused",reasons:[{code:"outside-pilot-units",shiftId:"FCC-CON1-0318-D",unit:"FCC"}]}`. | **Pass** — P: 422, exact refusal body for `FCC-CON1-0318-D`. `block-P.out` |
| F-ADD2 | ADD-2. P: `GET /api/shifts` as 104417 and as 102286. | `give` is exactly the caller's roster shifts, and `take` is all the other shifts with `ownerName`. FCC-CON1-0318-D is in 104417's take list. No value is an employee number. The stamps equal the roster's. | **Pass** — P: 104417 give 11 / take 63, 102286 give 10 / take 64; numbers []; stamps equal. `block-P.out` |
| F-ADD3 | ADD-3. P: 108529 gives `CDU-FLD1-0318-D` and takes `CDU-CON1-0326-D`. | **200**, deep-equal to `add-3.json` (one `shift-outside-horizon` naming only the take shift). The raw body does not contain `CDU-FLD1-0318-D`. | **Pass** — P: 200 deep-equal `add-3.json`; give shift absent from the raw body. `block-P.out` |
| F-ADD5 | ADD-5. Q: a fresh API process replays every P request. | Every raw body is byte-identical to P's. Nothing persisted or changed between processes. | **Pass** — Q: fresh process replayed 57 requests, 0 differing. `block-Q.out` |
| F-ADD6 | ADD-6. Q25 is still Open (`prd.md:732`). P: 103078 gives `CDU-FLD1-0309-D` and takes `CDU-FLD1-0311-D`. | **200** `review-required`, with no findings. The only trigger is Tom's 4.2(b), 03-15..03-21, 72 h, `changedBySwap:false`. | **Pass** — P: 200 `review-required`; only trigger Tom 4.2(b) 72 h 03-15 `changedBySwap:false`. `block-P.out` |

ADD-1 (notices) is a UI property. It is covered by the E: cases T4-11, T5-11 and T8-10, and live by L-ADD1 and L-S*.

### Black-box hardening (blocks P–U)

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| H-HEALTH | P: `GET /api/healthz` with no headers. | 200 with `status:"ok"`. | **Pass** — 200 `{"status":"ok"}`. `block-P.out` |
| H-IDENT | P: both identity routes (`GET /api/shifts`, `POST /api/swap-checks`). | 401 with no headers, with the number only, and with the roles only. 403 `role-not-permitted` for the roles `shift-supervisor`. 403 `not-a-roster-operator` for 100231 and for 999999. 200 for the roles `operator, shift-supervisor`. | **Pass** — 401 ×6; 403 `role-not-permitted` ×2, `not-a-roster-operator` ×4; 200 ×2 for the comma list. `block-P.out` |
| H-OWN | P: owner checks. | A give shift that is another operator's, or an unknown give shift, gets 403 `give-shift-not-yours`. Giving and taking the same shift, or taking one's own shift, gets 422 `take-shift-is-own`. An unknown take shift gets 422 `unknown-shift`. | **Pass** — 403 `give-shift-not-yours` ×2; 422 `take-shift-is-own` ×2; 422 `unknown-shift`. `block-P.out` |
| H-REFUSE-GIVE | P: 109364 gives `FCC-CON1-0318-D` and takes `CDU-CON1-0319-N`. | 422 refused, with one `outside-pilot-units` reason naming the FCC give shift. | **Pass** — 422, one `outside-pilot-units` naming the FCC give shift. `block-P.out` |
| H-DEV | P: `GET /api/dev/users` with no headers. | 200, deep-equal to `dev-users.json`: 10 users (8 operators, 2 supervisors). | **Pass** — 200, 10 users (8 operators, 2 supervisors), deep-equal `dev-users.json`. `block-P.out` |
| H-ROUTES | P: PUT, PATCH and DELETE on the four routes; POST `/api/shifts`; GET of `/api/swaps`, `/api/requests`, `/api/approvals`, `/api/notifications`, `/api/history` and `/api/swap-checks/1`. All requests carry valid identity. | 404 for every one. | **Pass** — all 19 requests 404. `block-P.out` |
| H-STATELESS | P: Steps 1, 2 and 3, ADD-3 and ADD-6 are each sent twice. | The raw bodies are byte-identical. | **Pass** — S1, S2, S3, ADD3, ADD6 repeated: byte-identical. `block-P.out` |
| H-FIXTURE-EQ | P: compare black-box bodies to the shared fixtures: steps 1–6 and 8, add-3, add-6, shifts-104417, shifts-102286 and dev-users. | Each parsed body deep-equals its fixture. | **Pass** — 12 of 12 bodies deep-equal their fixtures. `block-P.out` |
| H-AGE | Q: Step 1 at `2027-03-08T10:00:00Z` (exactly 26 h after the export) and at `2027-03-08T10:00:01Z`. | The first gives `approved-without-review`. The second gives `cannot-determine` with only `export-stale`. | **Pass** — Q: 26 h `approved-without-review`; 26 h 1 s `cannot-determine` (`export-stale` only). `block-Q.out` |
| H-NOW | Q: Step 1 at `2027-03-07T07:59:59Z` and at `2027-03-07T08:00:00Z`. | The first gives `cannot-determine` with only `now-before-export`. The second gives `approved-without-review`. | **Pass** — Q: 07:59:59Z `now-before-export` only; 08:00:00Z `approved-without-review`. `block-Q.out` |
| H-ADD3-STALE | Q: the ADD-3 pick at `2027-03-08T12:00:00Z`, and Step 8 at the same clock. | ADD-3's reasons are `[export-stale, shift-outside-horizon]`, in that order. Step 8 is still a 422 refusal. | **Pass** — Q: reasons `[export-stale, shift-outside-horizon]`; Step 8 still 422. `block-Q.out` |
| H-CLOCK-UNSET | Q: Step 1 with `SHIFTSWAP_NOW` unset (system clock). | A 200 `cannot-determine` with the reason the system date implies: `now-before-export` before 2027-03-07T08:00Z, or `export-stale` more than 26 h after the export. | **Pass** — Q: system now 2026-11-19T00:56Z, 200 `cannot-determine` `now-before-export`. `block-Q.out` |
| H-PROD | R: `NODE_ENV=production`. | `GET /api/dev/users` gives 404 with and without identity headers, and the body holds no roster name or number. `GET /api/shifts` and Step 1 each give 200. | **Pass** — R: dev/users 404 with and without identity, no roster data; shifts 200; Step 1 200. `block-R.out` |
| H-503 ⚑ D5 | R: `SHIFTSWAP_ROSTER_PATH` set in turn to a missing file, a non-JSON file, a directory, an `operators:{}` file, and a file with no `operators`. | `GET /api/healthz` gives 200. `GET /api/shifts` and `POST /api/swap-checks` give 503 `{code:"roster-unavailable"}`, with no path, file name or directory in the body. `GET /api/dev/users` gives 503 for the first three files, and for the two `operators` files gives 200 listing only the supervisors: deep-equal to `{users:[…]}` holding the `shift-supervisor` entries of `dev-users.json` (Renee Landry, Carl Nguyen). ⚑ D2 and D5 apply to the two `operators` files. | **Pass** — R: missing, non-JSON, directory: healthz 200, shifts/swap-checks/dev-users 503 `roster-unavailable`. `operators:{}` and no-`operators`: healthz 200, shifts and swap-checks 503 (D2), dev/users 200 listing only Renee Landry and Carl Nguyen (`shift-supervisor`), deep-equal to the D5 expectation. No leaks. `block-R.out`. Run 1 (`a137e48`, stale): **Fail** — dev/users gave the two supervisors where the then-documented expectation was `{users:[]}`; triaged under D5 as mis-documented, not mis-built. |
| H-503-ORDER | R: on each 503 roster, send requests with no headers and with roles `shift-supervisor`. | 401 and 403, not 503. | **Pass** — R: on all five rosters, 401 with no headers and 403 for `shift-supervisor`; never 503. `block-R.out` |
| H-PARSEABLE | R: a valid roster with `exportedAt` removed. | Step 1 gives 200 `cannot-determine`, including `{code:"invalid-export-field",field:"exportedAt",problem:"missing"}`, and the stamps are null. `GET /api/shifts` gives 200 with `exportedAt:null`. | **Pass** — R: Step 1 200 `cannot-determine` with `invalid-export-field` `exportedAt`, null stamps; shifts 200 `exportedAt:null`. `block-R.out` |
| H-READ-EACH | R: point the API at `$EV\rosters\live.json`, then rename it away, then rename it back. | 200, then 503, then 200, all from one process. | **Pass** — R: 200, 503, 200 from one process. `block-R.out` |
| H-SWEEP | S: every ordered cross-owner pick of the sample at 14:00Z (concurrency 8). | 4,748 requests. Each is 200 with one of the four outcomes, or 422 refused with only `outside-pilot-units` reasons. A refusal and each of the four outcomes all occur. No 501 and no 5xx. | **Pass** — S: 4,748 picks, 4,748 responses; 422 ×560, cannot-determine 2,306, cannot-be-approved 1,658, approved-without-review 162, review-required 62; invalid 0; no 501 or 5xx. `block-S.out` |
| H-SWEEP-PRIV | S: scan every raw sweep body. | None contains any of the 10 roster employee numbers. | **Pass** — S: 0 bodies with an employee number. `block-S.out` |
| H-SYM | S: compare both directions of each of the 2,374 unordered pairs. | Status and outcome are equal. Employees, matched by name, are deep-equal apart from `party`. Refusal reasons are equal as sets. | **Pass** — S: 2,374 pairs, 0 asymmetric. `block-S.out` |
| H-START-DIRECT | T: `node --import tsx src/server.ts` with `SHIFTSWAP_NOW` set in turn to `yesterday`, `2027-03-07 14:00`, `2027-03-07T14:00:00+00:00` and `2027-03-07T14:00:00`. | Each exits non-zero within 30 s, with stderr naming `SHIFTSWAP_NOW`. None logs `Server listening`. | **Pass** — T: all four values exit 1, stderr names `SHIFTSWAP_NOW`, no listen. `block-T.out` |
| H-START-DEV-MSG | T: `npm run dev:api` with `SHIFTSWAP_NOW=2027-03-07 14:00`. | Within 30 s, the output names `SHIFTSWAP_NOW`, and port 3917 never accepts a connection. | **Pass** — T: output names `SHIFTSWAP_NOW`; port never accepted. `block-T.out` |
| H-START-DEV-EXIT ⚑ D3 | T: the same run as H-START-DEV-MSG. | The process exits non-zero within 30 s, without being killed. Under D3 the result is **informational**: it is recorded as observed, and it is not a gate case. | **Fail (informational, D3; not a gate case)** — T: `tsx watch` still running after 30 s, killed with `taskkill /T /F`. Block T exit 1 comes from this line only. `block-T.out` |
| H-PORT | P–T: after each API is stopped. | Port 3917 is free. | **Pass** — port 3917 free after every API in P to T (22 checks); 0 listeners after V. `block-P..T.out` |
| H-LOG | U: scan every `api-*` and `t-*` log for the 10 roster numbers, the 10 full names and the 10 surnames, after masking the `pid`, `time` and `responseTime` values. | 0 hits. The scan covers at least 15 files, and the sweep log has at least 4,748 `request completed` lines. The positive control file is detected. | **Pass** — U: 44 files, 0 hits; sweep log 4,749 `request completed` lines; control detected (104417, Maya Thibodeaux, Thibodeaux). `block-U.out` |

### Task validation criteria: #4 (T1) and #5 (T2)

Each `E:` row passes only when block E prints `CASE <id> PASS`. Appendix B lists the exact test titles each row needs.

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| T4-01 | #4 c1, healthz. E: `app`. Black box: H-HEALTH. | 200 `{status:"ok"}` with no identity headers. Mapped test passed. | **Pass** — block E `CASE T4-01 PASS`; listed black-box cases Pass. |
| T4-02 | #4 c2, identity. E: `shifts` / `sc` / `rs` 401, 403 and roles-list tests. Black box: H-IDENT. | 401 when a header is missing. 403 `role-not-permitted` and `not-a-roster-operator` as specified. The comma list is trimmed. | **Pass** — block E `CASE T4-02 PASS`; listed black-box cases Pass. |
| T4-03 | #4 c3, give and take lists. E: `shifts`. Black box: F-ADD2. | Give equals the caller's roster shifts. Take holds all other shifts, FCC included. | **Pass** — block E `CASE T4-03 PASS`; listed black-box cases Pass. |
| T4-04 | #4 c4, export stamp. E: `shifts`. Black box: F-ADD2. | `exportedAt` `2027-03-07T08:00:00Z`, with the site-local and time-zone stamps. | **Pass** — block E `CASE T4-04 PASS`; listed black-box cases Pass. |
| T4-05 | #4 c5, Step 8, plus both-outside give-first (test only). E: `sc`. Black box: F-S8, H-REFUSE-GIVE. | 422 refused, naming the FCC shift and unit. No outcome. Equals `step-8.json`. | **Pass** — block E `CASE T4-05 PASS`; listed black-box cases Pass. |
| T4-06 | #4 c6, ownership. E: `sc`. Black box: H-OWN. | 403 `give-shift-not-yours`. 422 `take-shift-is-own`, including give equal to take. | **Pass** — block E `CASE T4-06 PASS`; listed black-box cases Pass. |
| T4-07 ⚑ D1 | #4 c7, "Step 1 → 501 `not-evaluated`". Superseded by #8 ("the interim 501 is removed"). Proof of the replacement: E `sc` Step 1 tests, plus F-S1 and H-SWEEP (no 501). | If D1 is accepted: **Superseded**, with evidence that Step 1 gives 200 `approved-without-review` and that no 501 occurs anywhere. If D1 is rejected: **Fail** (501 not returned). | **Superseded (D1)** — block E `CASE T4-07 PASS`; F-S1 200 `approved-without-review`; H-SWEEP 0 × 501 in 4,748. |
| T4-08 | #4 c8, dev users. E: `dev`. Black box: H-DEV, H-PROD. | 200 outside production, 8 operators and 2 supervisors, no identity needed. 404 in production, with no roster data in the body. | **Pass** — block E `CASE T4-08 PASS`; listed black-box cases Pass. |
| T4-09 | #4 c9, web switcher. E: `appw`. | A labelled combobox. Selecting a user sends both headers. In production there is no switcher and no headers. | **Pass** — block E `CASE T4-09 PASS`; listed black-box cases Pass. |
| T4-10 | #4 c10, web picker. E: `csf`. | Give options equal the fixture's, in order. Switching user swaps them. Checking the FCC pick renders the refusal, one item per reason. | **Pass** — block E `CASE T4-10 PASS`; listed black-box cases Pass. |
| T4-11 | #4 c11, ADD-1 notices. E: `csf`. Live: L-ADD1. | The picker and refusal views contain the export instant and every pilot caveat. No section-sign text in the refusal. | **Pass** — block E `CASE T4-11 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T4-12 | #4 c12, COMP-001 guard. E: `rg`. Black box: H-ROUTES, H-PROD. | Exactly four routes (three in production). 404 on every other route. The roster is unchanged. | **Pass** — block E `CASE T4-12 PASS`; listed black-box cases Pass. |
| T4-13 ⚑ D1 | #4 c13, [NFR-PRIV-001] log capture. E: `lp`. Black box: H-LOG. | Every route is exercised. Statuses 200, 400, 401, 403, 404, 422 and 503 all occur. 0 personal data in the logs. The positive control is detected. The c13 501 path is handled by D1 (superseded). | **Pass**; 501 path **Superseded (D1)** — block E `CASE T4-13 PASS`; H-LOG 0 hits. |
| T4-14 | #4 c14, [NFR-A11Y-001]. E: `csf` axe tests. | `wcagViolations` gives `[]` for the picker and the refusal view. | **Pass** — block E `CASE T4-14 PASS`; listed black-box cases Pass. |
| T4-15 | #4 c15, shared fixtures and boundary. E: `shifts` C15 and `wb`. Black box: G-STATIC, H-FIXTURE-EQ. | The fixtures are tracked and equal the API bodies. The web app does not import the API or the rules. | **Pass** — block E `CASE T4-15 PASS`; listed black-box cases Pass. |
| T4-16 | #4 c16, gates. | G-BUILD, G-LINT and G-TEST pass. | **Pass** — G-BUILD, G-LINT, G-TEST Pass. |
| T4-17 | #4 c17, take owner names. E: `shifts`. Black box: F-ADD2. | Every take entry has a non-empty `ownerName` matching the roster. No employee number appears in the body. | **Pass** — block E `CASE T4-17 PASS`; listed black-box cases Pass. |
| T4-18 | #4 c18, picker owner names. E: `csf`. Live: L-ADD2. | Each take option's accessible name contains its owner's name. | **Pass** — block E `CASE T4-18 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T4-19 | #4 c19, c13–15 with owner names. E: `lp` and `csf`. Black box: H-LOG. | Owner names are in the scanned set. The picker with owner names has no axe violations. | **Pass** — block E `CASE T4-19 PASS`; listed black-box cases Pass. |
| T5-01 | #5 c1, clock resolver. E: `clock` and `ss`. Black box: H-START-DIRECT, H-START-DEV-MSG, H-CLOCK-UNSET. | A valid value fixes the clock. Unset gives the system clock. Each malformed value fails startup with a message naming `SHIFTSWAP_NOW`. | **Pass** — block E `CASE T5-01 PASS`; listed black-box cases Pass. |
| T5-02 | #5 c2, age boundary. E: `det`. Black box: H-AGE. | Exactly 26 h gives no stale reason. One tick past 26 h gives `export-stale`. | **Pass** — block E `CASE T5-02 PASS`; listed black-box cases Pass. |
| T5-03 ⚑ D1 | #5 c3, Step 7. The 501 half is superseded under D1. E: `scd`. Black box: F-S7. | The Step 7 body equals `step-7.json`. The same pick at 14:00Z gives the Step 1 body. | **Pass**; 501 half **Superseded (D1)** — block E `CASE T5-03 PASS`; F-S7 Pass. |
| T5-04 ◐ | #5 c4, horizon boundaries. E: `det` inside and outside tests. | The boundary starts are inside and the just-outside starts are outside. Partial: the take-side boundaries are covered only through the property (LT-2). | **Pass** — block E `CASE T5-04 PASS`. Partial gap as stated (◐). |
| T5-05 | #5 c5, PRD B3 Monday and Wednesday exports. E: `det`. | Coverage and horizon are as specified, including the 03:00Z site-date case and the property. | **Pass** — block E `CASE T5-05 PASS`; listed black-box cases Pass. |
| T5-06 | #5 c6, ADD-3. E: `scd` and `det`. Black box: F-ADD3. | Only the take shift is named. When both shifts are out, both are named, give first (test only, see Limitations). | **Pass** — block E `CASE T5-06 PASS`; listed black-box cases Pass. |
| T5-07 | #5 c7, export fields. E: `det` and `scd`. | Each malformed `exportedAt` or `coverage` field gives `cannot-determine` naming the field. Never a crash. | **Pass** — block E `CASE T5-07 PASS`; listed black-box cases Pass. |
| T5-08 | #5 c8, fast-check property. E: `det`. | The gate never throws and the result is well formed. No personal data in it. | **Pass** — block E `CASE T5-08 PASS`; listed black-box cases Pass. |
| T5-09 | #5 c9, missing records. E: `det`, `scd` and `sc`. Black box: H-OWN. | `missing-shift`, `owner-not-operator` and `qualifications-missing` (absent or empty) as specified. An unknown take shift gives 422 `unknown-shift`. | **Pass** — block E `CASE T5-09 PASS`; listed black-box cases Pass. |
| T5-10 | #5 c10, precedence. E: `det` and `scd`. Black box: H-ADD3-STALE. | Reasons `[export-stale, shift-outside-horizon]`. An FCC pick is refused with 422 even when the export is stale. | **Pass** — block E `CASE T5-10 PASS`; listed black-box cases Pass. |
| T5-11 | #5 c11, web cannot-determine view. E: `cd`. Live: L-S7. | Shows the 28 h age and the reason wording. The notices are in one landmark. No outcome wording. | **Pass** — block E `CASE T5-11 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T5-12 | #5 c12, [NFR-PRIV-001]. E: `lp`. Black box: H-LOG. | The scenario lines and all route lines hold 0 personal data. | **Pass** — block E `CASE T5-12 PASS`; listed black-box cases Pass. |
| T5-13 | #5 c13, [NFR-A11Y-001]. E: `cd`, at least 5 tests. | No axe violations for each cannot-determine variant. | **Pass** — block E `CASE T5-13 PASS`; listed black-box cases Pass. |
| T5-14 | #5 c14, now before export. E: `det` and `scd`. Black box: H-NOW. | 07:59:59Z gives only `now-before-export`. A now equal to `exportedAt` is determinable. | **Pass** — block E `CASE T5-14 PASS`; listed black-box cases Pass. |
| T5-15 | #5 c15, invalid time zone. E: `det` and `scd`. | Absent, numeric or unknown zone gives 200 `cannot-determine` with null stamps, not 503. | **Pass** — block E `CASE T5-15 PASS`; listed black-box cases Pass. |
| T5-16 | #5 c16, clock-change local times. E: `det` and `scd`. | Skipped and repeated times are flagged. The sample has none. | **Pass** — block E `CASE T5-16 PASS`; listed black-box cases Pass. |
| T5-17 ⚑ D2 | #5 c17, roster file. E: `rs`. Black box: H-503, H-503-ORDER, H-READ-EACH, H-PARSEABLE. | Missing, unreadable (tested as a directory) or non-JSON file gives 503 `roster-unavailable` with no path in the body, and startup does not fail. The file is re-read on each request. Field-level problems give `cannot-determine`. D2: whether `operators` absent or not an array may give 503. | **Pass** — block E `CASE T5-17 PASS`; H-503 (with D2 and D5), H-503-ORDER, H-READ-EACH, H-PARSEABLE Pass. |
| T5-18 | #5 c18, shared fixtures. E: `scd`, `cd` and `wb`. Black box: G-STATIC, H-FIXTURE-EQ. | `step-7.json` and `add-3.json` are tracked and equal the API bodies. | **Pass** — block E `CASE T5-18 PASS`; listed black-box cases Pass. |
| T5-19 | #5 c19, gates. | G-BUILD, G-LINT and G-TEST pass. | **Pass** — G-BUILD, G-LINT, G-TEST Pass. |

### Task validation criteria: #6 (T3), #7 (T4) and #8 (T5)

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| T6-01 | #6 c1, DST examples. E: `st`. | 18:00 → 05:00 across the spring-forward change is 10 h. 18:00 → 06:00 is 11 h. The other day pairs are 12 h. | **Pass** — block E `CASE T6-01 PASS`; listed black-box cases Pass. |
| T6-02 | #6 c2, DST property. E: `st`. | Elapsed time is the clock difference, less 1 h if and only if the span crosses the change. | **Pass** — block E `CASE T6-02 PASS`; listed black-box cases Pass. |
| T6-03 | #6 c3, off-duty boundary. E: `se`. | 11 h passes, 10 h 59 m fails, 0 h fails (and is not reported as an overlap). | **Pass** — block E `CASE T6-03 PASS`; listed black-box cases Pass. |
| T6-04 | #6 c4, qualification. E: `se`, each entry matched at least twice. | A shift on the `validThrough` date passes, including a night shift. The day after fails. A unit or role mismatch fails with no `validThrough`. | **Pass** — block E `CASE T6-04 PASS`; listed black-box cases Pass. |
| T6-05 | #6 c5, Step 3. E: `sce`. Black box: F-S3. | Luis has the one 3.1 finding of 0 h. Maya has none. | **Pass** — block E `CASE T6-05 PASS`; listed black-box cases Pass. |
| T6-06 | #6 c6, Step 4. E: `sce`. Black box: F-S4. | Maya has the one 3.1 finding of 10 h, not 11. | **Pass** — block E `CASE T6-06 PASS`; listed black-box cases Pass. |
| T6-07 | #6 c7, Step 6. E: `sce`. Black box: F-S6. | Priya has the one 3.3 finding. Dwayne has none. | **Pass** — block E `CASE T6-07 PASS`; listed black-box cases Pass. |
| T6-08 | #6 c8, all failures listed. E: `sce` and `se`. | Both the 3.1 and the 3.3 findings are listed, each under its own employee. | **Pass** — block E `CASE T6-08 PASS`; listed black-box cases Pass. |
| T6-09 | #6 c9, unchanged rest. E: `sce` and `se`. | A 3.1 finding the swap did not change has `changedBySwap:false`. | **Pass** — block E `CASE T6-09 PASS`; listed black-box cases Pass. |
| T6-10 | #6 c10, no approval path. E: `sce` and `cba`. Black box: F-S3. | The guidance names `VE-HSSE-PRC-021`. No approve, send, agree, submit or notify control. | **Pass** — block E `CASE T6-10 PASS`; listed black-box cases Pass. |
| T6-11 ⚑ D1 | #6 c11, "Step 1 still returns the 501". Superseded by #8. E: `sce` Step 1 test. Black box: F-S1. | If D1 is accepted: **Superseded**, with evidence that Step 1 gives 200 `approved-without-review` and no finding. If D1 is rejected: **Fail**. | **Superseded (D1)** — block E `CASE T6-11 PASS`; F-S1 200 `approved-without-review`, no finding. |
| T6-12 ◐ | #6 c12, web view. E: `cba` Step 4 and Step 3 tests. Live: L-S3, L-S4. | Maya's before figure is 10 h. The finding shows the name, the section, the figure and the swap's effect. Luis is the only employee failing. Partial: two of the c12 caveats are not asserted in `cba`; L-S4 covers them live. | **Pass** — block E `CASE T6-12 PASS`. Partial gap as stated (◐). Live L-S3, L-S4 Pass (BE). |
| T6-13 | #6 c13, [NFR-PRIV-001]. E: `lp`. | Scenario coverage and 0 personal data in the logs. | **Pass** — block E `CASE T6-13 PASS`; listed black-box cases Pass. |
| T6-14 | #6 c14, [NFR-A11Y-001]. E: `cba` for Steps 3, 4 and 6 and the unchanged-shift 3.3 view. | No axe violations. | **Pass** — block E `CASE T6-14 PASS`; listed black-box cases Pass. |
| T6-15 | #6 c15, unchanged-shift qualification. E: `se` and `sce`. | An expired kept shift within coverage is a finding with `changedBySwap:false`. Outside coverage it is not. | **Pass** — block E `CASE T6-15 PASS`; listed black-box cases Pass. |
| T6-16 | #6 c16, sample guard. E: `sg`. | Every operator's unswapped schedule yields 0 findings. | **Pass** — block E `CASE T6-16 PASS`; listed black-box cases Pass. |
| T6-17 | #6 c17, shared fixtures. E: `sce`, `cba` and `wb`. Black box: G-STATIC, H-FIXTURE-EQ. | `step-3.json`, `step-4.json` and `step-6.json` are tracked and equal the API bodies. | **Pass** — block E `CASE T6-17 PASS`; listed black-box cases Pass. |
| T6-18 | #6 c18, gates. | G-BUILD, G-LINT and G-TEST pass. | **Pass** — G-BUILD, G-LINT, G-TEST Pass. |
| T7-01 | #7 c1, windows. E: `sce` and `se`. Black box: F-S1 to F-S6 (22 windows each). | 22 windows from 03-01 to 03-22, none past `coverage.to`. | **Pass** — block E `CASE T7-01 PASS`; listed black-box cases Pass. |
| T7-02 | #7 c2, start-date attribution. E: `se`. | A night shift counts fully in the windows that hold its start date. | **Pass** — block E `CASE T7-02 PASS`; listed black-box cases Pass. |
| T7-03 | #7 c3, 72 h boundary. E: `se`. | 72 h 0 m gives no finding. 72 h 1 m gives exactly one. The property holds. | **Pass** — block E `CASE T7-03 PASS`; listed black-box cases Pass. |
| T7-04 ◐ | #7 c4, DST hours of `CDU-FLD1-0313-N`. E: `se`, `sce` and `cba`. Black box: F-S5 derivation. | `0313-N` is 11 h. Jerome's window 03-07..03-13 is 47 h, not 48. Partial: the API exposes window totals only, so the 11 h is derived. | **Pass** — block E `CASE T7-04 PASS`. Partial gap as stated (◐). F-S5 Pass (Jerome 47 h). |
| T7-05 | #7 c5, Step 5. E: `sce`. Black box: F-S5. | Tom has the one 3.2 finding of 84 h. Jerome has none. | **Pass** — block E `CASE T7-05 PASS`; listed black-box cases Pass. |
| T7-06 | #7 c6, unchanged window. E: `sce`, `se` and `cba`. | An 84 h window not changed by the swap is a finding with `changedBySwap:false`, and the UI says "not changed by this swap". | **Pass** — block E `CASE T7-06 PASS`; listed black-box cases Pass. |
| T7-07 ⚑ D1 | #7 c7, regressions of #6 c5, c6, c7, c15 and c16. E: union of T6-05/06/07/15/16. The last sentence (501) is under D1. | All mapped tests pass. The 501 sentence is Superseded (or Fail) per D1. | **Pass**; 501 sentence **Superseded (D1)** — block E `CASE T7-07 PASS` (T6-05/06/07/15/16 Pass). |
| T7-08 | #7 c8, windows table. E: `cba`. Live: L-S5. | An accessible table with a caption and three column headers, one row per window. Tom's 03-15..03-21 row shows 84 h and Changed. | **Pass** — block E `CASE T7-08 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T7-09 | #7 c9, [NFR-PRIV-001]. E: `lp`. | 0 personal data in the logs. | **Pass** — block E `CASE T7-09 PASS`; listed black-box cases Pass. |
| T7-10 | #7 c10, [NFR-A11Y-001]. E: `cba` for Step 5 and the unchanged-window view. | No axe violations. | **Pass** — block E `CASE T7-10 PASS`; listed black-box cases Pass. |
| T7-11 | #7 c11, shared fixture. E: `sce`. Black box: H-FIXTURE-EQ. | The API body for Step 5 equals `step-5.json`. The independently computed window figures match. | **Pass** — block E `CASE T7-11 PASS`; listed black-box cases Pass. |
| T7-12 | #7 c12, gates. | G-BUILD, G-LINT and G-TEST pass. | **Pass** — G-BUILD, G-LINT, G-TEST Pass. |
| T8-01 | #8 c1, trigger boundaries. E: `se`. | 12 h 0 m gives no trigger. 11 h 59 m gives a 4.2(a) trigger. 60 h 0 m gives no trigger. 60 h 1 m gives a 4.2(b) trigger. Unchanged triggers have `changedBySwap:false`. Triggers on both employees make one review. | **Pass** — block E `CASE T8-01 PASS`; listed black-box cases Pass. |
| T8-02 | #8 c2, Step 1. E: `scr`. Black box: F-S1. | `approved-without-review` with the figures in F-S1. Maya's untouched 12 h rest raises no trigger. | **Pass** — block E `CASE T8-02 PASS`; listed black-box cases Pass. |
| T8-03 | #8 c3, Step 2. E: `scr` and `rr`. Black box: F-S2. | `review-required` with Aisha's 11 h trigger only. Aisha 107 h after; Priya 72 / 71. No reviewing unit is named. ◐ "HCU only" is covered by absence of other units. | **Pass** — block E `CASE T8-03 PASS`; listed black-box cases Pass. |
| T8-04 | #8 c4, ADD-6. E: `scr` and `rr`. Black box: F-ADD6. | Tom's 4.2(b) trigger of 72 h, `changedBySwap:false`. | **Pass** — block E `CASE T8-04 PASS`; listed black-box cases Pass. |
| T8-05 | #8 c5, ADD-3 with the gate bypassed. E: `scr`. Black box: F-ADD3. | Called directly, the evaluator gives `approved-without-review`. The API gives `cannot-determine`. | **Pass** — block E `CASE T8-05 PASS`; listed black-box cases Pass. |
| T8-06 ◐ | #8 c6, precedence property. E: `se`. | Any finding gives `cannot-be-approved`. Otherwise any trigger gives `review-required`. Partial: the generator cannot produce 3.3 findings; covered by examples. | **Pass** — block E `CASE T8-06 PASS`. Partial gap as stated (◐). |
| T8-07 | #8 c7, symmetry. E: `sws` and `se`. Black box: H-SYM. | Both directions give the same outcome, findings and triggers. | **Pass** — block E `CASE T8-07 PASS`; listed black-box cases Pass. |
| T8-08 | #8 c8, sample sweep. E: `sws`. Black box: H-SWEEP. | Every pick gives 422 or one of the four outcomes. No 501 or 5xx. Not vacuous. | **Pass** — block E `CASE T8-08 PASS`; listed black-box cases Pass. |
| T8-09 | #8 c9, ADD-5. E: `rr`, `cba` and `sst`. Black box: F-ADD5, H-STATELESS. Live: L-ADD5. | No approve, send, agree, submit or notify control. Routes unchanged. Answers identical across instances. The roster is unchanged. | **Pass** — block E `CASE T8-09 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T8-10 | #8 c10, notices. E: `rr`. Live: L-ADD1. | The three notices and the export stamp appear in each view. | **Pass** — block E `CASE T8-10 PASS`; listed black-box cases Pass. Live part Pass (BE). |
| T8-11 ◐ | #8 c11, [NFR-PRIV-001]. E: `lp`. Black box: H-LOG. | The sweep's lines hold 0 personal data. Partial: there is no per-step test; this rests on the aggregate scan. | **Pass** — block E `CASE T8-11 PASS`; listed black-box cases Pass. Partial gap as stated (◐). |
| T8-12 | #8 c12, [NFR-A11Y-001]. E: `rr` and `csf`. | No axe violations for the approved and review views. | **Pass** — block E `CASE T8-12 PASS`; listed black-box cases Pass. |
| T8-13 | #8 c13, shared fixtures. E: `scr` and `sce`. Black box: H-FIXTURE-EQ. | `step-1.json`, `step-2.json` and `add-6.json` equal the API bodies, with no employee number in them. | **Pass** — block E `CASE T8-13 PASS`; listed black-box cases Pass. |
| T8-14 | #8 c14, gates. | G-BUILD, G-LINT and G-TEST pass. | **Pass** — G-BUILD, G-LINT, G-TEST Pass. |

### Feature "Left to task" items

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| LT-1 | Export age limit. E: `det` 26 h tests. Black box: H-AGE. | 26 h is not stale. One tick more is stale. | **Pass** — block E `CASE LT-1 PASS`; listed black-box cases Pass. |
| LT-2 ◐ | Horizon boundaries. E: `det` (T5-04 entries plus "one shift out"). | Give-side boundaries are exact. Partial: take-side boundaries are covered only by the property. | **Pass** — block E `CASE LT-2 PASS`. Partial gap as stated (◐). |
| LT-3 | Missing or malformed data gives `cannot-determine`. E: `scd` and `det`. Black box: H-PARSEABLE. | Each case names the field or record, with no name or employee number. | **Pass** — block E `CASE LT-3 PASS`; listed black-box cases Pass. |
| LT-4 | Production identity. E: `dev`, `rg` and `appw` production tests. Black box: H-PROD. | No dev route, no switcher and no identity headers in production. | **Pass** — block E `CASE LT-4 PASS`; listed black-box cases Pass. |

### NFRs

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| N-PRIV | [NFR-PRIV-001] task · integration. Union of T4-13, T4-19, T5-12, T6-13, T7-09 and T8-11, plus H-LOG and H-SWEEP-PRIV. | Every listed case passes. | **Pass** — T4-13, T4-19, T5-12, T6-13, T7-09, T8-11, H-LOG, H-SWEEP-PRIV all Pass. |
| N-A11Y | [NFR-A11Y-001] task · static-analysis. Union of T4-14, T4-19, T5-13, T6-14, T7-10 and T8-12. | Every listed case passes. Contrast is excluded (jsdom). | **Pass** — block E `CASE N-A11Y PASS`; T4-14, T4-19, T5-13, T6-14, T7-10, T8-12 all Pass. Contrast not evaluated (jsdom). |
| N-PERF | [NFR-PERF-001] feature-verification · load/performance. p95 ≤ 500 ms at 2 req/s for 10 min on staging. | **Blocked**: there is no staging environment. Owner: Marcus Ellery. No local substitute is counted. | Blocked |
| N-COMPAT1 | [NFR-COMPAT-001] feature-verification · live-procedure. Current Edge: L-EDGE plus L-S1 to L-S8. The previous major release has no environment. | Current Edge: the BE's result. Previous release: **Blocked**, owner Marcus Ellery. | Current Edge: **Pass (BE)** — L-EDGE and every L-case Pass in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date. Previous major release: **Blocked** (no environment), owner Marcus Ellery. |
| N-COMP | [NFR-COMP-001] n/a; guard only. T4-12, H-ROUTES, H-STATELESS, F-ADD5, G-STATIC (no database use, no writes) and G-POST. | Every listed case passes. This guards the n/a disposition; it is not a proof. Owner: Simone Arceneaux. | **Pass (guard)** — T4-12, H-ROUTES, H-STATELESS, F-ADD5, G-STATIC, G-POST all Pass. Owner: Simone Arceneaux. |

### Live cases, performed by the BE (Pending)

| ID | Procedure / Proof | Expected Result | Result |
| --- | --- | --- | --- |
| L-SETUP | The live procedure's setup section. | Both servers run. The Edge version is recorded and Edge reports it is up to date. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. Both servers ran. |
| L-S1 to L-S8 | Live procedure, steps 1–8. | As stated in each step. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. Each step's result, employee, rule and figures matched. L-S3, L-S4, L-S5: no "review required" or § 4.2 wording. L-S3 finding deferred (see the steps table). |
| L-ADD1, L-ADD2, L-ADD3, L-ADD5, L-ADD6 | Live procedure, additional checks. | As stated in each check. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-EDGE | [NFR-COMPAT-001] The live procedure in current Edge. | Every L-case passes in current Edge. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |

## Live procedure (performed by the BE in Microsoft Edge)

The verifier records nothing here as Pass. Every L-case stays `Pending (BE)` until the BE records the result.

Each step's pass condition is the feature doc's own:

- The result, the employee named, the rule and the figures all match the step's text (`feature-1-check-swap-by-hand.md`, Verification steps).
- Steps 3–6 also show the VE-HSSE-PRC-021 pointer and no approve control.

### Prerequisites

Any missing prerequisite makes the affected L-case `Blocked`.

- Probe blocks P–U are finished. No process is listening on ports 3000, 3917 or 5173.
- `npm ci` has been done (block A).
- The current Microsoft Edge release is installed. `edge://settings/help` says "Microsoft Edge is up to date".

### L-SETUP

1. Terminal 1, from the repository root:

   ```powershell
   $env:SHIFTSWAP_NOW="2027-03-07T14:00:00Z"; npm run dev:api
   ```

2. Terminal 2, from the repository root:

   ```powershell
   npm run dev:web
   ```

3. In Edge, open `http://localhost:5173`. Record the full version string from `edge://version`.
4. Use the **Act as** switcher to pick each operator named in a step. The role is `operator`.

### Steps

| ID | Act as | Pick | Expected on screen | BE result / notes |
| --- | --- | --- | --- | --- |
| L-S1 | Maya Thibodeaux | Give CDU-CON1-0318-N, take Luis Fontenot's CDU-CON1-0319-N | **Approved without review.** No § 3 failure or § 4.2 trigger for either employee. Maya: before 36 h, after 156 h, worst window 48 h. Luis: 48 h / 36 h / 48 h. No approve, send, agree or submit control. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-S2 | Aisha Okafor | Give HCU-CON2-0312-N, take Priya Raman's HCU-CON1-0310-D | **Review required**, § 4.2(a), for Aisha (11 h before). Aisha after **107 h**. Priya **72 h** before and **71 h** after. Neither fails § 3. Any reviewing unit named is HCU only. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-S3 | Maya Thibodeaux | Give CDU-CON1-0310-D, take Luis Fontenot's CDU-CON1-0312-D | **Cannot be approved**, § 3.1, **Luis Fontenot, 0 h**. Only Luis is named as failing. VE-HSSE-PRC-021 is shown. No approve control. *Observation (not a pass condition): record whether any "review required" or § 4.2 wording appears on this "cannot be approved" result.* | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. Observation: no "review required" or § 4.2 wording on the "cannot be approved" result. **BE finding (deferred):** the label "Changed by the swap" can be read as if the swap had been applied. Nothing was stored, and the step passes as written. No action for this gate. Revisit when Q25 is answered or when the result views are next redesigned, whichever comes first. Owner: Harlow Burgess. |
| L-S4 | Maya Thibodeaux | Give CDU-CON1-0310-D, take Dwayne Hebert's HCU-CON1-0314-D | **Cannot be approved**, § 3.1, **Maya, 10 h**. A figure of 11 h is a Fail. Dwayne passes (169 h / 47 h). VE-HSSE-PRC-021 is shown. No approve control. *Observation (not a pass condition): record whether any "review required" or § 4.2 wording appears on this "cannot be approved" result.* | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. Observation: no "review required" or § 4.2 wording on the "cannot be approved" result. |
| L-S5 | Tom Broussard | Give CDU-FLD1-0309-D, take Jerome Guidry's CDU-FLD1-0318-D | **Cannot be approved**, § 3.2, **Tom, 84 h in 15–21 Mar**. Windows 14–20 and 16–22 show 72 h. Jerome passes, and his 7–13 Mar window shows **47 h**. The window table reads sensibly as a table. VE-HSSE-PRC-021 is shown. No approve control. *Observation (not a pass condition): record whether any "review required" or § 4.2 wording appears on this "cannot be approved" result.* | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. Observation: no "review required" or § 4.2 wording on the "cannot be approved" result. |
| L-S6 | Priya Raman | Give HCU-CON1-0308-D, take Dwayne Hebert's HCU-CON1-0317-D | **Cannot be approved**, § 3.3, **Priya**: HCU/CONSOLE valid through 2027-03-15, shift starts 17 Mar. Dwayne passes. VE-HSSE-PRC-021 is shown. No approve control. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-S7 | Maya Thibodeaux, after restarting the API with `$env:SHIFTSWAP_NOW="2027-03-08T12:00:00Z"` | Repeat Step 1 | **Cannot determine**: the export is older than 26 h (28 h). No pass, fail or review conclusion. `exportedAt` and the notices are still shown. Restart the API with `2027-03-07T14:00:00Z` afterwards. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-S8 | Maya Thibodeaux | Give CDU-CON1-0318-N, take Nadia Trahan's FCC-CON1-0318-D | **Refused as outside the pilot units** (CDU and HCU only), naming the FCC shift. Not one of the four results, and no § 3 outcome. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-ADD1 | During L-S1, L-S2, L-S3, L-S7 and L-S8 | Pick view, each result view, refusal view | Each view shows: `exportedAt` 2027-03-07T08:00Z (02:00 on 7 Mar site time); "only rostered shifts are counted"; the pilot-scope notice (CDU and HCU only, holdovers not assessed). | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-ADD2 | Maya, then Luis Fontenot | The give list and the take list | The give list holds only the current user's shifts. The other employee's shifts are on the take side, named by owner. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-ADD3 | Jerome Guidry | Give CDU-FLD1-0318-D, take Luis Fontenot's CDU-CON1-0326-D | **Cannot determine**, naming the 26 Mar shift as outside the determinable range. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-ADD5 | After L-S1 to L-S6, restart the API (clock `2027-03-07T14:00:00Z`) and the web app. Open as Maya, then Luis, then Priya. | — | No history of earlier checks. No pending request or notification for anyone. No approve, send, agree or submit control on any result, including approved without review. Every "cannot be approved" result points to VE-HSSE-PRC-021. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-ADD6 | Tom Broussard. Q25 is still Open (`prd.md:732`). | Give CDU-FLD1-0309-D, take Jerome Guidry's CDU-FLD1-0311-D | **Review required**, with the 15–21 Mar window (72 h) labelled as not changed by this swap. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |
| L-EDGE | [NFR-COMPAT-001] | All the above in current Edge | Every L-case passes in the recorded Edge version. | **Pass (BE)** — Harlow Burgess, in Edge 157.0.4341.60 (Official build) (64-bit), reported up to date, at `b60a56d`. |

## Exit criteria and tester record

The gate is supported only when all of these hold:

- Every automated case is `Pass`.
- Every ⚑ case is resolved as the BE decided.
- Every L-case is recorded `Pass` by the BE.

`Blocked` cases are residual risk and do not count as Pass:

| Case | Blocked by | Owner |
| --- | --- | --- |
| N-PERF | No staging environment | Marcus Ellery |
| N-COMPAT1, previous Edge release | No environment for it | Marcus Ellery |

Any `Fail` closes the gate. Each partial case (◐) states what it does not prove; its result is set on its own evidence and the gap is listed.

| Record | Fill in |
| --- | --- |
| Tester / UTC timestamp | Automated blocks: Neo Verification Loop agent, run for Harlow Burgess; run 2 on 2026-11-19 00:5x UTC. Live procedure: Harlow Burgess (BE), in Edge, at `b60a56d`; results recorded 2026-11-19T03:54Z. |
| Source SHA / branch / local modifications | Run 2: `b60a56dd76661f80bedbb62f589a5e6ff441b838`, `feature/3-check-swap-by-hand`; only local change: this plan (untracked); unchanged after block V. Earlier pin `a137e48` is stale (see Run 1 history). |
| Script SHA-256 (`probe.mjs`, `e-check.mjs`) | Run 2: `probe.mjs` 13084165BDF8608BFF7C7FC74C23FE5DF8A4264B413668C1C44313B79D4EB351 (H-503 dev/users expectation per D5); `e-check.mjs` 08A43509CC82EFC51B2F3BF29A8296B7D3CF796C752F6CF7B2EF4C7BCAA0977B. Run 1 hashes: 884E1873…A8F8 and 1921126B…C62B, then 08A43509…977B. |
| Environment: OS, Node, npm, Edge version; identity headers from the sample roster (no secrets) | Windows NT 10.0.26200, Node v24.19.0, npm 12.0.2, PowerShell 7.6.10. Live: Microsoft Edge 157.0.4341.60 (Official build) (64-bit), reported up to date (BE). Identity: sample-roster headers via the Act as switcher only; no secrets. |
| BE decisions D1 to D5 | D1 superseded by #8; D2 the 503 is accepted (dev/users wording updated under D5); D3 informational (all before run 1). D4 Z-PIN expectation corrected for the stacked pull requests; D5 H-503 mis-documented, AGENTS.md corrected at `b60a56d` (both after run 1). All by Harlow Burgess. |
| Per case result, expected vs actual | See the Result column. Run 2: every automated gate case Pass. Live (BE): L-SETUP, L-S1 to L-S8, L-ADD1, L-ADD2, L-ADD3, L-ADD5, L-ADD6, L-EDGE all Pass; no "review required" or § 4.2 wording on L-S3, L-S4, L-S5. Informational Fail: H-START-DEV-EXIT (D3). Superseded (D1): T4-07, T6-11, and the 501 parts of T4-13, T5-03, T7-07. Blocked: N-PERF, N-COMPAT1 previous Edge. Run 1 Fails (Z-PIN, H-503) are kept in their cells and in Run 1 history. |
| Automated evidence: block, exit code, selected / passed / failed / skipped, log path | Log dir `C:\Users\HarlowBurgess\.copilot\session-state\27c57277-ba7c-4818-87a1-fd1230133421\files\evidence\b60a56d`. 0: 0. A: 0 (`npm-ci.log`). B: 0 (`build.log`). C: 0 (`lint.log`). D: 0 — 955 selected / 955 passed / 0 failed / 0 skipped (`vitest.json`, `vitest.log`). E: 0 — 83 CASE PASS, 0 other (`e-check.log`). F: 0. G: 0. P: 0. Q: 0. R: 0. S: 0 (`sweep-summary.json`). T: **1** (H-START-DEV-EXIT only, D3). U: 0. V: 0 (`ignored.txt`). Per-block output `block-<X>.out`; probe results `probe-<G>.json`. |
| Blockers and residual risk, each with an owner | N-PERF (NFR-PERF-001) Blocked, no staging: Marcus Ellery. N-COMPAT1 (NFR-COMPAT-001) previous major Edge release Blocked, no environment: Marcus Ellery. N-COMP (NFR-COMP-001) n/a, guard only: Simone Arceneaux. Partial gaps (◐ T5-04, T6-12, T7-04, T8-06, T8-11, LT-2): Harlow Burgess. H-START-DEV-EXIT informational (D3): `npm run dev:api` does not exit on a bad `SHIFTSWAP_NOW`: Harlow Burgess. BE finding from L-S3, "Changed by the swap" label wording, deferred until Q25 is answered or the result views are redesigned: Harlow Burgess. |
| Run 1 history (`a137e48`, **stale**) | Evidence `C:\Users\HarlowBurgess\.copilot\session-state\27c57277-ba7c-4818-87a1-fd1230133421\files\evidence\a137e48`. Exit codes: 0, A, B, C, D, F, G, P, Q, S, U, V were 0; E was 1, then 0 after the BE-approved MAP correction (T6-14, T7-10, T8-06 titles); R was 1 (H-503); T was 1 (H-START-DEV-EXIT only, D3). D: 955 selected / 955 passed / 0 failed / 0 skipped. **Original Fails, kept on record:** Z-PIN — the base of PRs #11 to #14 was a stacked session branch, not `feature/3-check-swap-by-hand` (check corrected under D4; not returned to the builder). H-503 — `GET /api/dev/users` gave 200 with the two supervisors, not `{users:[]}`, for the `operators:{}` and no-`operators` rosters (expectation corrected under D5: mis-documented, not mis-built). All other automated cases Pass; the D1 cases Superseded. |
| Gate verdict | **Supported on evidence, subject to accepting residual risk.** Every required automated case and every L-case is Pass at `b60a56d`; no Fail stands in run 2. Not proven, and not counted as Pass: NFR-PERF-001 and the previous-Edge half of NFR-COMPAT-001 (Blocked, owner Marcus Ellery). The merge decision belongs to the BE. |

## References and limitations

**References**

- The spec: `docs/design/requirements/shift-swap-pilot/feature-1-check-swap-by-hand.md`.
- The task issues #4–#8, and the NFR coverage matrix comment on #3.
- `docs/design/quality/nfr-register.md`.
- `docs/design/requirements/shift-swap-pilot/prd.md:732` (Q25, Open).
- `AGENTS.md` (Environments; the roster path and clock semantics).

**What the evidence does not prove**

- **Contrast.** jsdom does not run axe-core's colour-contrast rules. A11Y-001 contrast is seen only by eye in L-EDGE; no contrast measurement is made.
- **Performance.** PERF-001 is not measured. With no staging there is no local substitute, and no local timing is counted.
- **Previous Edge release.** Not tested (COMPAT-001), and COMPAT-002 is waived.
- **Route surface.** H-ROUTES probes a sample of methods and paths. The complete route set is proven by the `rg` tests, which read the registered route table.
- **"Unreadable" roster file.** Tested as a directory, not as a permission-denied file.
- **Both shifts outside the pilot, and FCC beyond the horizon.** Neither can be reproduced on the sample roster: all four FCC shifts are Nadia's. This evidence is test-only (T4-05, T5-06, T5-10).
- **Take-side horizon boundaries.** Partial (LT-2, T5-04).
- **Fixtures.** The fixtures are builder artifacts. H-FIXTURE-EQ proves that the API and fixtures agree, not that the fixtures are right. The independent figures come from the feature doc and are checked in F-S1 to F-S6 and F-ADD6.
- **Log level.** The probe API runs at the default `info` log level. The trace-level capture is the `lp` test (#4 c13).
- **Superseded 501.** The interim-501 criteria in #4, #5, #6 and #7 conflict with #8, which removed the 501. See D1.
- **Stale documentation.**
  - The feature doc's What section speaks of "two notices". #8 c10 and the code carry three. The plan follows #8.
  - #5 c17's wording and AGENTS.md differ on `operators`. See D2 and D5.
- **Partial cases.** T4-05, T5-06, T6-12, T7-04, T8-03, T8-06 and T8-11 are partial, as noted in their rows.

## Appendix A — probe.mjs

Run it as `node probe.mjs <P|Q|R|S|T|U> <repo> <evidenceDir>`. It uses Node built-ins only.

What it prints:

- One `CASE <id> PASS|FAIL <detail>` line per check. Some IDs repeat, for example H-PORT, which is checked once per API process.
- Then one `RESULT <id> PASS|FAIL` line per case. A case is `FAIL` if any of its checks failed, or if it never ran.

The `RESULT` line is the value recorded in the matrix. Every check is also written to `probe-<G>.json`.

Some figures are computed by the probe itself; these are the verifier's own arithmetic, not the API's:

- the sweep's pick count
- the wall-clock length of Jerome's shifts in F-S5
- the expected reason for H-CLOCK-UNSET

<!-- probe.mjs:begin -->
```js
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const [, , G, REPO, EV] = process.argv;
if (!G || !REPO || !EV) {
  console.error("usage: node probe.mjs <P|Q|R|S|T|U> <repo> <evidenceDir>");
  process.exit(2);
}
const PORT = 3917;
const BASE = `http://127.0.0.1:${PORT}`;
const API_DIR = path.join(REPO, "apps", "api");
const FIX = path.join(REPO, "fixtures", "responses");
const ROSTER = JSON.parse(fs.readFileSync(path.join(REPO, "data", "roster.sample.json"), "utf8"));
const fx = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `${n}.json`), "utf8"));
const NOW_OK = "2027-03-07T14:00:00Z";
const PEOPLE = [...ROSTER.operators, ...ROSTER.supervisors];
const NUMS = PEOPLE.map((p) => p.employeeNumber);
const NAMES = PEOPLE.map((p) => p.name);
const SURNAMES = NAMES.map((n) => n.split(" ").slice(-1)[0]);
const OUTCOMES = ["approved-without-review", "review-required", "cannot-be-approved", "cannot-determine"];
const nameOf = (num) => PEOPLE.find((p) => p.employeeNumber === num)?.name;
const numRe = (n) => new RegExp(`(?<![\\d.])${n}(?!\\d)`);
const numbersIn = (s) => NUMS.filter((n) => numRe(n).test(s));
const namesIn = (s) => [...NAMES, ...SURNAMES].filter((n) => s.includes(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(id, ok, detail) {
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  results.push({ id, result: ok ? "PASS" : "FAIL", detail: d });
  console.log(`CASE ${id} ${ok ? "PASS" : "FAIL"} ${d.length > 1500 ? d.slice(0, 1500) + "…" : d}`);
}

function cleanEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!["SHIFTSWAP_NOW", "SHIFTSWAP_ROSTER_PATH", "NODE_ENV", "PORT"].includes(k.toUpperCase())) env[k] = v;
  }
  env.PORT = String(PORT);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) env[k] = v;
  return env;
}

function portAccepting() {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port: PORT });
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function startApi(tag, extra) {
  if (await portAccepting()) throw new Error(`port ${PORT} is busy before ${tag}`);
  const out = fs.openSync(path.join(EV, `api-${tag}.out.log`), "w");
  const err = fs.openSync(path.join(EV, `api-${tag}.err.log`), "w");
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: API_DIR, env: cleanEnv(extra), stdio: ["ignore", out, err], windowsHide: true,
  });
  let exited = null;
  const exitP = new Promise((res) => child.once("exit", (code, signal) => { exited = { code, signal }; res(exited); }));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !exited) {
    try {
      const r = await fetch(`${BASE}/api/healthz`);
      await r.text();
      if (r.status === 200) return { tag, child, exitP, out, err };
    } catch { /* not listening yet */ }
    await sleep(200);
  }
  child.kill();
  await exitP;
  fs.closeSync(out);
  fs.closeSync(err);
  throw new Error(`API ${tag} did not become healthy within 30 s: ${JSON.stringify(exited)}`);
}

async function stopApi(api) {
  api.child.kill();
  await api.exitP;
  fs.closeSync(api.out);
  fs.closeSync(api.err);
  let free = false;
  for (let i = 0; i < 20 && !free; i++) {
    free = !(await portAccepting());
    if (!free) await sleep(250);
  }
  check("H-PORT", free, `after api-${api.tag}`);
}

async function withApi(tag, extra, fn) {
  const api = await startApi(tag, extra);
  try { await fn(); } finally { await stopApi(api); }
}

let recording = null;
async function req(method, p, { headers = {}, body } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + p, init);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  if (recording) recording.push({ method, path: p, headers, body, status: r.status, text });
  return { status: r.status, text, json };
}
const ID = (num, roles = "operator") => ({ "X-Employee-Number": num, "X-Roles": roles });
const swap = (num, give, take, roles) =>
  req("POST", "/api/swap-checks", { headers: ID(num, roles), body: { giveShiftId: give, takeShiftId: take } });
const PICK = {
  S1: ["104417", "CDU-CON1-0318-N", "CDU-CON1-0319-N"],
  S2: ["106640", "HCU-CON2-0312-N", "HCU-CON1-0310-D"],
  S3: ["104417", "CDU-CON1-0310-D", "CDU-CON1-0312-D"],
  S4: ["104417", "CDU-CON1-0310-D", "HCU-CON1-0314-D"],
  S5: ["103078", "CDU-FLD1-0309-D", "CDU-FLD1-0318-D"],
  S6: ["107903", "HCU-CON1-0308-D", "HCU-CON1-0317-D"],
  S8: ["104417", "CDU-CON1-0318-N", "FCC-CON1-0318-D"],
  ADD3: ["108529", "CDU-FLD1-0318-D", "CDU-CON1-0326-D"],
  ADD6: ["103078", "CDU-FLD1-0309-D", "CDU-FLD1-0311-D"],
};
const run = (k) => swap(...PICK[k]);

const emp = (b, name) => b?.employees?.find((e) => e.name === name);
const allFindings = (b) => (b?.employees ?? []).flatMap((e) => (e.findings ?? []).map((f) => ({ name: e.name, ...f })));
const allTriggers = (b) => (b?.employees ?? []).flatMap((e) => (e.triggers ?? []).map((t) => ({ name: e.name, ...t })));
const win = (e, from) => e?.windows?.find((w) => w.from === from);
const worstContaining = (e, date) => Math.max(...(e?.windows ?? []).filter((w) => w.from <= date && date <= w.to).map((w) => w.hours));
const hm = (o, h) => o?.hours === h && o?.minutes === 0;
const noIssues = (e) => Array.isArray(e?.findings) && e.findings.length === 0;
const subset = (o, part) => Object.entries(part).every(([k, v]) => isDeepStrictEqual(o?.[k], v));
function keysOf(v, acc = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { acc.add(k); keysOf(x, acc); }
  return acc;
}
const summarize = (x) => JSON.stringify({
  status: x.status, outcome: x.json?.outcome, kind: x.json?.kind, reasons: x.json?.reasons,
  employees: x.json?.employees?.map((e) => ({
    name: e.name, before: e.offDutyBefore?.hours, after: e.offDutyAfter?.hours,
    findings: (e.findings ?? []).map((f) => `${f.rule}:${f.hours ?? f.shiftId}:${f.from ?? ""}`),
    triggers: (e.triggers ?? []).map((t) => `${t.rule}:${t.hours}:${t.from}:${t.changedBySwap}`),
  })),
});

// ---------------- P ----------------
async function groupP() {
  const api = await startApi("p", { SHIFTSWAP_NOW: NOW_OK });
  const PREQ = [];
  recording = PREQ;
  try {
    let x = await req("GET", "/api/healthz");
    check("H-HEALTH", x.status === 200 && x.json?.status === "ok", `${x.status} ${x.text}`);

    const s1Body = { giveShiftId: PICK.S1[1], takeShiftId: PICK.S1[2] };
    const identCases = [
      ["no headers", {}, 401, undefined],
      ["number only", { "X-Employee-Number": "104417" }, 401, undefined],
      ["roles only", { "X-Roles": "operator" }, 401, undefined],
      ["roles shift-supervisor", ID("104417", "shift-supervisor"), 403, "role-not-permitted"],
      ["supervisor 100231 as operator", ID("100231"), 403, "not-a-roster-operator"],
      ["unknown 999999", ID("999999"), 403, "not-a-roster-operator"],
      ["roles 'operator, shift-supervisor'", ID("104417", "operator, shift-supervisor"), 200, undefined],
    ];
    for (const [label, h, st, code] of identCases) {
      for (const [route, go] of [
        ["GET /api/shifts", () => req("GET", "/api/shifts", { headers: h })],
        ["POST /api/swap-checks", () => req("POST", "/api/swap-checks", { headers: h, body: s1Body })],
      ]) {
        x = await go();
        const ok = x.status === st && (code === undefined || x.json?.code === code) && (st !== 401 || x.json?.kind === "unauthenticated");
        check("H-IDENT", ok, `${route} ${label}: ${x.status} ${x.text.slice(0, 200)}`);
      }
    }

    const shiftsOf = (num) => ROSTER.shifts.filter((s) => s.employeeNumber === num).map((s) => s.shiftId).sort();
    const B = {};
    for (const num of ["104417", "102286"]) {
      x = await req("GET", "/api/shifts", { headers: ID(num) });
      B[`shifts-${num}`] = x;
      const b = x.json ?? {};
      const give = (b.give ?? []).map((s) => s.shiftId).sort();
      const take = b.take ?? [];
      const takeOk = take.length === ROSTER.shifts.length - give.length && take.every((t) => {
        const s = ROSTER.shifts.find((q) => q.shiftId === t.shiftId);
        return s !== undefined && s.employeeNumber !== num && t.ownerName === nameOf(s.employeeNumber) && !("employeeNumber" in t);
      });
      const ok = x.status === 200 && isDeepStrictEqual(give, shiftsOf(num)) && takeOk &&
        (num !== "104417" || take.some((t) => t.shiftId === "FCC-CON1-0318-D")) &&
        numbersIn(x.text).length === 0 && b.exportedAt === ROSTER.exportedAt && b.siteTimeZone === ROSTER.site.timeZone;
      check("F-ADD2", ok, `${num}: ${x.status} give ${give.length} take ${take.length} numbers [${numbersIn(x.text)}] exportedAt ${b.exportedAt}`);
    }

    for (const k of ["S1", "S2", "S3", "S4", "S5", "S6", "S8", "ADD3", "ADD6"]) B[k] = await run(k);

    {
      const b = B.S1.json; const m = emp(b, "Maya Thibodeaux"); const l = emp(b, "Luis Fontenot");
      check("F-S1", B.S1.status === 200 && b?.outcome === "approved-without-review" && allFindings(b).length === 0 &&
        allTriggers(b).length === 0 && hm(m?.offDutyBefore, 36) && hm(m?.offDutyAfter, 156) && hm(l?.offDutyBefore, 48) &&
        hm(l?.offDutyAfter, 36) && worstContaining(m, "2027-03-19") === 48 && worstContaining(l, "2027-03-18") === 48 &&
        b?.guidance === fx("step-1").guidance, summarize(B.S1));
    }
    {
      const b = B.S2.json; const a = emp(b, "Aisha Okafor"); const p = emp(b, "Priya Raman"); const tr = allTriggers(b);
      const badKeys = [...keysOf(b)].filter((k) => /unit|review/i.test(k));
      check("F-S2", B.S2.status === 200 && b?.outcome === "review-required" && allFindings(b).length === 0 && tr.length === 1 &&
        tr[0].name === "Aisha Okafor" && tr[0].rule === "4.2(a)" && hm(tr[0], 11) && hm(a?.offDutyBefore, 11) &&
        hm(a?.offDutyAfter, 107) && hm(p?.offDutyBefore, 72) && hm(p?.offDutyAfter, 71) && hm(win(a, "2027-03-14"), 60) &&
        badKeys.length === 0, `${summarize(B.S2)} unit/review keys [${badKeys}]`);
    }
    {
      const b = B.S3.json; const f = allFindings(b); const m = emp(b, "Maya Thibodeaux");
      check("F-S3", B.S3.status === 200 && b?.outcome === "cannot-be-approved" && f.length === 1 && f[0].name === "Luis Fontenot" &&
        f[0].rule === "3.1" && hm(f[0], 0) && noIssues(m) && (m?.triggers ?? [null]).length === 0 &&
        String(b?.guidance).includes("VE-HSSE-PRC-021"), summarize(B.S3));
    }
    {
      const b = B.S4.json; const f = allFindings(b); const m = emp(b, "Maya Thibodeaux"); const d = emp(b, "Dwayne Hebert");
      check("F-S4", B.S4.status === 200 && b?.outcome === "cannot-be-approved" && f.length === 1 && f[0].name === "Maya Thibodeaux" &&
        f[0].rule === "3.1" && hm(f[0], 10) && hm(m?.offDutyAfter, 49) && noIssues(d) && hm(d?.offDutyBefore, 169) &&
        hm(d?.offDutyAfter, 47), summarize(B.S4));
    }
    {
      const b = B.S5.json; const f = allFindings(b); const t = emp(b, "Tom Broussard"); const j = emp(b, "Jerome Guidry");
      const wall = (s) => (Date.parse(`${s.end}:00Z`) - Date.parse(`${s.start}:00Z`)) / 3.6e6;
      const inWin = (s) => s.start.slice(0, 10) >= "2027-03-07" && s.start.slice(0, 10) <= "2027-03-13";
      const jShifts = ROSTER.shifts.filter((s) => (s.employeeNumber === "108529" && s.shiftId !== PICK.S5[2]) || s.shiftId === PICK.S5[1]).filter(inWin);
      const wallSum = jShifts.reduce((a, s) => a + wall(s), 0);
      const n13 = jShifts.find((s) => s.shiftId.endsWith("-0313-N"));
      const derived = n13 !== undefined && n13.start === "2027-03-13T18:00" && n13.end === "2027-03-14T06:00" && wallSum - 1 === 47;
      check("F-S5", B.S5.status === 200 && b?.outcome === "cannot-be-approved" && f.length === 1 && f[0].name === "Tom Broussard" &&
        f[0].rule === "3.2" && f[0].from === "2027-03-15" && f[0].to === "2027-03-21" && hm(f[0], 84) &&
        hm(win(t, "2027-03-14"), 72) && hm(win(t, "2027-03-16"), 72) && noIssues(j) && hm(j?.offDutyBefore, 156) &&
        hm(j?.offDutyAfter, 36) && hm(win(j, "2027-03-07"), 47) && derived,
        `${summarize(B.S5)} jerome 03-07..03-13 shifts [${jShifts.map((s) => s.shiftId)}] wallSum ${wallSum}`);
    }
    {
      const b = B.S6.json; const f = allFindings(b); const d = emp(b, "Dwayne Hebert");
      check("F-S6", B.S6.status === 200 && b?.outcome === "cannot-be-approved" && f.length === 1 && f[0].name === "Priya Raman" &&
        subset(f[0], { rule: "3.3", shiftId: "HCU-CON1-0317-D", unit: "HCU", role: "CONSOLE", shiftStartDate: "2027-03-17",
          validThrough: "2027-03-15", changedBySwap: true }) && noIssues(d) && hm(d?.offDutyBefore, 120) && hm(d?.offDutyAfter, 96),
        `${summarize(B.S6)} ${JSON.stringify(f[0])}`);
    }
    check("F-S8", B.S8.status === 422 && isDeepStrictEqual(B.S8.json,
      { kind: "refused", reasons: [{ code: "outside-pilot-units", shiftId: "FCC-CON1-0318-D", unit: "FCC" }] }), `${B.S8.status} ${B.S8.text}`);
    check("F-ADD3", B.ADD3.status === 200 && isDeepStrictEqual(B.ADD3.json, fx("add-3")) && !B.ADD3.text.includes(PICK.ADD3[1]),
      `${B.ADD3.status} ${B.ADD3.text}`);
    {
      const b = B.ADD6.json; const tr = allTriggers(b);
      check("F-ADD6", B.ADD6.status === 200 && b?.outcome === "review-required" && allFindings(b).length === 0 && tr.length === 1 &&
        tr[0].name === "Tom Broussard" && tr[0].rule === "4.2(b)" && tr[0].from === "2027-03-15" && tr[0].to === "2027-03-21" &&
        hm(tr[0], 72) && tr[0].changedBySwap === false, summarize(B.ADD6));
    }

    const ownCases = [
      ["give another operator's shift", ["104417", "CDU-CON1-0319-N", "CDU-CON1-0312-D"], 403, { kind: "forbidden", code: "give-shift-not-yours" }],
      ["give an unknown shift", ["104417", "NOPE-0000-X", "CDU-CON1-0319-N"], 403, { kind: "forbidden", code: "give-shift-not-yours" }],
      ["give equal to take", ["104417", "CDU-CON1-0318-N", "CDU-CON1-0318-N"], 422, { kind: "refused", reasons: [{ code: "take-shift-is-own", shiftId: "CDU-CON1-0318-N" }] }],
      ["take one's own shift", ["104417", "CDU-CON1-0318-N", "CDU-CON1-0310-D"], 422, { kind: "refused", reasons: [{ code: "take-shift-is-own", shiftId: "CDU-CON1-0310-D" }] }],
      ["take an unknown shift", ["104417", "CDU-CON1-0318-N", "NOPE-0000-Y"], 422, { kind: "refused", reasons: [{ code: "unknown-shift", shiftId: "NOPE-0000-Y" }] }],
    ];
    for (const [label, pick, st, want] of ownCases) {
      x = await swap(...pick);
      check("H-OWN", x.status === st && isDeepStrictEqual(x.json, want), `${label}: ${x.status} ${x.text}`);
    }
    x = await swap("109364", "FCC-CON1-0318-D", "CDU-CON1-0319-N");
    check("H-REFUSE-GIVE", x.status === 422 && isDeepStrictEqual(x.json,
      { kind: "refused", reasons: [{ code: "outside-pilot-units", shiftId: "FCC-CON1-0318-D", unit: "FCC" }] }), `${x.status} ${x.text}`);

    B["dev-users"] = await req("GET", "/api/dev/users");
    {
      const u = B["dev-users"].json?.users ?? [];
      const ops = u.filter((p) => p.roles?.includes("operator")).length;
      const sups = u.filter((p) => p.roles?.includes("shift-supervisor")).length;
      check("H-DEV", B["dev-users"].status === 200 && isDeepStrictEqual(B["dev-users"].json, fx("dev-users")) && u.length === 10 &&
        ops === 8 && sups === 2, `${B["dev-users"].status} users ${u.length} operators ${ops} supervisors ${sups}`);
    }

    const routeProbes = [];
    for (const p of ["/api/healthz", "/api/shifts", "/api/swap-checks", "/api/dev/users"]) {
      for (const m of ["PUT", "PATCH", "DELETE"]) routeProbes.push([m, p]);
    }
    routeProbes.push(["POST", "/api/shifts"]);
    for (const p of ["/api/swaps", "/api/requests", "/api/approvals", "/api/notifications", "/api/history", "/api/swap-checks/1"]) {
      routeProbes.push(["GET", p]);
    }
    for (const [m, p] of routeProbes) {
      x = await req(m, p, { headers: ID("104417") });
      check("H-ROUTES", x.status === 404, `${m} ${p}: ${x.status}`);
    }

    for (const k of ["S1", "S2", "S3", "ADD3", "ADD6"]) {
      x = await run(k);
      check("H-STATELESS", x.status === B[k].status && x.text === B[k].text, `${k}: repeat ${x.status}, identical ${x.text === B[k].text}`);
    }

    const fixturePairs = [["step-1", "S1"], ["step-2", "S2"], ["step-3", "S3"], ["step-4", "S4"], ["step-5", "S5"], ["step-6", "S6"],
      ["step-8", "S8"], ["add-3", "ADD3"], ["add-6", "ADD6"], ["shifts-104417", "shifts-104417"], ["shifts-102286", "shifts-102286"],
      ["dev-users", "dev-users"]];
    for (const [f, k] of fixturePairs) {
      check("H-FIXTURE-EQ", isDeepStrictEqual(B[k].json, fx(f)), `${f}.json vs ${k}: ${isDeepStrictEqual(B[k].json, fx(f))}`);
    }
  } finally {
    recording = null;
    fs.writeFileSync(path.join(EV, "p-bodies.json"), JSON.stringify(PREQ, null, 2));
    await stopApi(api);
  }
}
// ---------------- Q ----------------
async function groupQ() {
  await withApi("q-stale", { SHIFTSWAP_NOW: "2027-03-08T12:00:00Z" }, async () => {
    const s7 = await run("S1");
    check("F-S7", s7.status === 200 && isDeepStrictEqual(s7.json, fx("step-7")) && !("employees" in (s7.json ?? {})) &&
      !("guidance" in (s7.json ?? {})), `${s7.status} ${s7.text}`);
    const a3 = await run("ADD3");
    check("H-ADD3-STALE", a3.status === 200 && isDeepStrictEqual(a3.json, fx("cannot-determine-stale-and-horizon")) &&
      isDeepStrictEqual(a3.json?.reasons?.map((r) => r.code), ["export-stale", "shift-outside-horizon"]), `ADD-3: ${a3.status} ${a3.text}`);
    const s8 = await run("S8");
    check("H-ADD3-STALE", s8.status === 422 && isDeepStrictEqual(s8.json, fx("step-8")), `Step 8: ${s8.status} ${s8.text}`);
  });
  await withApi("q-age-26h", { SHIFTSWAP_NOW: "2027-03-08T10:00:00Z" }, async () => {
    const x = await run("S1");
    check("H-AGE", x.status === 200 && x.json?.outcome === "approved-without-review", `at 26 h: ${x.status} ${x.json?.outcome}`);
  });
  await withApi("q-age-26h1s", { SHIFTSWAP_NOW: "2027-03-08T10:00:01Z" }, async () => {
    const x = await run("S1");
    check("H-AGE", x.status === 200 && x.json?.outcome === "cannot-determine" &&
      isDeepStrictEqual(x.json?.reasons?.map((r) => r.code), ["export-stale"]), `at 26 h 1 s: ${x.status} ${x.text}`);
  });
  await withApi("q-now-before", { SHIFTSWAP_NOW: "2027-03-07T07:59:59Z" }, async () => {
    const x = await run("S1");
    check("H-NOW", x.status === 200 && isDeepStrictEqual(x.json, fx("cannot-determine-now-before-export")), `07:59:59Z: ${x.status} ${x.text}`);
  });
  await withApi("q-now-equal", { SHIFTSWAP_NOW: "2027-03-07T08:00:00Z" }, async () => {
    const x = await run("S1");
    check("H-NOW", x.status === 200 && x.json?.outcome === "approved-without-review", `08:00:00Z: ${x.status} ${x.json?.outcome}`);
  });
  await withApi("q-unset", {}, async () => {
    const x = await run("S1");
    const t = Date.now();
    const exp = Date.parse(ROSTER.exportedAt);
    const want = t < exp ? "now-before-export" : t - exp > 26 * 3600e3 ? "export-stale" : null;
    const ok = want === null
      ? x.status === 200 && x.json?.outcome === "approved-without-review"
      : x.status === 200 && x.json?.outcome === "cannot-determine" && (x.json?.reasons ?? []).some((r) => r.code === want);
    check("H-CLOCK-UNSET", ok, `system now ${new Date(t).toISOString()}, expected ${want ?? "determinable"}: ${x.status} ${x.text.slice(0, 400)}`);
  });
  await withApi("q-replay", { SHIFTSWAP_NOW: NOW_OK }, async () => {
    const prior = JSON.parse(fs.readFileSync(path.join(EV, "p-bodies.json"), "utf8"));
    const diffs = [];
    for (const r of prior) {
      const x = await req(r.method, r.path, { headers: r.headers, body: r.body ?? undefined });
      if (x.status !== r.status || x.text !== r.text) diffs.push(`${r.method} ${r.path} ${JSON.stringify(r.body ?? null)}: ${r.status}->${x.status}`);
    }
    check("F-ADD5", prior.length > 0 && diffs.length === 0, `replayed ${prior.length}, differing ${diffs.length} ${diffs.slice(0, 10).join("; ")}`);
  });
}

// ---------------- R ----------------
async function groupR() {
  await withApi("r-prod", { SHIFTSWAP_NOW: NOW_OK, NODE_ENV: "production" }, async () => {
    for (const [label, h] of [["no headers", {}], ["identity", ID("104417")]]) {
      const x = await req("GET", "/api/dev/users", { headers: h });
      check("H-PROD", x.status === 404 && numbersIn(x.text).length === 0 && namesIn(x.text).length === 0, `dev/users ${label}: ${x.status} ${x.text}`);
    }
    const sh = await req("GET", "/api/shifts", { headers: ID("104417") });
    check("H-PROD", sh.status === 200, `shifts: ${sh.status}`);
    const s1 = await run("S1");
    check("H-PROD", s1.status === 200 && s1.json?.outcome === "approved-without-review", `Step 1: ${s1.status} ${s1.json?.outcome}`);
  });

  const RD = path.join(EV, "rosters");
  fs.rmSync(RD, { recursive: true, force: true });
  fs.mkdirSync(RD, { recursive: true });
  const { operators: _drop, ...noOps } = ROSTER;
  const variants = [
    ["missing", path.join(RD, "missing.json"), null, 503],
    ["notjson", path.join(RD, "notjson.json"), "{ this is not json", 503],
    ["dir", path.join(RD, "dir.json"), "DIR", 503],
    ["opsobj", path.join(RD, "opsobj.json"), JSON.stringify({ ...ROSTER, operators: {} }), 200],
    ["noops", path.join(RD, "noops.json"), JSON.stringify(noOps), 200],
  ];
  for (const [name, p, content, devStatus] of variants) {
    if (content === "DIR") fs.mkdirSync(p);
    else if (content !== null) fs.writeFileSync(p, content);
    await withApi(`r-503-${name}`, { SHIFTSWAP_NOW: NOW_OK, SHIFTSWAP_ROSTER_PATH: p }, async () => {
      const leaks = (t) => [p, path.basename(p), path.dirname(p), "rosters", JSON.stringify(p).slice(1, -1)].filter((s) => t.includes(s));
      const hz = await req("GET", "/api/healthz");
      const sh = await req("GET", "/api/shifts", { headers: ID("104417") });
      const sc = await run("S1");
      const dv = await req("GET", "/api/dev/users");
      const devOk = devStatus === 503
        ? dv.status === 503 && isDeepStrictEqual(dv.json, { code: "roster-unavailable" })
        : dv.status === 200 && isDeepStrictEqual(dv.json, { users: fx("dev-users").users.filter((u) => u.roles.includes("shift-supervisor")) });
      const ok = hz.status === 200 && sh.status === 503 && isDeepStrictEqual(sh.json, { code: "roster-unavailable" }) &&
        sc.status === 503 && isDeepStrictEqual(sc.json, { code: "roster-unavailable" }) && devOk &&
        [sh, sc, dv].every((x) => leaks(x.text).length === 0);
      check("H-503", ok, `${name}: healthz ${hz.status}; shifts ${sh.status} ${sh.text}; swap ${sc.status} ${sc.text}; dev ${dv.status} ${dv.text.slice(0, 200)}; leaks [${[sh, sc, dv].flatMap((x) => leaks(x.text))}]`);
      for (const [label, h, st, code] of [["no headers", {}, 401, undefined], ["roles shift-supervisor", ID("104417", "shift-supervisor"), 403, "role-not-permitted"]]) {
        for (const go of [() => req("GET", "/api/shifts", { headers: h }),
          () => req("POST", "/api/swap-checks", { headers: h, body: { giveShiftId: PICK.S1[1], takeShiftId: PICK.S1[2] } })]) {
          const x = await go();
          check("H-503-ORDER", x.status === st && (code === undefined || x.json?.code === code), `${name} ${label}: ${x.status} ${x.text}`);
        }
      }
    });
  }

  const { exportedAt: _e, ...noExport } = ROSTER;
  const pe = path.join(RD, "no-exported-at.json");
  fs.writeFileSync(pe, JSON.stringify(noExport));
  await withApi("r-parseable", { SHIFTSWAP_NOW: NOW_OK, SHIFTSWAP_ROSTER_PATH: pe }, async () => {
    const x = await run("S1");
    check("H-PARSEABLE", x.status === 200 && isDeepStrictEqual(x.json, fx("cannot-determine-missing-exported-at")), `Step 1: ${x.status} ${x.text}`);
    const sh = await req("GET", "/api/shifts", { headers: ID("104417") });
    check("H-PARSEABLE", sh.status === 200 && sh.json?.exportedAt === null, `shifts: ${sh.status} exportedAt ${JSON.stringify(sh.json?.exportedAt)}`);
  });

  const live = path.join(RD, "live.json");
  fs.writeFileSync(live, JSON.stringify(ROSTER));
  await withApi("r-live", { SHIFTSWAP_NOW: NOW_OK, SHIFTSWAP_ROSTER_PATH: live }, async () => {
    const a = await req("GET", "/api/shifts", { headers: ID("104417") });
    fs.renameSync(live, `${live}.away`);
    const b = await req("GET", "/api/shifts", { headers: ID("104417") });
    fs.renameSync(`${live}.away`, live);
    const c = await req("GET", "/api/shifts", { headers: ID("104417") });
    check("H-READ-EACH", a.status === 200 && b.status === 503 && c.status === 200, `present ${a.status}, renamed away ${b.status}, restored ${c.status}`);
  });
}

// ---------------- S ----------------
async function groupS() {
  const ops = new Set(ROSTER.operators.map((o) => o.employeeNumber));
  const owner = new Map(ROSTER.shifts.map((s) => [s.shiftId, s.employeeNumber]));
  const picks = [];
  for (const g of ROSTER.shifts) {
    if (!ops.has(g.employeeNumber)) continue;
    for (const t of ROSTER.shifts) if (t.employeeNumber !== g.employeeNumber) picks.push([g.employeeNumber, g.shiftId, t.shiftId]);
  }
  const res = new Map();
  await withApi("s-sweep", { SHIFTSWAP_NOW: NOW_OK }, async () => {
    let i = 0;
    const worker = async () => {
      while (i < picks.length) {
        const p = picks[i++];
        res.set(`${p[1]}|${p[2]}`, await swap(...p));
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  });
  const counts = {};
  const invalid = [];
  for (const [k, x] of res) {
    const key = x.status === 200 ? x.json?.outcome : `${x.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
    const ok = (x.status === 200 && OUTCOMES.includes(x.json?.outcome)) ||
      (x.status === 422 && x.json?.kind === "refused" && (x.json.reasons ?? []).length > 0 &&
        x.json.reasons.every((r) => r.code === "outside-pilot-units"));
    if (!ok) invalid.push(`${k}: ${x.status} ${x.text.slice(0, 120)}`);
  }
  const allSeen = OUTCOMES.every((o) => counts[o] > 0) && counts["422"] > 0;
  check("H-SWEEP", picks.length === 4748 && res.size === 4748 && invalid.length === 0 && allSeen,
    `picks ${picks.length}, responses ${res.size}, counts ${JSON.stringify(counts)}, invalid ${invalid.length} ${invalid.slice(0, 5).join("; ")}`);
  const leaky = [...res].filter(([, x]) => numbersIn(x.text).length > 0).map(([k]) => k);
  check("H-SWEEP-PRIV", res.size === 4748 && leaky.length === 0, `bodies with an employee number: ${leaky.length} ${leaky.slice(0, 5).join(", ")}`);

  const asSet = (a) => (a ?? []).map((r) => JSON.stringify(r)).sort();
  const strip = (b) => { const { employees, reasons, ...rest } = b ?? {}; return rest; };
  const emps = (b) => Object.fromEntries((b?.employees ?? []).map(({ party, ...e }) => [e.name, e]));
  let pairs = 0;
  const asym = [];
  for (const [g, t] of picks.map((p) => [p[1], p[2]])) {
    if (!(g < t)) continue;
    pairs++;
    const f = res.get(`${g}|${t}`);
    const r = res.get(`${t}|${g}`);
    const same = f !== undefined && r !== undefined && f.status === r.status &&
      isDeepStrictEqual(strip(f.json), strip(r.json)) && isDeepStrictEqual(asSet(f.json?.reasons), asSet(r.json?.reasons)) &&
      isDeepStrictEqual(emps(f.json), emps(r.json));
    if (!same) asym.push(`${g}<->${t} (${owner.get(g)}/${owner.get(t)}): ${f?.status} ${f?.json?.outcome} vs ${r?.status} ${r?.json?.outcome}`);
  }
  check("H-SYM", pairs === 2374 && asym.length === 0, `pairs ${pairs}, asymmetric ${asym.length} ${asym.slice(0, 5).join("; ")}`);
  fs.writeFileSync(path.join(EV, "sweep-summary.json"), JSON.stringify({ picks: picks.length, counts, invalid, leaky, pairs, asym }, null, 2));
}

// ---------------- T ----------------
async function groupT() {
  const values = ["yesterday", "2027-03-07 14:00", "2027-03-07T14:00:00+00:00", "2027-03-07T14:00:00"];
  for (const [i, v] of values.entries()) {
    if (await portAccepting()) throw new Error(`port ${PORT} busy before t-direct-${i}`);
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
      cwd: API_DIR, env: cleanEnv({ SHIFTSWAP_NOW: v }), encoding: "utf8", timeout: 30000, windowsHide: true,
    });
    fs.writeFileSync(path.join(EV, `t-direct-${i}.out.log`), r.stdout ?? "");
    fs.writeFileSync(path.join(EV, `t-direct-${i}.err.log`), r.stderr ?? "");
    const all = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    check("H-START-DIRECT", r.status !== null && r.status !== 0 && (r.stderr ?? "").includes("SHIFTSWAP_NOW") && !all.includes("Server listening"),
      `${JSON.stringify(v)}: exit ${r.status} signal ${r.signal} stderr ${JSON.stringify((r.stderr ?? "").trim().slice(0, 300))}`);
    check("H-PORT", !(await portAccepting()), `after t-direct-${i}`);
  }

  if (await portAccepting()) throw new Error(`port ${PORT} busy before t-dev`);
  const outF = path.join(EV, "t-dev.out.log");
  const errF = path.join(EV, "t-dev.err.log");
  const out = fs.openSync(outF, "w");
  const err = fs.openSync(errF, "w");
  const child = spawn("npm run dev:api", {
    cwd: REPO, env: cleanEnv({ SHIFTSWAP_NOW: "2027-03-07 14:00" }), shell: true, stdio: ["ignore", out, err], windowsHide: true,
  });
  let exited = null;
  const exitP = new Promise((res) => child.once("exit", (code, signal) => { exited = { code, signal }; res(exited); }));
  let accepted = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !exited) {
    if (await portAccepting()) accepted = true;
    await sleep(250);
  }
  const selfExit = exited;
  if (!exited) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  await exitP;
  fs.closeSync(out);
  fs.closeSync(err);
  const text = fs.readFileSync(outF, "utf8") + fs.readFileSync(errF, "utf8");
  check("H-START-DEV-MSG", text.includes("SHIFTSWAP_NOW") && !accepted, `names SHIFTSWAP_NOW ${text.includes("SHIFTSWAP_NOW")}, port accepted ${accepted}`);
  check("H-START-DEV-EXIT", selfExit !== null && selfExit.code !== null && selfExit.code !== 0,
    selfExit ? `exited by itself: ${JSON.stringify(selfExit)}` : "still running after 30 s; killed with taskkill /T /F");
  let free = false;
  for (let i = 0; i < 20 && !free; i++) { free = !(await portAccepting()); if (!free) await sleep(250); }
  check("H-PORT", free, "after t-dev");
}

// ---------------- U ----------------
async function groupU() {
  const mask = (s) => s.replace(/"pid":\d+/g, '"pid":0').replace(/"time":\d+/g, '"time":0').replace(/"responseTime":[\d.]+/g, '"responseTime":0');
  const scan = (s) => [...numbersIn(mask(s)), ...namesIn(mask(s))];
  const files = fs.readdirSync(EV).filter((f) => /^(api-|t-).*\.log$/.test(f));
  const hits = [];
  for (const f of files) for (const h of scan(fs.readFileSync(path.join(EV, f), "utf8"))) hits.push(`${f}: ${h}`);
  const ctl = path.join(EV, "control-positive.txt");
  fs.writeFileSync(ctl, "104417 Maya Thibodeaux\n");
  const ctlHits = scan(fs.readFileSync(ctl, "utf8"));
  const sweepLog = path.join(EV, "api-s-sweep.out.log");
  const sweepLines = fs.existsSync(sweepLog) ? fs.readFileSync(sweepLog, "utf8").split(/\r?\n/).filter((l) => l.includes("request completed")).length : 0;
  check("H-LOG", hits.length === 0 && files.length >= 15 && sweepLines >= 4748 && ctlHits.length >= 2,
    `files ${files.length}, hits ${hits.length} ${hits.slice(0, 10).join("; ")}, sweep request-completed lines ${sweepLines}, control hits [${ctlHits}]`);
}

// ---------------- main ----------------
const GROUPS = { P: groupP, Q: groupQ, R: groupR, S: groupS, T: groupT, U: groupU };
const EXPECTED = {
  P: ["H-HEALTH", "H-IDENT", "F-ADD2", "F-S1", "F-S2", "F-S3", "F-S4", "F-S5", "F-S6", "F-S8", "F-ADD3", "F-ADD6", "H-OWN",
    "H-REFUSE-GIVE", "H-DEV", "H-ROUTES", "H-STATELESS", "H-FIXTURE-EQ", "H-PORT"],
  Q: ["F-S7", "H-ADD3-STALE", "H-AGE", "H-NOW", "H-CLOCK-UNSET", "F-ADD5", "H-PORT"],
  R: ["H-PROD", "H-503", "H-503-ORDER", "H-PARSEABLE", "H-READ-EACH", "H-PORT"],
  S: ["H-SWEEP", "H-SWEEP-PRIV", "H-SYM", "H-PORT"],
  T: ["H-START-DIRECT", "H-START-DEV-MSG", "H-START-DEV-EXIT", "H-PORT"],
  U: ["H-LOG"],
};
if (!GROUPS[G]) {
  console.error(`unknown group ${G}`);
  process.exit(2);
}
try {
  await GROUPS[G]();
} catch (e) {
  check("PROBE-RUN", false, String(e?.stack ?? e));
}
const agg = {};
for (const id of EXPECTED[G]) if (!results.some((r) => r.id === id)) check(id, false, "never ran");
for (const r of results) agg[r.id] = agg[r.id] === "FAIL" || r.result === "FAIL" ? "FAIL" : "PASS";
for (const [id, v] of Object.entries(agg)) console.log(`RESULT ${id} ${v}`);
fs.writeFileSync(path.join(EV, `probe-${G}.json`), JSON.stringify({ group: G, results, aggregate: agg }, null, 2));
process.exit(Object.values(agg).includes("FAIL") ? 1 : 0);
```
<!-- probe.mjs:end -->


## Appendix B — e-check.mjs

How a test matches a map entry:

- The test's file must end with the mapped path.
- Its title is the `ancestorTitles` and `title` joined by single spaces.
- That joined title must contain the entry's string, or match its regular expression.

For each entry `[file, pattern, min]`:

- The entry needs at least `min` matching tests that passed, and no matching test that failed.
- An entry with no matching test at all is `INCONCLUSIVE`.

<!-- e-check.mjs:begin -->
```js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [, , jsonPath, repo] = process.argv;
const rep = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const norm = (p) => p.replace(/\\/g, "/");
const F = {
  app: "apps/api/src/app.test.ts", shifts: "apps/api/src/shifts.test.ts", sc: "apps/api/src/swap-checks.test.ts",
  rs: "apps/api/src/roster-source.test.ts", dev: "apps/api/src/dev-users.test.ts", rg: "apps/api/src/route-guards.test.ts",
  lp: "apps/api/src/log-privacy.test.ts", wb: "apps/api/src/web-boundary.test.ts", clock: "apps/api/src/clock.test.ts",
  ss: "apps/api/src/server-startup.test.ts", scd: "apps/api/src/swap-check-determinability.test.ts",
  sce: "apps/api/src/swap-check-evaluation.test.ts", scr: "apps/api/src/swap-check-review.test.ts",
  sws: "apps/api/src/swap-check-sweep.test.ts", sst: "apps/api/src/swap-check-stateless.test.ts",
  sg: "apps/api/src/sample-guard.test.ts", det: "packages/rules/src/determinability.test.ts",
  se: "packages/rules/src/swap-evaluation.test.ts", st: "packages/rules/src/site-time.test.ts",
  appw: "apps/web/src/App.test.tsx", csf: "apps/web/src/CheckSwapFlow.test.tsx", cba: "apps/web/src/CannotBeApproved.test.tsx",
  cd: "apps/web/src/CannotDetermine.test.tsx", rr: "apps/web/src/ReviewResults.test.tsx",
};
const e = (k, p, m = 1) => [k, p, m];

const M = {};
M["T4-01"] = [e("app", "C1: GET /api/healthz with no identity headers returns 200 and status ok")];
M["T4-02"] = [
  e("shifts", "no headers gives 401"), e("shifts", "only X-Employee-Number gives 401"), e("shifts", "only X-Roles gives 401"),
  e("sc", "C2: identity on POST /api/swap-checks no headers gives 401"), e("sc", "only X-Employee-Number gives 401"), e("sc", "only X-Roles gives 401"),
  e("shifts", "shift-supervisor without operator gives 403 role-not-permitted"), e("sc", "X-Roles shift-supervisor gives 403 role-not-permitted"),
  e("shifts", "operator,shift-supervisor gives 200"), e("shifts", "operator, shift-supervisor (space after the comma) gives 200"),
  e("sc", "is accepted as an operator (comma list, trimmed)", 3),
  e("shifts", "operator role with supervisor 100231 gives 403 not-a-roster-operator"),
  e("shifts", "operator role with unknown 999999 gives 403 not-a-roster-operator"),
  e("sc", "a supervisor with the operator role gives 403 not-a-roster-operator"),
  e("rs", "an operators array that lacks the caller is still 403 not-a-roster-operator"),
];
M["T4-03"] = [e("shifts", "104417's give list is exactly their roster shifts"),
  e("shifts", "104417's take list excludes their shifts and includes FCC-CON1-0318-D"),
  e("shifts", "102286 is Luis Fontenot and gets exactly his shifts as give")];
M["T4-04"] = [e("shifts", "renders the roster export time in UTC and in site-local time")];
M["T4-05"] = [e("sc", "gives 422 refused naming the FCC shift and unit"), e("sc", "carries no outcome, employees, findings or result"),
  e("sc", "C15: the body equals the shared step-8 fixture"), e("sc", "C5: both shifts outside the pilot names both shifts, give first")];
M["T4-06"] = [e("sc", "a give shift that is another operator's gives 403 give-shift-not-yours"),
  e("sc", "a take shift that is also the caller's own gives 422 take-shift-is-own"), e("sc", "give equal to take gives 422 take-shift-is-own")];
M["T4-07"] = [e("sc", "Step 1 gives 200 equal to its shared fixture"),
  e("sc", "Step 1 is approved-without-review, with the exact guidance and the wire key order")];
M["T4-08"] = [e("dev", "gives 200 with the fixture body and needs no identity headers", 2), e("dev", "lists exactly 8 operators and 2 supervisors"),
  e("dev", "gives 404 and the body holds no roster employee number or name"), e("dev", "still gives 404 with valid identity headers")];
M["T4-09"] = [e("appw", "renders the switcher as a labelled combobox with the dev users as options"),
  e("appw", "selecting 104417 makes the next API call carry X-Employee-Number and X-Roles"),
  e("appw", "renders no switcher, requests no dev users and attaches no identity header")];
M["T4-10"] = [e("csf", "the give options equal the 104417 fixture's give list, in order"),
  e("csf", "switching to 102286 replaces the give options with Luis's, and back again restores 104417's"),
  e("csf", "selecting the FCC shift and checking posts the pick with 104417's identity and renders the refusal"),
  e("csf", "the refusal list has one item per reason in step-8.json")];
M["T4-11"] = [e("csf", "the picker view contains the roster export instant and every pilot caveat"),
  e("csf", "the refusal view contains the same notices, names the FCC shift and has no section-sign text")];
M["T4-12"] = [e("rg", "registers exactly the four routes", 2), e("rg", "nodeEnv production registers exactly the three routes, without /api/dev/users"),
  e("rg", "gives 404 for a valid operator", 13), e("rg", "every route leaves data/roster.sample.json unchanged")];
const LP_SCANS = [e("lp", "every registered route has an exercise"), e("lp", "no log line from any route holds an employee number or a name")];
M["T4-13"] = [...LP_SCANS, e("lp", "the exercises produced 200, 400, 401, 403, 404, 422 and 503, and no other 5xx"),
  e("lp", "positive control: the scanner finds an employee number and a name written on purpose"),
  e("lp", "the scanned set holds every sample operator and supervisor name and employee number, and every shift holder")];
M["T4-14"] = [e("csf", "the picker with the switcher shown and a selection made has no axe-core WCAG A/AA violations"),
  e("csf", "the refusal view has no axe-core WCAG A/AA violations")];
const WB = [e("wb", "no apps/web file references apps/api, @shiftswap/api or @shiftswap/rules"),
  e("wb", "apps/web/package.json does not depend on @shiftswap/api or @shiftswap/rules")];
M["T4-15"] = [e("shifts", "C15: responses match the shared fixtures 104417"), e("shifts", "C15: responses match the shared fixtures 102286"), ...WB];
M["T4-17"] = [e("shifts", "in the sample roster, every take entry has a non-empty string ownerName"),
  e("shifts", "CDU-CON1-0319-N is Luis Fontenot's and FCC-CON1-0318-D is Nadia Trahan's"),
  e("shifts", "no take entry has an employeeNumber property"), e("shifts", "no value in the take list equals a roster operator or supervisor number")];
M["T4-18"] = [e("csf", "the take options for CDU-CON1-0319-N and FCC-CON1-0318-D name Luis Fontenot and Nadia Trahan"),
  e("csf", "every take option's accessible name contains the owner name from its fixture entry")];
M["T4-19"] = [e("lp", "every ownerName returned in a shifts response during the run is in the scanned set"),
  e("csf", "the picker showing owner names has no axe-core WCAG A/AA violations")];

M["T5-01"] = [e("clock", "a valid SHIFTSWAP_NOW gives a clock fixed at that instant"),
  e("clock", "unset SHIFTSWAP_NOW gives the system clock, within 1 s of Date.now()"),
  e("clock", "a malformed SHIFTSWAP_NOW throws and names it: ", 7), e("ss", "exits non-zero before listening and names SHIFTSWAP_NOW: ", 2)];
const AGE = [e("det", "exactly 26 h after the sample export yields no stale reason"), e("det", "is one tick past 26 h and yields export-stale", 2),
  e("det", "export-stale is present if and only if the age exceeds 26 h")];
M["T5-02"] = AGE;
M["T5-03"] = [e("scd", "Step 7 at 2027-03-08T12:00Z gives 200 equal to the step-7 fixture"),
  e("scd", "the body has exportedAt and no employees, findings, result or kind"),
  e("scd", "the same request at 2027-03-07T14:00Z gives the step-1 approved-without-review body")];
const HZ = [e("det", /criterion 4: a shift starting .* is inside the horizon of the 7 March export/, 2),
  e("det", /criterion 4: a shift starting .* is outside the horizon of the 7 March export/, 2)];
M["T5-04"] = HZ;
M["T5-05"] = [e("det", "the Monday export has coverage 2 March to 29 March"), e("det", /a Monday export puts a start of .* inside/, 3),
  e("det", /a Monday export puts a start of .* outside/, 2), e("det", "the Wednesday export has coverage 25 February to 24 March"),
  e("det", /a Wednesday export puts a start of .* inside/, 3), e("det", /a Wednesday export puts a start of .* outside/, 2),
  e("det", "exportedAt 2027-03-08T03:00:00Z uses the site date 7 March"),
  e("det", "property: for a random export date the give shift is outside the horizon iff its day offset is below 0 or above 15")];
M["T5-06"] = [e("scd", "ADD-3 at 14:00Z gives 200 equal to the add-3 fixture"), e("scd", "the body names only the take shift: the give shift id is absent"),
  e("scd", "with both shifts beyond the horizon, both are named, give first"), e("det", "criterion 6: with both shifts out, both are named, give first")];
M["T5-07"] = [e("det", /exportedAt .* names exportedAt/, 5), e("det", /exportedAt with .* is malformed, once/, 15), e("det", /coverage .* names /, 6),
  e("det", "coverage from later than to is named, with both mismatches"), e("det", "coverage that is not D-6 to D+21 gives a mismatch for each end"),
  e("det", "a mismatch on one end leaves the other end unreported"), e("scd", "criterion 17: a wrong coverage.from gives 200 coverage-mismatch"),
  e("scd", "criterion 7: a missing exportedAt gives 200 equal to the missing-exported-at fixture")];
M["T5-08"] = [e("det", "for arbitrary JSON the gate never throws and the result is well formed"),
  e("det", "for arbitrary values the gate never throws and the result is well formed"),
  e("det", "never throws, every number is finite, no null or NaN, and no personal data is reported"),
  e("det", "an instant with exactly one thing broken is never determinable and is reported as malformed"),
  e("det", "a valid roster whose exportedAt is arbitrary JSON that is not an instant is never determinable")];
const QUAL = [e("det", "with qualifications absent is qualifications-missing/absent", 2), e("det", "with qualifications: [] is qualifications-missing/empty", 2)];
M["T5-09"] = [e("det", "a give shift id not in the roster is missing-shift"), e("det", "a take shift id not in the roster is missing-shift"),
  e("det", "both shift ids missing are both named, give first"), e("det", "a give shift whose owner is not in operators is owner-not-operator"),
  e("det", "a take shift whose owner is not in operators is owner-not-operator"), e("scd", "a take shift owned by a non-operator gives owner-not-operator"),
  ...QUAL, e("scd", "the take shift owner's qualifications absent gives qualifications-missing absent"),
  e("scd", "the take shift owner's qualifications empty gives qualifications-missing empty"), e("sc", "an unknown take shift gives 422 unknown-shift")];
M["T5-10"] = [e("scd", "the ADD-3 pick at 2027-03-08T12:00Z lists export-stale then shift-outside-horizon"),
  e("scd", "an FCC take shift beyond the horizon with a stale clock is refused 422, not cannot-determine")];
M["T5-11"] = [e("cd", "shows the 28 h age and the same one-line wording as the fixture, in a section with intro and one item per reason"),
  e("cd", "the notices show the export stamp from the result and the three caveats, in one landmark"),
  e("cd", "gives no result: neither the section nor the page says approved, review, pass or fail"),
  e("cd", "the notices say the roster export time is unavailable, and still carry the caveats")];
M["T5-12"] = [e("lp", "the scenario apps' lines hold no employee number or name"), ...LP_SCANS];
M["T5-13"] = [e("cd", "has the heading, one item per reason and no axe-core WCAG A/AA violations", 5)];
M["T5-14"] = [e("det", "a now one second before the export gives only now-before-export"),
  e("det", "a now equal to the export instant gives no now-before-export reason"),
  e("scd", "now 07:59:59Z gives 200 equal to the now-before-export fixture"),
  e("scd", "now equal to exportedAt is determinable: gives the step-1 approved-without-review body")];
M["T5-15"] = [e("det", "is named and skips every check that needs D", 7), e("det", "a roster with no site at all is named, not a crash"),
  e("scd", "criterion 15: an unknown site.timeZone gives 200 cannot-determine with null stamp fields, not 503"),
  e("scd", "criterion 15: an absent site.timeZone gives 200"), e("scd", "criterion 15: a numeric site.timeZone gives 200")];
M["T5-16"] = [e("det", "starting at the skipped 2027-03-14T02:30 is nonexistent-local-time", 2),
  e("det", "ending at the skipped 2027-03-14T02:30 is nonexistent-local-time", 2), e("det", "a swapped shift itself with a skipped time is flagged"),
  e("det", "a shift ending at the repeated 2027-11-07T01:30 is ambiguous-local-time"),
  e("scd", "no shift starts or ends on 2027-03-14 between 02:00 and 02:59"),
  e("scd", "no pair of the sample's operators gets nonexistent-local-time or ambiguous-local-time")];
M["T5-17"] = [e("rs", "roster path is a missing file", 2), e("rs", "roster path is a directory", 2), e("rs", "roster path is a file with invalid JSON", 2),
  e("rs", "deleting the file gives 503, and restoring it gives 200 again"), e("rs", "a file corrupted after startup gives 503 on POST /api/swap-checks"),
  e("rs", "a rewritten file shows in the next response")];
M["T5-18"] = [M["T5-03"][0], M["T5-06"][0], e("cd", "the horizon fixture is served for a pick 104417 can make, and its shift is named"), ...WB];

M["T6-01"] = [e("st", "spring forward: 18:00 to 05:00 is 10 h, though the clocks differ by 11 h"), e("st", "spring forward: 18:00 to 06:00 is 11 h"),
  e("st", "after the change: 05:00 to 17:00 on the same day is 12 h"), e("st", "the day before the change: 18:00 to 06:00 is 12 h")];
M["T6-02"] = [e("st", "elapsed is the clock difference, less 1 h iff a is before the change and b is at or after 03:00")];
M["T6-03"] = [e("se", "a rest of exactly 11 h (660 min) passes"), e("se", "a rest of 10 h 59 min (659 min) fails"),
  e("se", "a rest of 0 h (0 min) fails, and is not reported as an overlap")];
M["T6-04"] = [e("se", "a shift starting on the validThrough date passes", 2),
  e("se", "an 18:00 night shift starting on the validThrough date and ending the next day passes", 2),
  e("se", "a shift starting the day after validThrough fails as expired", 2), e("se", "a unit match with a role mismatch fails, with no validThrough", 2),
  e("se", "a unit mismatch with a matching role fails, with no validThrough", 2)];
M["T6-05"] = [e("sce", "criterion 5: Step 3, Luis Fontenot (102286) has the one § 3.1 finding of 0 h; Maya has none")];
M["T6-06"] = [e("sce", "criterion 6: Step 4 across the clock change, Maya has the one § 3.1 finding of 10 h, not 11")];
M["T6-07"] = [e("sce", "criterion 7: Step 6, Priya Raman has the one § 3.3 finding; Dwayne has none")];
M["T6-08"] = [e("sce", "criterion 8: with a § 3.1 and a § 3.3 failure, both are listed, each naming its employee and rule"),
  e("se", "lists the § 3.1 finding under the give owner and the § 3.3 finding under the take owner"), e("se", "each employee carries only their own failure")];
M["T6-09"] = [e("sce", "criterion 9: a rest under 11 h the swap did not change is a § 3.1 finding with changedBySwap false"),
  e("se", "a rest under 11 h elsewhere in the schedule is a finding with changedBySwap false")];
const PROC = e("cba", "names the exception procedure and offers no approve, send, agree, submit or notify control", 6);
M["T6-10"] = [e("sce", "the guidance contains VE-HSSE-PRC-021 and equals the fixed GUIDANCE text"), PROC];
M["T6-11"] = [e("sce", "the Step 1 request returns 200 approved-without-review with no finding")];
M["T6-12"] = [e("cba", "step-4.json: Maya's before figure is 10 h and not 11 h"),
  e("cba", "step-4.json: the finding shows the employee's name, the § reference, the figure and the swap's effect, and the notices are present"),
  e("cba", "step-3.json: Luis is the only employee named as failing")];
const LP_SCEN = [e("lp", "the scenarios include Steps 3, 4, 5 and 6, the fail-listing roster, the unchanged-shift § 3.3 roster and the unchanged-window roster"),
  e("lp", "the scenario apps' lines hold no employee number or name"), e("lp", "no log line from any route holds an employee number or a name")];
M["T6-13"] = LP_SCEN;
M["T6-14"] = [e("cba", /Step 3 \(step-3\.json\) has no axe-core/), e("cba", /Step 4 \(step-4\.json\) has no axe-core/),
  e("cba", /Step 6 \(step-6\.json\) has no axe-core/), e("cba", /unchanged shift § 3\.3 \(unchanged-shift-… has no axe-core WCAG A\/AA violations/)];
M["T6-15"] = [e("se", "an expired kept shift within coverage is a finding naming it, with changedBySwap false"),
  e("se", "an expired kept shift on the last coverage date is still a finding"), e("se", "the same expired shift ", 2),
  e("sce", "a § 3.3 failure on an added Priya shift is cannot-be-approved with changedBySwap false, equal to the fixture"),
  e("sce", "the same shift outside coverage (2027-03-29) gives 200 review-required with no finding")];
M["T6-16"] = [e("sg", "yields zero findings")];
M["T6-17"] = [e("sce", "step-3.json is the 200 body for its pick"), e("sce", "step-4.json is the 200 body for its pick"),
  e("sce", "step-6.json is the 200 body for its pick"),
  e("cba", "step-6.json: the § 3.3 finding names Priya, the § reference, the shift and the expiry, as changed by the swap"), ...WB];

M["T7-01"] = [e("sce", "each employee has 22 windows, 2027-03-01 to 03-22, none past coverage.to", 4),
  e("se", "coverage 1 to 28 Mar has 22 windows, starting 1 to 22 Mar, the last ending on coverage.to")];
M["T7-02"] = [e("se", "a night shift 6 Mar 18:00 to 7 Mar 06:00 is 12 h in the windows holding 6 Mar and 0 h in the window starting 7 Mar"),
  e("se", "the windows starting 1, 8, 15 and 22 Mar sum to the hours of the shifts starting in coverage", 2)];
M["T7-03"] = [e("se", "six 12 h shifts in one window are 72 h 0 m and no § 3.2 finding"),
  e("se", "one of them 12 h 1 m is 72 h 1 m and exactly one § 3.2 finding"),
  e("se", "property: for a window total of 4200 to 4440 minutes there is a finding exactly when it is over 4320")];
M["T7-04"] = [e("se", "in America/Chicago the 13 Mar 18:00 to 14 Mar 06:00 shift is 11 h in each window holding 13 Mar"),
  e("sce", "Jerome's window 2027-03-07 to 03-13 is 47 h, the 13 Mar night shift being 11 h"),
  e("cba", "Jerome's 2027-03-07 to 2027-03-13 window shows 47 h, not 48 h")];
M["T7-05"] = [e("sce", "criterion 5: Step 5, Tom Broussard has the one § 3.2 finding of 84 h; Jerome Guidry has none")];
M["T7-06"] = [e("sce", "criterion 6: an existing window of 84 h the swap does not change is a § 3.2 finding with changedBySwap false"),
  e("se", "is still a § 3.2 finding, with changedBySwap false"),
  e("cba", "the one failure ends 'not changed by this swap.' and the section never says the window was changed"),
  e("cba", "Luis's 2027-03-22 to 2027-03-28 row shows 84 h and Not changed, and the other employee has no failures")];
M["T7-07"] = [...M["T6-05"], ...M["T6-06"], ...M["T6-07"], ...M["T6-15"], ...M["T6-16"]];
M["T7-08"] = [e("cba", "Tom's block has one table, named by its caption, with the three column headers"),
  e("cba", "'s table has one row per fixture window, with the dates, the hours as sent and the label", 2),
  e("cba", "the § 3.2 failure names Tom, the 84 h and the window, and no other failure is listed"),
  e("cba", "Tom's 2027-03-15 to 2027-03-21 window shows 84 h and Changed; the windows either side show 72 h")];
M["T7-09"] = LP_SCEN;
M["T7-10"] = [e("cba", /Step 5 \(step-5\.json\) has no axe-core/), e("cba", /unchanged window § 3\.2 \(unchanged-windo… has no axe-core WCAG A\/AA violations/)];
M["T7-11"] = [e("sce", "criterion 11: step-5.json is the 200 body for its pick"), e("sce", "the shared fixtures carry the independently computed window figures")];

M["T8-01"] = [e("se", "a rest of exactly 12 h 0 min is no trigger and the swap is approved without review", 2),
  e("se", "a rest of 11 h 59 min is one trigger, no § 3 finding, and the swap needs review", 2),
  e("se", "a window of exactly 60 h 0 min is no trigger and the swap is approved without review", 2),
  e("se", "a window of 60 h 1 min is one trigger for that window, no § 3.2 finding, and the swap needs review", 2),
  e("se", "a rest between two shifts the swap does not touch is still a trigger, labelled changedBySwap false"),
  e("se", "a window the swap does not touch is still a trigger, labelled changedBySwap false"), e("se", "triggers on both employees are a single review")];
M["T8-02"] = [e("scr", "Step 1 gives 200 approved-without-review with no finding or trigger for either employee"),
  e("scr", "Maya is off duty 36 h before and 156 h after"), e("scr", "Luis is off duty 48 h before and 36 h after"),
  e("scr", "each employee's worst window containing a swapped shift is 48 h"),
  e("scr", "Maya's untouched rest CDU-CON1-0316-N to CDU-CON1-0317-N is exactly 12 h and raises no trigger")];
M["T8-03"] = [e("scr", "Step 2 gives 200 review-required with no § 3 finding for either employee"),
  e("scr", "the only trigger is Aisha's § 4.2(a), 11 h, and Priya has none"), e("scr", "Aisha's period after is 107 h, not 108"),
  e("scr", "Priya's period is 72 h before and 71 h after, not 72"),
  e("scr", "Aisha's untouched window 2027-03-14 to 2027-03-20 is 60 h and raises no § 4.2(b) trigger"),
  e("scr", "the body names no reviewing units: only the known keys appear"),
  e("rr", "names no reviewing unit or reviewer and renders no employee number", 3)];
M["T8-04"] = [e("scr", "ADD-6 gives 200 review-required with no finding for either employee"),
  e("scr", "the only trigger is Tom's § 4.2(b) for 2027-03-15 to 2027-03-21, 72 h, changedBySwap false"),
  e("rr", "add-6.json: Tom's § 4.2(b) trigger for 2027-03-15 to 2027-03-21 shows 72 h and 'not changed by this swap'")];
M["T8-05"] = [e("scr", "the evaluator called directly on the ADD-3 swap is approved-without-review"),
  e("scr", "the API still gives 200 cannot-determine, with the horizon reason")];
M["T8-06"] = [e("se", "property: any finding makes the swap cannot-be-approved; else any trigger makes it review-required; else approved-without-review"),
  e("se", "classifySwap a finding on one employee and a trigger on the other is x")];
M["T8-07"] = [e("sws", "rules: the outcome, findings and triggers are the same whichever employee initiates"),
  e("sws", "api: the status, the outcome and the findings are the same whichever employee initiates"),
  e("se", "property: both directions give the same outcome, and each employee the same findings and triggers")];
M["T8-08"] = [e("sws", "every pick returns a 422 refusal or one of the four outcomes, never a 501 or 5xx"),
  e("sws", "the sweep covers every ordered cross-owner pick of the sample"),
  e("sws", "the sweep is not vacuous: a refusal and each of the four outcomes occur")];
M["T8-09"] = [e("rr", "has no approve, send, agree, submit or notify control and only Choose again", 3), PROC,
  e("sst", "after every request each app still lists exactly the four routes, and none was added"),
  e("sst", "every request answers the same on two fresh app instances"),
  e("sst", "data/roster.sample.json has the same SHA-256 and mtime after the full pass"),
  e("sst", "repeating Steps 1 and 2, ADD-6 and ADD-3 on the first app after the sweep gives byte-identical bodies")];
M["T8-10"] = [e("rr", "carries the three notices", 3), e("rr", "shows the export stamp from the response body", 3)];
M["T8-11"] = [e("lp", "no log line from any route holds an employee number or a name"),
  e("lp", "the sweep ran through the logged app and produced a 422 and each of the four outcomes"), e("lp", "the sweep's lines hold no employee number or name")];
M["T8-12"] = [e("rr", "has no axe-core WCAG A/AA violations", 3), e("csf", "approved without review (step-1.json) has no axe-core WCAG A/AA violations")];
M["T8-13"] = [e("scr", "the body carries no employee number and equals the step-1 fixture"),
  e("scr", "the body carries no employee number and equals the step-2 fixture"),
  e("scr", "the body carries no employee number and equals the add-6 fixture"), e("sce", "is the 200 body for its pick", 6)];

M["LT-1"] = AGE;
M["LT-2"] = [...HZ, e("det", "criterion 6: one shift out names only that shift and the range")];
M["LT-3"] = [M["T5-07"][7], e("scd", "the body equals the cannot-determine-shift-end-not-after-start fixture, with no name or employee number"),
  M["T5-14"][2], ...QUAL];
M["LT-4"] = [M["T4-08"][2], M["T4-08"][3], M["T4-12"][1], M["T4-09"][2]];
M["N-A11Y"] = [...M["T4-14"], M["T4-19"][1], ...M["T5-13"], ...M["T6-14"], ...M["T7-10"], ...M["T8-12"]];

// ---- evaluation ----
const tests = [];
for (const tr of rep.testResults ?? []) {
  const file = norm(tr.name);
  for (const a of tr.assertionResults ?? []) tests.push({ file, full: [...(a.ancestorTitles ?? []), a.title].join(" "), status: a.status });
}
let bad = false;
const summary = { totals: {}, cases: {} };
const t = { success: rep.success, total: rep.numTotalTests, passed: rep.numPassedTests, failed: rep.numFailedTests,
  pending: rep.numPendingTests, todo: rep.numTodoTests, files: (rep.testResults ?? []).length };
const nonPassFiles = (rep.testResults ?? []).filter((r) => r.status !== "passed").map((r) => norm(r.name));
const statusCounts = {};
for (const x of tests) statusCounts[x.status] = (statusCounts[x.status] ?? 0) + 1;
const proj = { rules: "/packages/rules/", api: "/apps/api/", web: "/apps/web/" };
const floors = { rules: 226, api: 222, web: 72 };
const projCounts = {};
for (const [k, p] of Object.entries(proj)) projCounts[k] = tests.filter((x) => x.file.includes(p) && x.status === "passed").length;
const tracked = execFileSync("git", ["ls-files", "*.test.ts", "*.test.tsx"], { cwd: repo, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const missingFiles = tracked.filter((f) => !(rep.testResults ?? []).some((r) => norm(r.name).endsWith("/" + f)));
const totalsOk = t.success === true && t.failed === 0 && (t.pending ?? 0) === 0 && (t.todo ?? 0) === 0 && nonPassFiles.length === 0 &&
  Object.keys(statusCounts).every((s) => s === "passed") && Object.entries(floors).every(([k, v]) => projCounts[k] >= v) &&
  tests.length >= 520 && missingFiles.length === 0;
summary.totals = { ...t, statusCounts, projCounts, floors, trackedFiles: tracked.length, missingFiles, nonPassFiles, ok: totalsOk };
console.log(`TOTALS ${JSON.stringify(summary.totals)}`);
console.log(`CASE E-TOTALS ${totalsOk ? "PASS" : "FAIL"}`);
if (!totalsOk) bad = true;

for (const [id, entries] of Object.entries(M)) {
  let res = "PASS";
  const det = [];
  for (const [k, pat, min] of entries) {
    const hits = tests.filter((x) => x.file.endsWith("/" + F[k]) && (pat instanceof RegExp ? pat.test(x.full) : x.full.includes(pat)));
    const p = hits.filter((x) => x.status === "passed").length;
    const f = hits.filter((x) => x.status === "failed").length;
    let r = "ok";
    if (hits.length === 0) r = "INCONCLUSIVE";
    else if (f > 0 || p < min) r = "FAIL";
    if (r === "FAIL") res = "FAIL";
    else if (r === "INCONCLUSIVE" && res === "PASS") res = "INCONCLUSIVE";
    det.push({ file: k, pattern: String(pat), min, matched: hits.length, passed: p, failed: f, result: r,
      titles: hits.slice(0, 20).map((x) => `${x.status}: ${x.full}`) });
  }
  summary.cases[id] = { result: res, entries: det };
  console.log(`CASE ${id} ${res}`);
  for (const d of det) if (d.result !== "ok") console.log(`   ${d.result} [${d.file}] ${d.pattern} min ${d.min} matched ${d.matched} passed ${d.passed} failed ${d.failed}`);
  if (res !== "PASS") bad = true;
}
fs.writeFileSync(path.join(path.dirname(jsonPath), "e-check.json"), JSON.stringify(summary, null, 2));
process.exit(bad ? 1 : 0);
```
<!-- e-check.mjs:end -->
