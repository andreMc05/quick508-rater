import type { Question, Referee, RefereeResult, State } from "../types.ts";

/**
 * Offline Referee. Deterministic heuristics so the product runs without a key.
 * Not a stand-in for Jev calibration — labeled implementation: stub.
 */
export class StubReferee implements Referee {
  name = "stub" as const;
  model = "stub-heuristic";

  async interpret(state: State, questions: Record<string, Question>): Promise<RefereeResult> {
    const answers: RefereeResult["answers"] = {};
    const blob = flattenState(state).toLowerCase();
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === "noul") {
        answers[id] = { type: "noul", noul: noulHeuristic(q.instructions, blob) };
      } else {
        const keys = Object.keys(q.criteria);
        const picked = pickChoice(keys, q.instructions, blob);
        const probabilities: Record<string, number> = {};
        const rest = (1 - picked.p) / Math.max(1, keys.length - 1);
        for (const k of keys) probabilities[k] = k === picked.key ? picked.p : rest;
        answers[id] = {
          type: "choice",
          choice: picked.key,
          probabilities,
          confidence: picked.p,
        };
      }
    }
    return { model: this.model, answers };
  }
}

function flattenState(state: State): string {
  if (typeof state === "string") return state;
  try {
    return JSON.stringify(state);
  } catch {
    return String(state);
  }
}

function noulHeuristic(instructions: string, blob: string): number {
  const inst = instructions.toLowerCase();
  const failish = [
    "click here",
    "read more",
    "learn more",
    "here",
    "image",
    "graphic",
    "photo",
    "picture",
    "untitled",
    "lorem ipsum",
    "see the red",
    "click the button on the right",
    "as shown above",
  ];
  const goodish = ["describes", "purpose", "home page of", "search the", "submit application"];

  if (inst.includes("equivalent") || inst.includes("describe") || inst.includes("purpose of the image")) {
    if (failish.some((w) => blob.includes(`"alt":"${w}"`) || blob.includes(`alt": "${w}`) || blob.includes(w) && blob.includes("alt"))) {
      if (/\b(image|graphic|photo|picture|untitled)\b/.test(blob) && blob.length < 400) return 0.18;
    }
  }
  if (inst.includes("link purpose") || inst.includes("purpose of the link")) {
    if (/\b(click here|here|read more|learn more|more|link)\b/.test(blob) && blob.length < 500) return 0.22;
    return 0.78;
  }
  if (inst.includes("heading") && inst.includes("describe")) {
    if (/\b(untitled|heading|click here|lorem)\b/.test(blob)) return 0.25;
    return 0.8;
  }
  if (inst.includes("sensory") || inst.includes("only by color") || inst.includes("shape, size, location")) {
    if (/\b(click the red|green button|on the right|round button|see the color)\b/.test(blob)) return 0.86;
    return 0.12;
  }
  if (inst.includes("image of text") || inst.includes("images of text")) {
    if (/\b(png|jpg|gif|src=.+\.(png|jpg|jpeg|gif))\b/.test(blob) && /\b(welcome|submit|login|download)\b/.test(blob)) return 0.7;
    return 0.2;
  }
  if (inst.includes("title describe")) {
    if (/\b(untitled|home|page|document|new page)\b/.test(blob) && blob.length < 80) return 0.3;
    return 0.82;
  }
  if (goodish.some((g) => blob.includes(g))) return 0.84;
  // Mid band → code will mark needs_review rather than invent certainty.
  return 0.52;
}

function pickChoice(keys: string[], instructions: string, blob: string): { key: string; p: number } {
  const lower = keys.map((k) => k.toLowerCase());
  if (lower.includes("needs_review")) {
    return { key: keys[lower.indexOf("needs_review")], p: 0.55 };
  }
  return { key: keys[0], p: 0.6 };
}
