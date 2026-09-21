import type { CriterionResult, Outcome, Owner, PageInventory } from "../types.ts";
import { contrastRatio } from "./contrast.ts";
import type { CriterionDef } from "../catalog/criteria.ts";

export interface CodeFinding {
  id: string;
  result: Outcome;
  owner: Owner;
  evidence: CriterionResult["evidence"];
  notes: string;
}

export function runCodeChecks(inv: PageInventory, defs: CriterionDef[]): Record<string, CodeFinding> {
  const out: Record<string, CodeFinding> = {};
  const put = (id: string, finding: Omit<CodeFinding, "id">) => {
    out[id] = { id, ...finding };
  };

  // 1.1.1 structural: missing alt attribute is a code fail.
  const missingAlt = inv.images.filter((i) => !i.hasAltAttr && !i.ariaHidden);
  const hasNonText = inv.images.length + inv.svgs.length + inv.media.filter((m) => m.kind !== "track").length;
  if (hasNonText === 0) {
    put("1.1.1", {
      result: "na",
      owner: "code",
      evidence: [{ source: "code", snippet: "No img, svg, audio, or video elements detected. CSS background images are not inventoried." }],
      notes: "N/A on detected replaced content only. Decorative CSS and icon fonts are untested.",
    });
  } else if (missingAlt.length) {
    put("1.1.1", {
      result: "fail",
      owner: "code",
      evidence: missingAlt.slice(0, 5).map((i) => ({
        source: "code",
        selector: i.selector,
        snippet: `<img src="${i.src.slice(0, 80)}" — missing alt attribute>`,
      })),
      notes: "WCAG 2.0 1.1.1 requires a text alternative. Missing alt is a structural fail. Alt quality is a separate Jev pass when alt exists.",
    });
  }

  // 1.2.x presence
  const audio = inv.media.filter((m) => m.kind === "audio");
  const video = inv.media.filter((m) => m.kind === "video");
  const tracks = inv.media.filter((m) => m.kind === "track");
  const captions = tracks.filter((t) => (t.attrs.kind || "").toLowerCase() === "captions" || t.attrs["track:captions"]);
  if (audio.length + video.length === 0) {
    for (const id of ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"]) {
      put(id, {
        result: "na",
        owner: "code",
        evidence: [{ source: "code", snippet: "No <audio> or <video> elements on this page." }],
        notes: "Media SCs not applicable to detected elements. Embedded players (iframes) need human review.",
      });
    }
  } else {
    if (video.length && captions.length === 0) {
      put("1.2.2", {
        result: "needs_review",
        owner: "human",
        evidence: video.slice(0, 3).map((v) => ({ source: "code", selector: v.selector, snippet: "<video> without a captions <track> in markup." })),
        notes: "No captions track in markup. Captions may be provided by a player UI — human must confirm. Do not treat absence of <track> as automatic fail for all players.",
      });
    }
    put("1.2.4", {
      result: "needs_review",
      owner: "human",
      evidence: [{ source: "code", snippet: "Live vs prerecorded cannot be determined from static HTML." }],
      notes: "Live captions require observing the session.",
    });
    put("1.2.3", {
      result: "needs_review",
      owner: "human",
      evidence: [{ source: "code", snippet: "Audio description / media alternative cannot be verified from markup alone." }],
      notes: "Human checks the media resource.",
    });
    put("1.2.5", {
      result: "needs_review",
      owner: "human",
      evidence: [{ source: "code", snippet: "Prerecorded audio description not verifiable from markup." }],
      notes: "Human checks the media resource.",
    });
    put("1.2.1", {
      result: "needs_review",
      owner: "human",
      evidence: [{ source: "code", snippet: `${audio.length} audio, ${video.length} video element(s). Alternative transcript/description not proven.` }],
      notes: "Need transcript or audio description resource.",
    });
  }

  // 1.4.2 autoplay audio
  const autoAudio = inv.media.filter((m) => m.kind === "audio" && "autoplay" in m.attrs);
  if (autoAudio.length) {
    put("1.4.2", {
      result: "needs_review",
      owner: "human",
      evidence: autoAudio.map((m) => ({ source: "code", selector: m.selector, snippet: "<audio autoplay> present." })),
      notes: "Autoplay present. Duration and a pause control must be confirmed in a browser.",
    });
  } else if (!audio.length) {
    put("1.4.2", {
      result: "na",
      owner: "code",
      evidence: [{ source: "code", snippet: "No autoplaying audio element detected." }],
      notes: "Does not prove absence of script-injected audio.",
    });
  }

  // 1.4.3 inline contrast only
  const contrastFails = inv.colorPairs
    .map((p) => ({ ...p, ratio: contrastRatio(p.color, p.background) }))
    .filter((p) => p.ratio !== null && (p.ratio as number) < 4.5);
  if (contrastFails.length) {
    put("1.4.3", {
      result: "fail",
      owner: "code",
      evidence: contrastFails.slice(0, 5).map((p) => ({
        source: "code",
        selector: p.selector,
        snippet: `contrast ${p.ratio!.toFixed(2)}:1 color ${p.color} on ${p.background} — “${p.text}”`,
      })),
      notes: "Only inline color + background-color pairs. Computed CSS and images are out of scope for this code check.",
    });
  } else if (inv.colorPairs.length === 0) {
    put("1.4.3", {
      result: "needs_review",
      owner: "axe",
      evidence: [{ source: "code", snippet: "No inline color/background pairs to compute. Stylesheets need axe or a browser." }],
      notes: "Partial coverage.",
    });
  }

  // 2.4.1 skip / landmark
  const hasMain = inv.landmarks.some((l) => l === "main" || l === "banner" || l === "navigation" || l === "nav");
  if (inv.skipLinks.length || hasMain) {
    put("2.4.1", {
      result: "pass",
      owner: "code",
      evidence: [
        ...(inv.skipLinks.length
          ? inv.skipLinks.slice(0, 2).map((s) => ({ source: "code" as const, snippet: `skip-style link “${s.text}” → ${s.href}` }))
          : [{ source: "code" as const, snippet: `landmarks: ${inv.landmarks.join(", ")}` }]),
      ],
      notes: "Structural bypass present (skip link and/or landmark). Destination validity of skip href is not fully proven.",
    });
  } else {
    put("2.4.1", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: "No skip link matching skip/main/content and no main/nav/header landmark." }],
      notes: "Single-page sites with no repeated blocks may still argue N/A; this rater treats missing mechanism as fail for typical federal pages.",
    });
  }

  // 2.4.2 title
  if (!inv.title) {
    put("2.4.2", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: "No <title> text." }],
      notes: "Missing title is a structural fail. Descriptive quality is a Jev question when title exists.",
    });
  } else if (/^(untitled|new page|document|page)$/i.test(inv.title)) {
    put("2.4.2", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: `Non-descriptive title: “${inv.title}”` }],
      notes: "Placeholder titles fail 2.4.2 on their face.",
    });
  }

  // 3.1.1 lang
  if (!inv.htmlLang) {
    put("3.1.1", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: "<html> has no lang (or xml:lang) attribute." }],
      notes: "Language of page is not programmatically determinable.",
    });
  } else if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(inv.htmlLang)) {
    put("3.1.1", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: `lang="${inv.htmlLang}" is not a well-formed primary language subtag.` }],
      notes: "Invalid language tag.",
    });
  } else {
    put("3.1.1", {
      result: "pass",
      owner: "code",
      evidence: [{ source: "code", snippet: `<html lang="${inv.htmlLang}">` }],
      notes: "Attribute present and well-formed. Whether it matches the actual language is a possible Jev check.",
    });
  }

  // 3.3.2 labels
  const unlabeled = inv.forms.flatMap((f) => f.controls.filter((c) => !c.hasLabel && !c.title));
  if (inv.forms.length === 0) {
    put("3.3.2", {
      result: "na",
      owner: "code",
      evidence: [{ source: "code", snippet: "No <form> with visible inputs." }],
      notes: "Inputs outside <form> are only partially inventoried.",
    });
  } else if (unlabeled.length) {
    put("3.3.2", {
      result: "fail",
      owner: "code",
      evidence: unlabeled.slice(0, 5).map((c) => ({
        source: "code",
        selector: c.selector,
        snippet: `${c.tag}${c.type ? `[type=${c.type}]` : ""} name=${c.name || "?"} has no label / aria-label / aria-labelledby.`,
      })),
      notes: "Missing accessible name for required input is a 3.3.2 / 4.1.2 structural issue.",
    });
  } else {
    put("3.3.2", {
      result: "pass",
      owner: "code",
      evidence: [{ source: "code", snippet: "Every inventoried form control has a label or ARIA name." }],
      notes: "Label quality (instructions) may still need Jev/human.",
    });
  }

  // 4.1.2 iframe titles + empty buttons
  const unnamedIframes = inv.iframeTitles.filter((f) => !f.title);
  const unnamedButtons = inv.buttons.filter((b) => !b.text && !b.ariaLabel);
  if (unnamedIframes.length || unnamedButtons.length) {
    put("4.1.2", {
      result: "fail",
      owner: "code",
      evidence: [
        ...unnamedIframes.slice(0, 3).map((f) => ({ source: "code" as const, selector: f.selector, snippet: "iframe without title or aria-label" })),
        ...unnamedButtons.slice(0, 3).map((b) => ({ source: "code" as const, selector: b.selector, snippet: "button/control with empty accessible name" })),
      ],
      notes: "Name missing on custom or embedded controls.",
    });
  }

  // 2.2.2 blink/marquee
  if (inv.blinkMarquee) {
    put("2.2.2", {
      result: "fail",
      owner: "code",
      evidence: [{ source: "code", snippet: "<blink>, <marquee>, or blink animation detected." }],
      notes: "Moving content without a pause control in markup.",
    });
  }

  // 2.4.3 positive tabindex is a smell, not an automatic fail
  if (inv.tabIndexPositive > 0) {
    put("2.4.3", {
      result: "needs_review",
      owner: "human",
      evidence: [{ source: "code", snippet: `${inv.tabIndexPositive} element(s) use tabindex > 0.` }],
      notes: "Positive tabindex often breaks focus order. Confirm in a browser.",
    });
  }

  // 2.4.5 / 3.2.3 / 3.2.4 need a set of pages
  put("2.4.5", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Single-page v1 input. Multiple ways is a property of a set of pages." }],
    notes: "Cannot pass or fail 2.4.5 from one HTML document.",
  });
  put("3.2.3", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Consistent navigation requires comparing pages in a set." }],
    notes: "Site-context SC.",
  });
  put("3.2.4", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Consistent identification requires comparing components across pages." }],
    notes: "Site-context SC.",
  });

  // 2.1.1 / 2.1.2 / 2.4.7 / 2.3.1 / 3.2.1 / 3.2.2 always need human or limited axe
  put("2.1.1", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: inv.scriptsHintKeyboard ? "Keyboard event handlers present in source." : "No static proof that custom widgets are keyboard operable." }],
    notes: "Keyboard access is a runtime check. Code only flags presence of handlers.",
  });
  put("2.1.2", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Keyboard trap cannot be detected from static HTML." }],
    notes: "Requires tabbing through widgets, dialogs, and media players.",
  });
  put("2.4.7", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Focus visibility depends on computed CSS :focus styles." }],
    notes: "jsdom cannot reliably prove 2.4.7.",
  });
  put("2.3.1", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Flash rate of animations and video is not measured." }],
    notes: "Seizure risk is a human/lab check.",
  });
  put("3.2.1", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Change of context on focus is a runtime behavior." }],
    notes: "Observe focus movement.",
  });
  put("3.2.2", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Change of context on input is a runtime behavior." }],
    notes: "Observe form controls.",
  });
  put("1.4.4", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "200% zoom reflow is a browser check. Fixed px containers are not fully analyzed." }],
    notes: "Partial.",
  });
  put("3.3.1", {
    result: "needs_review",
    owner: inv.forms.length ? "human" : "code",
    evidence: [{ source: "code", snippet: inv.forms.length ? "Error identification requires submitting invalid data." : "No forms detected." }],
    notes: inv.forms.length ? "Human or test harness." : "No form to invalidate.",
  });
  if (!inv.forms.length) {
    out["3.3.1"].result = "na";
    out["3.3.1"].owner = "code";
  }
  put("3.3.3", {
    result: inv.forms.length ? "needs_review" : "na",
    owner: inv.forms.length ? "human" : "code",
    evidence: [{ source: "code", snippet: inv.forms.length ? "Error suggestion requires observing validation UI." : "No forms detected." }],
    notes: "Runtime.",
  });
  put("3.3.4", {
    result: "needs_review",
    owner: "human",
    evidence: [{ source: "code", snippet: "Legal/financial/data submissions cannot be classified from a single page snapshot." }],
    notes: "If the page is not a legal, financial, or user-data transaction, a human may mark N/A.",
  });
  put("2.2.1", {
    result: inv.timedHints ? "needs_review" : "na",
    owner: inv.timedHints ? "human" : "code",
    evidence: [{ source: "code", snippet: inv.timedHints ? "Timers or meta refresh appear in source." : "No timer / meta refresh detected in source." }],
    notes: "Script-injected timeouts after load are untested.",
  });

  void defs;
  return out;
}
