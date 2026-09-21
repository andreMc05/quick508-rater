import type { PageInventory, Question, Referee, State } from "../types.ts";

export interface JevJob {
  criterionId: string;
  questionId: string;
  state: State;
  question: Question;
  snippet: string;
  selector?: string;
}

/**
 * Lean, isolated Jev jobs. One proposition per question.
 * Do not ship the whole document. Do not use Score for pass/fail.
 */
export function buildJevJobs(inv: PageInventory): JevJob[] {
  const jobs: JevJob[] = [];

  for (const img of inv.images) {
    if (!img.hasAltAttr || img.ariaHidden) continue;
    const alt = img.alt ?? "";
    if (alt.trim() === "") continue; // decorative pattern — code/axe, not Jev
    jobs.push({
      criterionId: "1.1.1",
      questionId: `alt_equiv_${jobs.length}`,
      snippet: alt,
      selector: img.selector,
      state: {
        image_src: img.src.slice(0, 120),
        alt_text: alt,
        nearby_text: img.nearbyText,
        in_link: img.inLink,
      },
      question: {
        type: "noul",
        instructions:
          "Does this alt text serve as a text equivalent for the image’s purpose in this context (not a filename, not a generic word like image/photo/graphic, not a keyword dump)?",
        criteria: {
          true: "A person who cannot see the image would understand the same purpose from the alt text plus nearby text.",
          false: "The alt is generic, a filename, decorative wording on an informative image, or unrelated to purpose.",
        },
      },
    });
  }

  const vague = /^(click here|here|read more|learn more|more|link|this|continue)$/i;
  for (const link of inv.links.slice(0, 20)) {
    const name = (link.ariaLabel || link.text || "").trim();
    if (!name) continue;
    if (!vague.test(name) && name.split(/\s+/).length >= 4) continue;
    jobs.push({
      criterionId: "2.4.4",
      questionId: `link_purpose_${jobs.length}`,
      snippet: name,
      selector: link.selector,
      state: {
        link_text: name,
        href: link.href.slice(0, 160),
        surrounding_sentence: link.context,
      },
      question: {
        type: "noul",
        instructions:
          "Can a person determine the purpose of this link from the link text together with the immediately surrounding sentence (WCAG 2.0 2.4.4 in context)?",
        criteria: {
          true: "The destination or action is clear from text plus that sentence.",
          false: "The text is generic and the surrounding sentence does not identify the purpose.",
        },
      },
    });
  }

  for (const h of inv.headings.slice(0, 15)) {
    if (!h.text) continue;
    jobs.push({
      criterionId: "2.4.6",
      questionId: `heading_${jobs.length}`,
      snippet: h.text,
      selector: h.selector,
      state: { heading_level: h.level, heading_text: h.text },
      question: {
        type: "noul",
        instructions: "Does this heading describe the topic or purpose of the section it introduces?",
        criteria: {
          true: "A reader could use this heading to understand what the section is about.",
          false: "The heading is empty of meaning, placeholder, or unrelated.",
        },
      },
    });
  }

  if (inv.title) {
    jobs.push({
      criterionId: "2.4.2",
      questionId: "title_describes",
      snippet: inv.title,
      state: { page_title: inv.title, url: inv.url || "" },
      question: {
        type: "noul",
        instructions: "Does this page title describe the topic or purpose of the page?",
        criteria: {
          true: "The title identifies the page’s topic or purpose.",
          false: "The title is generic, branded-only with no topic, or a placeholder.",
        },
      },
    });
  }

  // Sensory characteristics: sample body-ish snippets from nearby link/heading text.
  const sensoryCorpus = [
    ...inv.links.map((l) => l.context),
    ...inv.headings.map((h) => h.text),
  ]
    .join(" ")
    .slice(0, 1200);
  if (sensoryCorpus.length > 40) {
    jobs.push({
      criterionId: "1.3.3",
      questionId: "sensory_only",
      snippet: sensoryCorpus.slice(0, 200),
      state: { instructions_and_labels: sensoryCorpus },
      question: {
        type: "noul",
        instructions:
          "Do these instructions rely only on sensory characteristics (shape, size, visual location, orientation, or sound) without another identifier?",
        criteria: {
          true: "Users are told only things like ‘the button on the right’, ‘the round icon’, or ‘the red item’.",
          false: "Instructions also use names or text labels.",
        },
      },
    });
  }

  const colorCorpus = sensoryCorpus;
  if (colorCorpus.length > 40) {
    jobs.push({
      criterionId: "1.4.1",
      questionId: "color_only",
      snippet: colorCorpus.slice(0, 200),
      state: { visible_text: colorCorpus },
      question: {
        type: "noul",
        instructions:
          "Does this text use color as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing an element?",
        criteria: {
          true: "Meaning is given only by color (for example ‘required fields are red’ with no other marker).",
          false: "Color is not the only cue, or color is not used to convey meaning.",
        },
      },
    });
  }

  // Images of text — only when alt or nearby suggests the image carries words.
  for (const img of inv.images.slice(0, 10)) {
    const blob = `${img.alt || ""} ${img.src} ${img.nearbyText}`;
    if (!/\b(logo|button|welcome|submit|download|heading|banner|title)\b/i.test(blob)) continue;
    jobs.push({
      criterionId: "1.4.5",
      questionId: `img_text_${jobs.length}`,
      snippet: img.src.slice(0, 80),
      selector: img.selector,
      state: { src: img.src.slice(0, 160), alt: img.alt, nearby: img.nearbyText },
      question: {
        type: "noul",
        instructions:
          "Is this likely an image of text (words drawn in a bitmap) rather than real text, and not a logo or otherwise essential/customizable case?",
        criteria: {
          true: "The image is presenting sentence- or control-level text that should have been HTML text.",
          false: "It is a photograph, icon, logo, or not text.",
        },
      },
    });
  }

  return jobs;
}

export async function runJevJobs(referee: Referee, jobs: JevJob[]): Promise<Map<string, Awaited<ReturnType<Referee["interpret"]>>["answers"][string] & { job: JevJob }>> {
  const out = new Map<string, Awaited<ReturnType<Referee["interpret"]>>["answers"][string] & { job: JevJob }>();
  // Batch by small groups sharing no requirement that they share state.
  // Isolation: one job per request keeps state lean (Jev jaggedness).
  const CONCURRENCY = 4;
  let i = 0;
  async function next() {
    while (i < jobs.length) {
      const job = jobs[i++];
      const res = await referee.interpret(job.state, { [job.questionId]: job.question });
      const ans = res.answers[job.questionId];
      if (ans) out.set(job.questionId, Object.assign({}, ans, { job }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => next()));
  return out;
}
