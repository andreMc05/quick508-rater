import { STATUS_LABELS, WCAG20_AA, isApplicable } from "../catalog/criteria.ts";
import type { AxeBySc } from "../tools/axe-runner.ts";
import type { CodeFinding } from "../tools/code-checks.ts";
import type { JevJob } from "../jev/jobs.ts";
import type {
  ContentKind,
  CriterionResult,
  DraftReport,
  Evidence,
  JevTrace,
  Outcome,
  Owner,
  PageInventory,
  Referee,
} from "../types.ts";

/** Noul bands. Mid band is always needs_review. Do not use Score. */
export const NOUL = {
  /** Failure proposition (e.g. "relies only on sensory cues") */
  failAbove: 0.72,
  passBelow: 0.28,
  /** Success proposition (e.g. "alt is equivalent") */
  successPassAbove: 0.78,
  successFailBelow: 0.28,
};

export function noulToOutcome(noul: number, polarity: "success" | "failure"): Outcome {
  if (polarity === "success") {
    if (noul >= NOUL.successPassAbove) return "pass";
    if (noul <= NOUL.successFailBelow) return "fail";
    return "needs_review";
  }
  if (noul >= NOUL.failAbove) return "fail";
  if (noul <= NOUL.passBelow) return "pass";
  return "needs_review";
}

const SUCCESS_PROPOSITIONS = new Set([
  "1.1.1",
  "2.4.2",
  "2.4.4",
  "2.4.6",
]);
const FAILURE_PROPOSITIONS = new Set(["1.3.3", "1.4.1", "1.4.5"]);

export interface CombineInput {
  inv: PageInventory;
  kind: ContentKind;
  source: DraftReport["source"];
  code: Record<string, CodeFinding>;
  axe: AxeBySc;
  jevAnswers: Map<string, { type: string; noul?: number; choice?: string; probabilities?: Record<string, number>; confidence?: number; job: JevJob }>;
  referee: Referee;
}

