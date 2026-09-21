import type { ContentKind, FpcKey, WcagLevel } from "../types.ts";

export interface CriterionDef {
  id: string;
  name: string;
  level: WcagLevel;
  /** Official WCAG 2.0 short name only. */
  fpc: FpcKey[];
  /**
   * Four WCAG SCs are not required for non-web documents/software
   * (E205.4 / E207.2 exceptions): 2.4.1, 2.4.5, 3.2.3, 3.2.4.
   */
  exceptedForNonWeb: boolean;
  /**
   * Single HTML page cannot fully prove multi-page SCs.
   */
  needsSiteContext: boolean;
  summary: string;
}

/** WCAG 2.0 A+AA as incorporated by Revised Section 508 E205.4. Do not add 2.1/2.2 SCs. */
export const WCAG20_AA: CriterionDef[] = [
  { id: "1.1.1", name: "Non-text Content", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Text alternative for non-text content.", fpc: ["without_vision", "limited_vision", "without_hearing", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Alternative for prerecorded audio-only or video-only.", fpc: ["without_vision", "limited_vision", "without_hearing", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Captions for prerecorded synchronized media.", fpc: ["without_hearing", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "AD or media alternative for prerecorded video.", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Captions for live synchronized media.", fpc: ["without_hearing", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Audio description for prerecorded video.", fpc: ["without_vision", "limited_vision"] },
  { id: "1.3.1", name: "Info and Relationships", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Structure programmatically determinable.", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Reading sequence preserves meaning.", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Instructions not solely by shape, color, size, location, sound.", fpc: ["without_vision", "limited_vision", "without_hearing", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.4.1", name: "Use of Color", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Color is not the only visual means.", fpc: ["without_vision", "limited_vision", "without_perception_of_color", "limited_language_cognitive"] },
  { id: "1.4.2", name: "Audio Control", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Autoplaying audio longer than 3s can be paused or controlled.", fpc: ["without_vision", "limited_hearing", "limited_language_cognitive"] },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "4.5:1 text; 3:1 large text.", fpc: ["limited_vision", "without_perception_of_color"] },
  { id: "1.4.4", name: "Resize text", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Text can be resized to 200% without assistive tech.", fpc: ["limited_vision"] },
  { id: "1.4.5", name: "Images of Text", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Text used rather than images of text except customizable or essential.", fpc: ["limited_vision", "limited_language_cognitive"] },
  { id: "2.1.1", name: "Keyboard", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "All functionality available from a keyboard.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Keyboard focus can move away from components.", fpc: ["without_vision", "limited_vision", "limited_manipulation"] },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Time limits can be turned off, adjusted, or extended.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Moving, blinking, scrolling, auto-updating can be paused.", fpc: ["limited_language_cognitive"] },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Nothing flashes more than three times per second, or is below general flash thresholds.", fpc: [] },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", exceptedForNonWeb: true, needsSiteContext: false, summary: "A mechanism to skip repeated blocks.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.4.2", name: "Page Titled", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Pages have titles that describe topic or purpose.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.4.3", name: "Focus Order", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Focus order preserves meaning and operability.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Purpose of each link can be determined from text or context.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", exceptedForNonWeb: true, needsSiteContext: true, summary: "More than one way to locate a web page within a set of pages.", fpc: ["without_vision", "limited_language_cognitive"] },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Headings and labels describe topic or purpose.", fpc: ["limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "2.4.7", name: "Focus Visible", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Keyboard focus indicator is visible.", fpc: ["limited_vision", "limited_manipulation"] },
  { id: "3.1.1", name: "Language of Page", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Default human language programmatically determinable.", fpc: ["without_vision", "limited_language_cognitive"] },
  { id: "3.1.2", name: "Language of Parts", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Language of passages programmatically determinable.", fpc: ["without_vision", "limited_language_cognitive"] },
  { id: "3.2.1", name: "On Focus", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Focus does not initiate a change of context.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "3.2.2", name: "On Input", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Changing a setting does not automatically change context unless advised.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", exceptedForNonWeb: true, needsSiteContext: true, summary: "Repeated navigational mechanisms occur in the same relative order.", fpc: ["limited_vision", "limited_language_cognitive"] },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", exceptedForNonWeb: true, needsSiteContext: true, summary: "Components with the same functionality identified consistently.", fpc: ["without_vision", "limited_language_cognitive"] },
  { id: "3.3.1", name: "Error Identification", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Input errors are identified and described in text.", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Labels or instructions when content requires input.", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Suggestions provided when an input error is detected, unless security risk.", fpc: ["without_vision", "limited_language_cognitive"] },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", exceptedForNonWeb: false, needsSiteContext: false, summary: "Reversible, checked, or confirmed for legal/financial/data submissions.", fpc: ["limited_language_cognitive"] },
  { id: "4.1.1", name: "Parsing", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Elements have complete start/end tags, unique IDs (WCAG 2.0).", fpc: ["without_vision", "limited_vision", "limited_language_cognitive"] },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", exceptedForNonWeb: false, needsSiteContext: false, summary: "Name and role programmatically determinable; states settable.", fpc: ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"] },
];

export function isApplicable(def: CriterionDef, kind: ContentKind): boolean {
  if (kind !== "web" && def.exceptedForNonWeb) return false;
  return true;
}

export const DISCLAIMER =
  "Pre-audit draft only. This tool does not certify Revised Section 508 conformance, does not produce a signed ACR or VPAT, and must not be quoted as “508 compliant” or “508 certified.” A human signs legal documents. Official conformance fails if any applicable WCAG 2.0 success criterion fails. Functional Performance Criteria (302.x) are impact tags and a fallback when technical provisions do not cover a feature — not a substitute for WCAG.";

export const STATUS_LABELS = {
  does_not_meet_tested: "Does not meet WCAG 2.0 AA on tested criteria",
  incomplete_review_required: "Incomplete — review required",
  no_failures_on_tested: "No failures on tested criteria (not a full 508 audit)",
} as const;
