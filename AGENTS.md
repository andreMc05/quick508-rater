# Agent memory — 508 Draft Rater

Read `docs/ARCHITECTURE.md` before changing rating, combine, catalog, or report shape.

## Product

- Shipped name is **508 Draft Rater**, not Quick508, in UI, CLI, and `DraftReport.product`.
- Pre-audit only. Never write “508 compliant,” “508 certified,” ACR, or VPAT as an output claim.
- Legal pack is Revised Section 508 E205.4 → **WCAG 2.0 A+AA only** (38 SCs). Do not add 2.1/2.2 SCs to this pack.
- Page status may only be the three labels in `STATUS_LABELS`. The 0–100 figure is a **risk/coverage index**, not a compliance score.

## Where to edit

| Change | Canonical file | Mirror |
| --- | --- | --- |
| Report / types | `src/types.ts` | `py/rate.py` combine payload |
| SC catalog, disclaimer, labels | `src/catalog/criteria.ts` | `CRITERIA` / `DISCLAIMER` / `STATUS` in `py/rate.py` |
| Pass/fail decision | `src/engine/combine.ts` | `combine()` in `py/rate.py` |
| Structural checks | `src/tools/code-checks.ts` | `code_findings()` in `py/rate.py` |
| Jev questions | `src/jev/jobs.ts` | `build_jobs()` in `py/rate.py` |
| Live/stub model | `src/referee/` | `Referee` / `TypesafeReferee` in `py/rate.py` |
| HTTP API | `src/server.ts` | `py/server.py` |
| UI copy / table | `public/` | none (shared static files) |

TypeScript is the contract. If you change only Python, the implementations drift.

## Hard rules

- Jev never overrides a deterministic code/axe **fail**.
- Contrast, counts, and math stay in code. Do not ask Jev to compute them.
- Jev jobs stay lean and isolated. Do not send the full HTML document or media bytes.
- Use Noul thresholds in combine, not TypeSafe Score.
- `public/app.js` only renders `DraftReport`. Rating logic does not belong in the browser.
