# 508 Draft Rater

Working title was Quick508 Rater. The shipped name is **508 Draft Rater** so the artifact cannot be mistaken for a conformance engine.

This is a **pre-audit rater** for one HTML page treated as Revised Section 508 **electronic content (E205)**. It never prints “508 compliant,” “508 certified,” or a signed ACR/VPAT. A human signs legal documents. One failed applicable WCAG 2.0 success criterion fails official conformance.

## What it rates

Official pack only:

- Revised Section 508 (Access Board 2017, 36 CFR Part 1194)
- Electronic content: **E205.4 → WCAG 2.0 Level A and AA** (38 success criteria)
- Software UIs would use E207.2 (same WCAG floor) — not the v1 input path
- Non-web documents/software are **not** required to meet 2.4.1, 2.4.5, 3.2.3, 3.2.4 (`--kind non_web_document`)
- Functional Performance Criteria (Chapter 3 / 302.x) are **impact tags**, and a fallback when technical rules do not cover a feature — **not a substitute for WCAG**
- WCAG 2.2 AA is a future optional pack. It is not mixed into this legal pack.

Primary sources:

- https://www.access-board.gov/ict
- https://www.section508.gov/develop/applicability-conformance/
- https://www.section508.gov/develop/mapping-wcag-to-fpc/

Page-level draft status (only these three strings):

- Does not meet WCAG 2.0 AA on tested criteria
- Incomplete — review required
- No failures on tested criteria (not a full 508 audit)

An optional 0–100 figure is labeled **risk/coverage index**. It is not a compliance score.

## Owners

| Owner | Decides |
| --- | --- |
| `code` | Structural facts from the HTML inventory (missing `alt`, missing `lang`, unlabeled inputs, inline contrast math, skip/landmark presence) |
| `axe` | axe-core rules tagged `wcag2a` / `wcag2aa`, mapped back to WCAG 2.0 SC |
| `jev` | Semantic judgments only (alt equivalence, link purpose in context, heading sense, sensory-only instructions, color-only cues, images of text) |
| `human` | Runtime and site-set SCs (keyboard trap, focus order/visibility, live media, flashing, 2.4.5 / 3.2.3 / 3.2.4, transactions) |

**Jev is not the decision maker.** The engine combines code + axe + Nouls + thresholds. A deterministic fail cannot be overwritten by a high Noul.

## TypeSafe Jev

Jev is TypeSafe’s System One model (`jev-latest`, `POST /v1/systemone`).

- State is text only (string, JSON object, or array of text). No images, audio, or video.
- Primitives used here: **Noul** (`P(yes)` in `[0,1]`, no confidence field) and, if needed, **Choice**. **Score is not used for legal pass/fail.**
- Questions are isolated and kept lean. The whole document is never sent.
- Domain rules live in `instructions` / `criteria` / `state`, not in a fine-tune.

`Referee.interpret(state, questions) -> RefereeResult`

- `TypesafeReferee` when `TYPESAFE_API_KEY` is set
- `StubReferee` otherwise (deterministic heuristics, labeled `stub`)

Thresholds (engine, not model):

- Success propositions (e.g. “alt is equivalent”): pass if Noul ≥ 0.78, fail if ≤ 0.28, else needs review
- Failure propositions (e.g. “instructions rely only on sensory cues”): fail if Noul ≥ 0.72, pass if ≤ 0.28, else needs review
- Mid-band is always `needs_review`. `noul(not A)` is **not** assumed to equal `1 - noul(A)`.

Jaggedness respected: no counting/math delegated to Jev; contrast is computed in code; dates and multi-hop are not asked.

## Run

Zero-dependency runner (Python stdlib — no npm required):

```bash
cd quick508-rater
python3 py/rate.py fixtures/fail-sample.html
python3 py/rate.py fixtures/lean-sample.html --json
python3 py/server.py 5080
```

TypeScript app (same Referee + engine contract; axe-core optional):

```bash
npm install
npx tsx src/cli.ts fixtures/fail-sample.html
npx tsx src/server.ts
```

```bash
export TYPESAFE_API_KEY=...    # live Jev; otherwise StubReferee
python3 py/rate.py https://example.gov/page
```

## Layout

```
src/catalog/     WCAG 2.0 AA definitions + FPC tags + axe tag map
src/ingest/      URL / file / pasted HTML → inventory
src/tools/       code checks, contrast math, axe-core in jsdom
src/jev/         lean Noul jobs
src/referee/     TypesafeReferee + StubReferee
src/engine/      combine + page status
src/cli.ts       src/server.ts
py/              stdlib CLI + UI server (same contract)
public/          pre-audit UI
fixtures/        sample pages
```

## v1 out of scope

Native binaries, PDF/Office as binaries, multi-page crawls, WCAG 2.2, generating an ACR/VPAT, claiming full 508 conformance.
