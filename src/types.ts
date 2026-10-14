/** Shared types for 508 Draft Rater. No conformance language lives here. */

export type Outcome = "pass" | "fail" | "na" | "needs_review";
export type Owner = "code" | "axe" | "jev" | "human" | "mixed";
export type WcagLevel = "A" | "AA";
export type ContentKind = "web" | "non_web_document" | "non_web_software";

export type FpcKey =
  | "without_vision"
  | "limited_vision"
  | "without_perception_of_color"
  | "without_hearing"
  | "limited_hearing"
  | "without_speech"
  | "limited_manipulation"
  | "limited_reach_and_strength"
  | "limited_language_cognitive";

export type PageStatus =
  | "does_not_meet_tested"
  | "incomplete_review_required"
  | "no_failures_on_tested";

export interface Evidence {
  source: Owner;
  snippet: string;
  selector?: string;
  /** Stable snapshot id, as `[data-r508="img-0"]`. */
  targetId?: string;
  ruleId?: string;
}

export interface JevTrace {
  questionId: string;
  primitive: "noul" | "choice";
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  threshold?: { passBelow?: number; failAbove?: number; reviewBand?: [number, number] };
  proposition: string;
}

export interface CriterionResult {
  id: string;
  name: string;
  level: WcagLevel;
  result: Outcome;
  owner: Owner;
  applicable: boolean;
  evidence: Evidence[];
  jev?: JevTrace[];
  fpc: FpcKey[];
  notes: string;
  /** Short next action for the review pane. Not a legal fix. */
  remedy?: string;
  tools: Owner[];
}

export interface DraftReport {
  product: "508 Draft Rater";
  disclaimer: string;
  pack: "Revised Section 508 E205 → WCAG 2.0 Level A and AA";
  contentKind: ContentKind;
  source: { kind: "url" | "html" | "file"; value: string };
  fetchedAt: string;
  page: {
    title?: string;
    lang?: string;
    url?: string;
  };
  status: PageStatus;
  statusLabel: string;
  riskCoverageIndex?: {
    value: number;
    label: "risk/coverage index";
    formula: string;
  };
  counts: {
    pass: number;
    fail: number;
    na: number;
    needs_review: number;
    applicable: number;
    testedDeterministic: number;
  };
  criteria: CriterionResult[];
  inventorySummary: Record<string, number>;
  referee: { implementation: "typesafe" | "stub"; model?: string };
  limitations: string[];
  /** Annotated HTML snapshot for in-app jump-to-target. Omitted from CLI JSON unless requested. */
  previewHtml?: string;
}

export interface QuestionNoul {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export interface QuestionChoice {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}

export type Question = QuestionNoul | QuestionChoice;

export type State = string | Record<string, unknown> | unknown[];

export interface RefereeResult {
  model: string;
  answers: Record<
    string,
    | { type: "noul"; noul: number }
    | {
        type: "choice";
        choice: string;
        probabilities: Record<string, number>;
        confidence: number;
      }
  >;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface Referee {
  name: "typesafe" | "stub";
  model?: string;
  interpret(state: State, questions: Record<string, Question>): Promise<RefereeResult>;
}

export interface PageInventory {
  html: string;
  url?: string;
  title: string | null;
  htmlLang: string | null;
  images: Array<{
    selector: string;
    src: string;
    alt: string | null;
    hasAltAttr: boolean;
    ariaHidden: boolean;
    role: string | null;
    inLink: boolean;
    nearbyText: string;
  }>;
  svgs: Array<{ selector: string; title: string | null; ariaLabel: string | null; ariaHidden: boolean }>;
  links: Array<{
    selector: string;
    href: string;
    text: string;
    ariaLabel: string | null;
    context: string;
  }>;
  headings: Array<{ selector: string; level: number; text: string }>;
  landmarks: string[];
  skipLinks: Array<{ href: string; text: string }>;
  forms: Array<{
    selector: string;
    controls: Array<{
      selector: string;
      tag: string;
      type: string | null;
      id: string | null;
      name: string | null;
      hasLabel: boolean;
      ariaLabel: string | null;
      title: string | null;
      required: boolean;
    }>;
  }>;
  media: Array<{ kind: "audio" | "video" | "track"; selector: string; attrs: Record<string, string> }>;
  langParts: Array<{ selector: string; lang: string; text: string }>;
  titleElements: string[];
  iframeTitles: Array<{ selector: string; title: string | null }>;
  buttons: Array<{ selector: string; text: string; ariaLabel: string | null; type: string | null }>;
  timedHints: boolean;
  blinkMarquee: boolean;
  autofocus: boolean;
  tabIndexPositive: number;
  accessKeys: number;
  scriptsHintKeyboard: boolean;
  colorPairs: Array<{ selector: string; color: string; background: string; text: string }>;
}