export function combine(input: CombineInput): DraftReport {
  const { inv, kind, source, code, axe, jevAnswers, referee } = input;
  const jevBySc = groupJev(jevAnswers);

  const criteria: CriterionResult[] = WCAG20_AA.map((def) => {
    const applicable = isApplicable(def, kind);
    if (!applicable) {
      return base(def, {
        result: "na",
        owner: "code",
        applicable: false,
        notes: "Excepted for non-web documents/software under E205.4 / E207.2.",
        evidence: [{ source: "code", snippet: "SC not required for this content kind." }],
        tools: ["code"],
      });
    }

    const finding = code[def.id];
    const axeHit = axe[def.id];
    const jevHits = jevBySc.get(def.id) || [];

    // Precedence: structural fail (code or axe violation) wins.
    // Jev never overrides a deterministic fail.
    // Jev never upgrades needs_review to pass when axe incomplete on the same SC
    // unless code already passed a complete structural check and Jev is only quality.

    const evidence: Evidence[] = [];
    const tools: Owner[] = [];
    const traces: JevTrace[] = [];

    if (finding) {
      tools.push(finding.owner);
      evidence.push(...finding.evidence);
    }
    if (axeHit?.violations.length) {
      tools.push("axe");
      evidence.push(...axeHit.violations.slice(0, 4));
    }
    if (axeHit?.incomplete.length) {
      tools.push("axe");
      evidence.push(...axeHit.incomplete.slice(0, 2));
    }
    for (const j of jevHits) {
      tools.push("jev");
      traces.push(j.trace);
      evidence.push({
        source: "jev",
        selector: j.job.selector,
        snippet: `Jev ${j.trace.primitive} ${j.trace.noul !== undefined ? j.trace.noul.toFixed(3) : j.trace.choice} — ${j.job.snippet}`.slice(0, 240),
      });
    }

    let result: Outcome = "needs_review";
    let owner: Owner = uniqueOwner(tools);
    let notes = finding?.notes || "";

    const codeFail = finding?.result === "fail";
    const axeFail = (axeHit?.violations.length || 0) > 0;
    const codePass = finding?.result === "pass";
    const codeNa = finding?.result === "na";

    if (codeFail || axeFail) {
      result = "fail";
      owner = codeFail && axeFail ? "mixed" : codeFail ? finding!.owner : "axe";
      if (axeFail && !codeFail) notes = notes || "axe-core reported a WCAG 2.0 violation mapped to this SC.";
    } else if (codeNa && jevHits.length === 0 && !axeHit?.incomplete.length) {
      result = "na";
      owner = "code";
    } else if (jevHits.length) {
      const polarity = FAILURE_PROPOSITIONS.has(def.id) ? "failure" : "success";
      const outcomes = jevHits
        .filter((j) => j.trace.noul !== undefined)
        .map((j) => noulToOutcome(j.trace.noul!, polarity));
      if (outcomes.includes("fail")) {
        result = "fail";
        owner = tools.includes("code") || tools.includes("axe") ? "mixed" : "jev";
        notes = [notes, "At least one Jev Noul crossed the fail threshold. Engine decision, not a Jev verdict."].filter(Boolean).join(" ");
      } else if (outcomes.length && outcomes.every((o) => o === "pass") && !axeHit?.incomplete.length) {
        result = codePass || !finding ? "pass" : finding.result;
        owner = tools.length > 1 ? "mixed" : "jev";
        notes = [notes, "All Jev Nouls for this SC cleared the pass threshold."].filter(Boolean).join(" ");
      } else {
        result = "needs_review";
        owner = "jev";
        notes = [notes, "Jev Noul in the review band, or mixed item-level answers. Human reviews the snippets."].filter(Boolean).join(" ");
      }
    } else if (codePass && !axeHit?.incomplete.length) {
      result = "pass";
      owner = finding!.owner;
    } else if (finding) {
      result = finding.result;
      owner = finding.owner;
    } else if (axeHit?.passes && !axeHit.incomplete.length) {
      result = "pass";
      owner = "axe";
      notes = notes || "axe-core passed mapped rules. This is not coverage of the full SC.";
      evidence.push({ source: "axe", snippet: `${axeHit.passes} mapped axe rule(s) passed.` });
    } else {
      result = "needs_review";
      owner = "human";
      notes = notes || "No deterministic owner completed this SC. Human required.";
      if (!evidence.length) {
        evidence.push({ source: "human", snippet: "Not tested beyond inventory heuristics." });
      }
    }

    return base(def, {
      result,
      owner,
      applicable: true,
      evidence,
      jev: traces.length ? traces : undefined,
      notes,
      tools: [...new Set(tools.length ? tools : [owner])],
    });
  });

  const applicable = criteria.filter((c) => c.applicable);
  const counts = {
    pass: applicable.filter((c) => c.result === "pass").length,
    fail: applicable.filter((c) => c.result === "fail").length,
    na: criteria.filter((c) => c.result === "na").length,
    needs_review: applicable.filter((c) => c.result === "needs_review").length,
    applicable: applicable.length,
    testedDeterministic: applicable.filter((c) => c.result === "pass" || c.result === "fail").length,
  };

  let status: DraftReport["status"];
  if (counts.fail > 0) status = "does_not_meet_tested";
  else if (counts.needs_review > 0) status = "incomplete_review_required";
  else status = "no_failures_on_tested";

  const coverage = counts.applicable ? counts.testedDeterministic / counts.applicable : 0;
  const risk =
    100 *
    (1 -
      (counts.pass + 0.35 * counts.needs_review) / Math.max(1, counts.applicable));

  return {
    product: "508 Draft Rater",
    disclaimer:
      "Pre-audit draft only. This tool does not certify Revised Section 508 conformance, does not produce a signed ACR or VPAT, and must not be quoted as “508 compliant” or “508 certified.” A human signs legal documents. Official conformance fails if any applicable WCAG 2.0 success criterion fails. Functional Performance Criteria (302.x) are impact tags and a fallback when technical provisions do not cover a feature — not a substitute for WCAG.",
    pack: "Revised Section 508 E205 → WCAG 2.0 Level A and AA",
    contentKind: kind,
    source,
    fetchedAt: new Date().toISOString(),
    page: { title: inv.title || undefined, lang: inv.htmlLang || undefined, url: inv.url },
    status,
    statusLabel: STATUS_LABELS[status],
    riskCoverageIndex: {
      value: Math.round(Math.min(100, Math.max(0, risk))),
      label: "risk/coverage index",
      formula: "100 * (1 - (pass + 0.35 * needs_review) / applicable). Not a compliance score. Higher = more residual risk given this pass’s coverage.",
    },
    counts,
    criteria,
    inventorySummary: {
      images: inv.images.length,
      links: inv.links.length,
      headings: inv.headings.length,
      forms: inv.forms.length,
      media: inv.media.length,
      coverage,
    },
    referee: { implementation: referee.name, model: referee.model },
    limitations: [
      "v1 rates one HTML page as web content (E205). Native binaries and documents-as-binaries are out of scope.",
      "Jev accepts text only. Images, audio, and video are not sent to System One.",
      "axe-core runs in jsdom; color-contrast and some visual rules are incomplete outside a real browser.",
      "2.4.5, 3.2.3, and 3.2.4 need a set of pages.",
      "Keyboard traps, focus order, live media, flashing, and transaction confirmation need a human.",
      "WCAG 2.2 is not part of this legal pack.",
    ],
  };
}

function base(
  def: { id: string; name: string; level: "A" | "AA"; fpc: CriterionResult["fpc"] },
  rest: Omit<CriterionResult, "id" | "name" | "level" | "fpc">,
): CriterionResult {
  return { id: def.id, name: def.name, level: def.level, fpc: def.fpc, ...rest };
}

function uniqueOwner(tools: Owner[]): Owner {
  const u = [...new Set(tools)];
  if (u.length === 0) return "human";
  if (u.length === 1) return u[0];
  return "mixed";
}

function groupJev(
  jevAnswers: CombineInput["jevAnswers"],
): Map<string, Array<{ job: JevJob; trace: JevTrace }>> {
  const map = new Map<string, Array<{ job: JevJob; trace: JevTrace }>>();
  for (const ans of jevAnswers.values()) {
    const job = ans.job;
    const polarity = FAILURE_PROPOSITIONS.has(job.criterionId) ? "failure" : "success";
    const trace: JevTrace = {
      questionId: job.questionId,
      primitive: ans.type === "choice" ? "choice" : "noul",
      noul: ans.noul,
      choice: ans.choice,
      probabilities: ans.probabilities,
      confidence: ans.confidence,
      proposition: typeof job.question.instructions === "string" ? job.question.instructions : "",
      threshold:
        polarity === "success"
          ? { passBelow: undefined, failAbove: NOUL.successFailBelow, reviewBand: [NOUL.successFailBelow, NOUL.successPassAbove] }
          : { failAbove: NOUL.failAbove, passBelow: NOUL.passBelow, reviewBand: [NOUL.passBelow, NOUL.failAbove] },
    };
    const arr = map.get(job.criterionId) || [];
    arr.push({ job, trace });
    map.set(job.criterionId, arr);
  }
  return map;
}
