#!/usr/bin/env python3
"""508 Draft Rater — stdlib runner (same contract as the TypeScript app).

Pre-audit only. Never prints 508 compliant / certified / ACR / VPAT.
"""
from __future__ import annotations

import argparse
import html.parser
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

DISCLAIMER = (
    "Pre-audit draft only. This tool does not certify Revised Section 508 conformance, "
    "does not produce a signed ACR or VPAT, and must not be quoted as “508 compliant” "
    "or “508 certified.” A human signs legal documents. Official conformance fails if "
    "any applicable WCAG 2.0 success criterion fails. Functional Performance Criteria "
    "(302.x) are impact tags and a fallback when technical provisions do not cover a "
    "feature — not a substitute for WCAG."
)

STATUS = {
    "does_not_meet_tested": "Does not meet WCAG 2.0 AA on tested criteria",
    "incomplete_review_required": "Incomplete — review required",
    "no_failures_on_tested": "No failures on tested criteria (not a full 508 audit)",
}

# Official WCAG 2.0 A+AA pack for E205.4
CRITERIA = [
    ("1.1.1", "Non-text Content", "A", False),
    ("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", False),
    ("1.2.2", "Captions (Prerecorded)", "A", False),
    ("1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A", False),
    ("1.2.4", "Captions (Live)", "AA", False),
    ("1.2.5", "Audio Description (Prerecorded)", "AA", False),
    ("1.3.1", "Info and Relationships", "A", False),
    ("1.3.2", "Meaningful Sequence", "A", False),
    ("1.3.3", "Sensory Characteristics", "A", False),
    ("1.4.1", "Use of Color", "A", False),
    ("1.4.2", "Audio Control", "A", False),
    ("1.4.3", "Contrast (Minimum)", "AA", False),
    ("1.4.4", "Resize text", "AA", False),
    ("1.4.5", "Images of Text", "AA", False),
    ("2.1.1", "Keyboard", "A", False),
    ("2.1.2", "No Keyboard Trap", "A", False),
    ("2.2.1", "Timing Adjustable", "A", False),
    ("2.2.2", "Pause, Stop, Hide", "A", False),
    ("2.3.1", "Three Flashes or Below Threshold", "A", False),
    ("2.4.1", "Bypass Blocks", "A", True),
    ("2.4.2", "Page Titled", "A", False),
    ("2.4.3", "Focus Order", "A", False),
    ("2.4.4", "Link Purpose (In Context)", "A", False),
    ("2.4.5", "Multiple Ways", "AA", True),
    ("2.4.6", "Headings and Labels", "AA", False),
    ("2.4.7", "Focus Visible", "AA", False),
    ("3.1.1", "Language of Page", "A", False),
    ("3.1.2", "Language of Parts", "AA", False),
    ("3.2.1", "On Focus", "A", False),
    ("3.2.2", "On Input", "A", False),
    ("3.2.3", "Consistent Navigation", "AA", True),
    ("3.2.4", "Consistent Identification", "AA", True),
    ("3.3.1", "Error Identification", "A", False),
    ("3.3.2", "Labels or Instructions", "A", False),
    ("3.3.3", "Error Suggestion", "AA", False),
    ("3.3.4", "Error Prevention (Legal, Financial, Data)", "AA", False),
    ("4.1.1", "Parsing", "A", False),
    ("4.1.2", "Name, Role, Value", "A", False),
]

FPC = {
    "1.1.1": ["without_vision", "limited_vision", "without_hearing", "limited_hearing", "limited_language_cognitive"],
    "2.4.2": ["without_vision", "limited_vision", "limited_manipulation", "limited_language_cognitive"],
    "3.1.1": ["without_vision", "limited_language_cognitive"],
}

SUCCESS_PASS, SUCCESS_FAIL = 0.78, 0.28
FAIL_PROP_ABOVE, FAIL_PROP_BELOW = 0.72, 0.28


def _sel(target_id: str | None) -> str | None:
    return f'[data-r508="{target_id}"]' if target_id else None


class _Annotator(HTMLParser):
    """Rewrite opening tags with stable data-r508 ids for jump-to-target."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self.n = {"img": 0, "svg": 0, "a": 0, "h": 0, "form": 0, "ctrl": 0, "audio": 0, "video": 0, "track": 0, "iframe": 0, "btn": 0, "style": 0, "lang": 0, "move": 0}

    def handle_decl(self, decl: str) -> None:
        self.parts.append(f"<!{decl}>")

    def handle_comment(self, data: str) -> None:
        self.parts.append(f"<!--{data}-->")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.parts.append(f"&#{name};")

    def handle_endtag(self, tag: str) -> None:
        self.parts.append(f"</{tag}>")

    def handle_pi(self, data: str) -> None:
        self.parts.append(f"<?{data}>")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.parts.append(self._start(tag, attrs, False))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.parts.append(self._start(tag, attrs, True))

    def _start(self, tag: str, attrs: list[tuple[str, str | None]], self_close: bool) -> str:
        a = {k: (v or "") for k, v in attrs}
        rid = self._id_for(tag, a)
        pairs = [(k, v) for k, v in attrs if k != "data-r508"]
        if rid:
            pairs.append(("data-r508", rid))
        inner = "".join(
            f' {k}' if v is None else f' {k}="{v.replace(chr(34), "&quot;")}"' for k, v in pairs
        )
        close = " />" if self_close else ">"
        return f"<{tag}{inner}{close}"

    def _id_for(self, tag: str, a: dict[str, str]) -> str | None:
        if tag == "img" and self.n["img"] < 40:
            rid = f"img-{self.n['img']}"
            self.n["img"] += 1
            return rid
        if tag == "svg" and self.n["svg"] < 40:
            rid = f"svg-{self.n['svg']}"
            self.n["svg"] += 1
            return rid
        if tag == "a" and a.get("href") and self.n["a"] < 40:
            rid = f"a-{self.n['a']}"
            self.n["a"] += 1
            return rid
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"} and self.n["h"] < 40:
            rid = f"h-{self.n['h']}"
            self.n["h"] += 1
            return rid
        if tag == "form" and self.n["form"] < 15:
            rid = f"form-{self.n['form']}"
            self.n["form"] += 1
            return rid
        if tag in {"input", "select", "textarea"}:
            typ = (a.get("type") or "text").lower()
            if typ not in {"hidden", "submit", "button", "image", "reset"}:
                rid = f"ctrl-0-{self.n['ctrl']}"
                self.n["ctrl"] += 1
                return rid
            if typ in {"submit", "button"} and self.n["btn"] < 40:
                rid = f"btn-{self.n['btn']}"
                self.n["btn"] += 1
                return rid
        if tag == "button" and self.n["btn"] < 40:
            rid = f"btn-{self.n['btn']}"
            self.n["btn"] += 1
            return rid
        if tag in {"blink", "marquee"}:
            rid = f"move-{self.n['move']}"
            self.n["move"] += 1
            return rid
        if tag == "iframe":
            rid = f"iframe-{self.n['iframe']}"
            self.n["iframe"] += 1
            return rid
        if tag in {"audio", "video", "track"}:
            rid = f"{tag}-{self.n[tag]}"
            self.n[tag] += 1
            return rid
        style = a.get("style", "")
        if "color:" in style and "background" in style and self.n["style"] < 25:
            rid = f"style-{self.n['style']}"
            self.n["style"] += 1
            return rid
        if tag != "html" and a.get("lang") and self.n["lang"] < 20:
            rid = f"lang-{self.n['lang']}"
            self.n["lang"] += 1
            return rid
        if a.get("role") == "button" and self.n["btn"] < 40:
            rid = f"btn-{self.n['btn']}"
            self.n["btn"] += 1
            return rid
        return None


def annotate_html(html: str) -> str:
    p = _Annotator()
    try:
        p.feed(html)
        p.close()
    except Exception:
        return html
    return "".join(p.parts)


@dataclass
class Inventory:
    html: str
    url: str | None
    title: str | None = None
    lang: str | None = None
    images: list[dict] = field(default_factory=list)
    links: list[dict] = field(default_factory=list)
    headings: list[dict] = field(default_factory=list)
    skip: list[dict] = field(default_factory=list)
    landmarks: list[str] = field(default_factory=list)
    forms_controls: list[dict] = field(default_factory=list)
    media: list[str] = field(default_factory=list)
    iframes: list[dict] = field(default_factory=list)
    buttons: list[dict] = field(default_factory=list)
    blink: bool = False
    timed: bool = False
    text: str = ""
    color_pairs: list[dict] = field(default_factory=list)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.inv = Inventory(html="", url=None)
        self._stack: list[str] = []
        self._capture: str | None = None
        self._buf: list[str] = []
        self._cur_attrs: dict[str, str] = {}
        self._in_label = False
        self._label_for: str | None = None
        self._labels: dict[str, str] = {}
        self._open_link: dict | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        self._stack.append(tag)
        self.inv.text += " "
        if tag == "html":
            self.inv.lang = a.get("lang") or a.get("xml:lang") or None
        if tag == "title":
            self._capture = "title"
            self._buf = []
        if tag in {"header", "nav", "main", "footer", "aside"}:
            self.inv.landmarks.append(tag)
        if a.get("role"):
            self.inv.landmarks.append(a["role"])
        if tag == "img":
            self.inv.images.append({
                "src": a.get("src", ""),
                "alt": a["alt"] if "alt" in a else None,
                "has_alt": "alt" in a,
                "aria_hidden": a.get("aria-hidden") == "true",
                "in_link": "a" in self._stack,
                "selector": _sel(a.get("data-r508")),
                "target_id": a.get("data-r508"),
            })
        if tag == "a":
            self._open_link = {
                "href": a.get("href", ""),
                "aria": a.get("aria-label"),
                "text": "",
                "selector": _sel(a.get("data-r508")),
                "target_id": a.get("data-r508"),
            }
            self._capture = "a"
            self._buf = []
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._capture = tag
            self._buf = []
            self._cur_attrs = a
        if tag in {"audio", "video", "track"}:
            self.inv.media.append(tag)
        if tag == "iframe":
            self.inv.iframes.append({
                "title": a.get("title") or a.get("aria-label") or None,
                "selector": _sel(a.get("data-r508")),
                "target_id": a.get("data-r508"),
            })
        if tag == "button":
            self._capture = "button"
            self._buf = []
            self._cur_attrs = a
        if tag == "input":
            typ = (a.get("type") or "text").lower()
            if typ not in {"hidden", "submit", "button", "reset", "image"}:
                self.inv.forms_controls.append({
                    "name": a.get("name"),
                    "id": a.get("id"),
                    "type": typ,
                    "aria": a.get("aria-label") or a.get("aria-labelledby"),
                    "title": a.get("title"),
                    "has_label": False,
                    "selector": _sel(a.get("data-r508")),
                    "target_id": a.get("data-r508"),
                })
            if typ in {"submit", "button"}:
                self.inv.buttons.append({
                    "text": a.get("value") or "",
                    "aria": a.get("aria-label"),
                    "selector": _sel(a.get("data-r508")),
                    "target_id": a.get("data-r508"),
                })
        if tag == "label":
            self._in_label = True
            self._label_for = a.get("for")
        if tag in {"blink", "marquee"}:
            self.inv.blink = True
        style = a.get("style", "")
        if "color:" in style and "background" in style:
            self.inv.color_pairs.append({
                "style": style,
                "selector": _sel(a.get("data-r508")),
                "target_id": a.get("data-r508"),
            })

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._capture == "title":
            self.inv.title = "".join(self._buf).strip() or None
            self._capture = None
        if tag == "a" and self._open_link is not None:
            text = "".join(self._buf).strip()
            self._open_link["text"] = text
            self.inv.links.append(self._open_link)
            if self._open_link["href"].startswith("#") and re.search(
                r"skip|main|content|nav", (self._open_link.get("aria") or text), re.I
            ):
                self.inv.skip.append(self._open_link)
            self._open_link = None
            self._capture = None
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"} and self._capture == tag:
            self.inv.headings.append({
                "level": int(tag[1]),
                "text": "".join(self._buf).strip(),
                "selector": _sel(self._cur_attrs.get("data-r508")),
                "target_id": self._cur_attrs.get("data-r508"),
            })
            self._capture = None
        if tag == "button" and self._capture == "button":
            self.inv.buttons.append({
                "text": "".join(self._buf).strip(),
                "aria": self._cur_attrs.get("aria-label"),
                "selector": _sel(self._cur_attrs.get("data-r508")),
                "target_id": self._cur_attrs.get("data-r508"),
            })
            self._capture = None
        if tag == "label":
            self._in_label = False
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()
        elif tag in self._stack:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        self.inv.text += data
        if self._capture:
            self._buf.append(data)


def parse_html(html: str, url: str | None) -> Inventory:
    annotated = annotate_html(html)
    p = PageParser()
    try:
        p.feed(annotated)
        p.close()
    except Exception:
        pass
    p.inv.html = annotated
    p.inv.url = url
    p.inv.timed = bool(re.search(r"setTimeout|setInterval|http-equiv=[\"']refresh", html, re.I))
    ids_with_labels = set(re.findall(r'<label[^>]+for=["\']([^"\']+)', html, re.I))
    wrapped = bool(re.search(r"<label[^>]*>[^<]*<input", html, re.I))
    for c in p.inv.forms_controls:
        if c.get("aria") or c.get("title"):
            c["has_label"] = True
        elif c.get("id") and c["id"] in ids_with_labels:
            c["has_label"] = True
        elif wrapped:
            c["has_label"] = True
    p.inv.landmarks = list(dict.fromkeys(p.inv.landmarks))
    return p.inv


# --- Referee ---------------------------------------------------------------

class RefereeResult(dict):
    pass


class Referee:
    name = "stub"
    model = "stub-heuristic"

    def interpret(self, state: Any, questions: dict) -> dict:
        blob = json.dumps(state).lower() if not isinstance(state, str) else state.lower()
        answers = {}
        for qid, q in questions.items():
            if q["type"] == "noul":
                answers[qid] = {"type": "noul", "noul": self._noul(q["instructions"], blob)}
        return {"model": self.model, "answers": answers}

    def _noul(self, instructions: str, blob: str) -> float:
        inst = instructions.lower()
        if "alt text" in inst or "text equivalent" in inst:
            if re.search(r"\b(image|graphic|photo|picture|untitled)\b", blob):
                return 0.16
            return 0.81
        if "purpose of this link" in inst:
            if re.search(r"\b(click here|here|read more|learn more|more)\b", blob):
                return 0.20
            return 0.80
        if "heading describe" in inst:
            if re.search(r"\b(untitled|heading|click here|lorem)\b", blob):
                return 0.24
            return 0.82
        if "page title describe" in inst or "this page title" in inst:
            if re.search(r"\b(untitled|new page|document|page)\b", blob) and len(blob) < 80:
                return 0.22
            return 0.83
        if "only on sensory" in inst or "sensory characteristics" in inst:
            if re.search(r"red button|on the right|round button|green button", blob):
                return 0.88
            return 0.14
        if "color as the only" in inst:
            if re.search(r"required fields are red|in red|see the color", blob):
                return 0.86
            return 0.18
        if "image of text" in inst:
            return 0.35
        return 0.52


class TypesafeReferee(Referee):
    name = "typesafe"
    model = os.environ.get("TYPESAFE_MODEL", "jev-latest")

    def __init__(self, key: str) -> None:
        self.key = key

    def interpret(self, state: Any, questions: dict) -> dict:
        req = json.dumps({"model": self.model, "state": state, "questions": questions}).encode()
        r = urllib.request.Request(
            "https://api.typesafe.ai/v1/systemone",
            data=req,
            headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(r, timeout=20) as resp:
            return json.loads(resp.read().decode())


def create_referee() -> Referee:
    key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    return TypesafeReferee(key) if key else Referee()


# --- Contrast (code owner) -------------------------------------------------

def _lum(rgb: tuple[int, int, int]) -> float:
    def lin(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def parse_color(s: str) -> tuple[int, int, int] | None:
    s = s.strip().lower()
    m = re.match(r"#([0-9a-f]{3})$", s)
    if m:
        h = m.group(1)
        return tuple(int(ch * 2, 16) for ch in h)  # type: ignore
    m = re.match(r"#([0-9a-f]{6})$", s)
    if m:
        h = m.group(1)
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    named = {"white": (255, 255, 255), "black": (0, 0, 0)}
    return named.get(s)


def contrast_ratio(fg: str, bg: str) -> float | None:
    a, b = parse_color(fg), parse_color(bg)
    if not a or not b:
        return None
    hi, lo = max(_lum(a), _lum(b)), min(_lum(a), _lum(b))
    return (hi + 0.05) / (lo + 0.05)


# --- Engine ----------------------------------------------------------------

def noul_outcome(noul: float, polarity: str) -> str:
    if polarity == "success":
        if noul >= SUCCESS_PASS:
            return "pass"
        if noul <= SUCCESS_FAIL:
            return "fail"
        return "needs_review"
    if noul >= FAIL_PROP_ABOVE:
        return "fail"
    if noul <= FAIL_PROP_BELOW:
        return "pass"
    return "needs_review"


def build_jobs(inv: Inventory) -> list[dict]:
    jobs = []
    for i, img in enumerate(inv.images):
        if not img["has_alt"] or img["aria_hidden"]:
            continue
        alt = img["alt"] or ""
        if not alt.strip():
            continue
        jobs.append({
            "criterionId": "1.1.1",
            "questionId": f"alt_{i}",
            "snippet": alt,
            "selector": img.get("selector"),
            "polarity": "success",
            "state": {"alt_text": alt, "src": img["src"][:120], "in_link": img["in_link"]},
            "question": {
                "type": "noul",
                "instructions": "Does this alt text serve as a text equivalent for the image’s purpose in this context (not a filename, not a generic word like image/photo/graphic)?",
                "criteria": {
                    "true": "A person who cannot see the image would understand the same purpose.",
                    "false": "The alt is generic, a filename, or unrelated.",
                },
            },
        })
    vague = re.compile(r"^(click here|here|read more|learn more|more|link|this|continue)$", re.I)
    for i, link in enumerate(inv.links[:20]):
        name = (link.get("aria") or link.get("text") or "").strip()
        if not name:
            continue
        if not vague.match(name) and len(name.split()) >= 4:
            continue
        jobs.append({
            "criterionId": "2.4.4",
            "questionId": f"link_{i}",
            "snippet": name,
            "selector": link.get("selector"),
            "polarity": "success",
            "state": {"link_text": name, "href": link.get("href", "")[:160]},
            "question": {
                "type": "noul",
                "instructions": "Can a person determine the purpose of this link from the link text together with the immediately surrounding sentence?",
                "criteria": {"true": "Purpose is clear.", "false": "Generic text without purpose."},
            },
        })
    for i, h in enumerate(inv.headings[:15]):
        if not h["text"]:
            continue
        jobs.append({
            "criterionId": "2.4.6",
            "questionId": f"h_{i}",
            "snippet": h["text"],
            "selector": h.get("selector"),
            "polarity": "success",
            "state": {"heading_level": h["level"], "heading_text": h["text"]},
            "question": {
                "type": "noul",
                "instructions": "Does this heading describe the topic or purpose of the section it introduces?",
                "criteria": {"true": "Describes the section.", "false": "Placeholder or empty of meaning."},
            },
        })
    if inv.title:
        jobs.append({
            "criterionId": "2.4.2",
            "questionId": "title_describes",
            "snippet": inv.title,
            "polarity": "success",
            "state": {"page_title": inv.title, "url": inv.url or ""},
            "question": {
                "type": "noul",
                "instructions": "Does this page title describe the topic or purpose of the page?",
                "criteria": {"true": "Identifies topic or purpose.", "false": "Generic or placeholder."},
            },
        })
    corpus = inv.text[:1200]
    if len(corpus) > 40:
        jobs.append({
            "criterionId": "1.3.3",
            "questionId": "sensory_only",
            "snippet": corpus[:200],
            "polarity": "failure",
            "state": {"instructions_and_labels": corpus},
            "question": {
                "type": "noul",
                "instructions": "Do these instructions rely only on sensory characteristics (shape, size, visual location, orientation, or sound) without another identifier?",
                "criteria": {"true": "Only sensory cues.", "false": "Names or text labels are used."},
            },
        })
        jobs.append({
            "criterionId": "1.4.1",
            "questionId": "color_only",
            "snippet": corpus[:200],
            "polarity": "failure",
            "state": {"visible_text": corpus},
            "question": {
                "type": "noul",
                "instructions": "Does this text use color as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing an element?",
                "criteria": {"true": "Color is the only cue.", "false": "Color is not the only cue."},
            },
        })
    return jobs


def code_findings(inv: Inventory) -> dict[str, dict]:
    out: dict[str, dict] = {}

    def put(cid: str, result: str, owner: str, snippet: str, notes: str, *, remedy: str | None = None, evidence: list | None = None) -> None:
        out[cid] = {
            "result": result,
            "owner": owner,
            "evidence": evidence or [{"source": owner if owner != "mixed" else "code", "snippet": snippet}],
            "notes": notes,
            "remedy": remedy,
        }

    missing = [i for i in inv.images if not i["has_alt"] and not i["aria_hidden"]]
    if not inv.images and not inv.media:
        put("1.1.1", "na", "code", "No img/audio/video detected.", "CSS backgrounds untested.")
    elif missing:
        src = missing[0]["src"][:80]
        put(
            "1.1.1",
            "fail",
            "code",
            f"<img src=\"{src}\"> missing alt attribute",
            "Structural fail. Alt quality is a Jev pass when alt exists.",
            remedy="Add alt text that names the image’s purpose, or alt=\"\" if it is decorative.",
            evidence=[
                {
                    "source": "code",
                    "snippet": f"<img src=\"{img['src'][:80]}\"> missing alt attribute",
                    "selector": img.get("selector"),
                    "targetId": img.get("target_id"),
                }
                for img in missing[:5]
            ],
        )

    if not inv.media:
        for cid in ("1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.4.2"):
            put(cid, "na", "code", "No audio/video elements.", "Iframe players need human review.")
    else:
        for cid in ("1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"):
            put(cid, "needs_review", "human", "Media present; captions/AD not proven from markup.", "Human checks the resource.")

    if inv.title is None:
        put("2.4.2", "fail", "code", "No <title> text.", "Missing title is a structural fail.", remedy="Add a <title> that names the page’s topic or purpose.")
    elif re.match(r"^(untitled|new page|document|page)$", inv.title, re.I):
        put("2.4.2", "fail", "code", f"Non-descriptive title: “{inv.title}”", "Placeholder titles fail 2.4.2 on their face.", remedy="Replace the placeholder with a title that names the page’s topic or purpose.")

    if not inv.lang:
        put("3.1.1", "fail", "code", "<html> has no lang attribute.", "Language not programmatically determinable.", remedy="Set <html lang=\"…\"> to a well-formed language tag (for example lang=\"en\").")
    elif not re.match(r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$", inv.lang):
        put("3.1.1", "fail", "code", f'lang="{inv.lang}" is not well-formed.', "Invalid language tag.", remedy="Use a well-formed BCP 47 tag such as en or en-US.")
    else:
        put("3.1.1", "pass", "code", f'<html lang="{inv.lang}">', "Well-formed lang present.")

    unlabeled = [c for c in inv.forms_controls if not c.get("has_label")]
    if not inv.forms_controls:
        put("3.3.2", "na", "code", "No inventoried form controls.", "")
        put("3.3.1", "na", "code", "No forms to invalidate.", "")
        put("3.3.3", "na", "code", "No forms.", "")
    else:
        if unlabeled:
            put(
                "3.3.2",
                "fail",
                "code",
                f"{len(unlabeled)} control(s) without label / ARIA name.",
                "Structural.",
                remedy="Associate a <label for>, wrap the control in <label>, or add aria-label / aria-labelledby.",
                evidence=[
                    {
                        "source": "code",
                        "snippet": f"{c.get('type') or 'input'} name={c.get('name') or '?'} has no label / ARIA name.",
                        "selector": c.get("selector"),
                        "targetId": c.get("target_id"),
                    }
                    for c in unlabeled[:5]
                ],
            )
        else:
            put("3.3.2", "pass", "code", "Inventoried controls have a name.", "Quality still Jev/human.")
        put("3.3.1", "needs_review", "human", "Error identification requires submitting invalid data.", "Runtime.")
        put("3.3.3", "needs_review", "human", "Error suggestion is a runtime UI check.", "Runtime.")

    if inv.skip or any(l in {"main", "navigation", "nav", "banner"} for l in inv.landmarks):
        put("2.4.1", "pass", "code", f"skip={len(inv.skip)} landmarks={inv.landmarks}", "Structural bypass present.")
    else:
        put("2.4.1", "fail", "code", "No skip link and no main/nav landmark.", "Typical federal pages need a bypass.", remedy="Add a skip link to main content and/or a main (or nav/header) landmark.")

    if inv.blink:
        put(
            "2.2.2",
            "fail",
            "code",
            "<blink> or <marquee> present.",
            "Moving content without pause control.",
            remedy="Remove blink/marquee, or provide a pause control for moving content.",
            evidence=[{"source": "code", "snippet": "<blink> or <marquee> present.", "selector": '[data-r508="move-0"]', "targetId": "move-0"}],
        )
    else:
        put("2.2.2", "na", "code", "No blink/marquee in markup.", "CSS/script motion untested.")

    unnamed_iframes = [f for f in inv.iframes if not f.get("title")]
    unnamed_btns = [b for b in inv.buttons if not (b.get("text") or b.get("aria"))]
    if unnamed_iframes or unnamed_btns:
        ev = [
            {"source": "code", "snippet": "iframe without title or aria-label", "selector": f.get("selector"), "targetId": f.get("target_id")}
            for f in unnamed_iframes[:3]
        ] + [
            {"source": "code", "snippet": "button/control with empty accessible name", "selector": b.get("selector"), "targetId": b.get("target_id")}
            for b in unnamed_btns[:3]
        ]
        put(
            "4.1.2",
            "fail",
            "code",
            f"unnamed iframes={len(unnamed_iframes)} unnamed buttons={len(unnamed_btns)}",
            "Name, Role, Value.",
            remedy="Give each iframe a title (or aria-label) and each button an accessible name.",
            evidence=ev,
        )

    for pair in inv.color_pairs:
        style = pair["style"]
        cm = re.search(r"(?:^|;)\s*color\s*:\s*([^;]+)", style, re.I)
        bm = re.search(r"background(?:-color)?\s*:\s*([^;]+)", style, re.I)
        if cm and bm:
            ratio = contrast_ratio(cm.group(1), bm.group(1))
            if ratio is not None and ratio < 4.5:
                put(
                    "1.4.3",
                    "fail",
                    "code",
                    f"inline contrast {ratio:.2f}:1",
                    "Inline styles only.",
                    remedy="Raise the inline foreground/background pair to at least 4.5:1 (3:1 if large text).",
                    evidence=[{
                        "source": "code",
                        "snippet": f"inline contrast {ratio:.2f}:1",
                        "selector": pair.get("selector"),
                        "targetId": pair.get("target_id"),
                    }],
                )
                break
    if "1.4.3" not in out:
        put("1.4.3", "needs_review", "human", "Computed stylesheet contrast not measured in the stdlib runner.", "Use axe in a browser for fuller coverage.")

    for cid, note in [
        ("2.4.5", "Single-page v1. Multiple ways is a property of a set of pages."),
        ("3.2.3", "Consistent navigation requires comparing pages."),
        ("3.2.4", "Consistent identification requires comparing pages."),
        ("2.1.1", "Keyboard access is a runtime check."),
        ("2.1.2", "Keyboard trap cannot be detected from static HTML."),
        ("2.4.3", "Focus order requires a browser."),
        ("2.4.7", "Focus visibility is computed CSS."),
        ("2.3.1", "Flash rate is not measured."),
        ("3.2.1", "Change of context on focus is runtime."),
        ("3.2.2", "Change of context on input is runtime."),
        ("1.4.4", "200% zoom is a browser check."),
        ("3.3.4", "Legal/financial/data transactions need a human to classify."),
        ("1.3.1", "Heading outline / table headers / lists need deeper DOM + AT check."),
        ("1.3.2", "CSS order vs DOM order needs a browser."),
        ("3.1.2", "Passages in another language need human or targeted Jev on extracted spans."),
        ("4.1.1", "Duplicate IDs / unclosed tags are only partially scanned."),
    ]:
        put(cid, "needs_review", "human", note, "Honest gap.")

    put("2.2.1", "needs_review" if inv.timed else "na", "human" if inv.timed else "code",
        "Timers or meta refresh in source." if inv.timed else "No timer / meta refresh detected.", "")
    return out


def combine(inv: Inventory, kind: str, source: dict, referee: Referee, jev_rows: list[dict], include_preview: bool = False) -> dict:
    findings = code_findings(inv)
    jev_by: dict[str, list[dict]] = {}
    for row in jev_rows:
        jev_by.setdefault(row["criterionId"], []).append(row)

    criteria = []
    for cid, name, level, except_nw in CRITERIA:
        applicable = not (kind != "web" and except_nw)
        if not applicable:
            criteria.append(_crit(cid, name, level, "na", "code", False, [{"source": "code", "snippet": "Excepted for non-web under E205.4 / E207.2."}], [], "Exception."))
            continue
        f = findings.get(cid, {})
        rows = jev_by.get(cid, [])
        evidence = list(f.get("evidence") or [])
        traces = []
        tools = [f["owner"]] if f else []
        for row in rows:
            tools.append("jev")
            noul = row["noul"]
            traces.append({
                "questionId": row["questionId"],
                "primitive": "noul",
                "noul": noul,
                "proposition": row["question"]["instructions"],
            })
            evidence.append({
                "source": "jev",
                "snippet": f"Jev noul={noul:.3f} — {row['snippet'][:180]}",
                "selector": row.get("selector"),
                "targetId": (row.get("selector") or "").replace('[data-r508="', "").replace('"]', "") or None,
            })
        result = f.get("result", "needs_review")
        owner = f.get("owner", "human")
        notes = f.get("notes", "")
        remedy = f.get("remedy")
        if result != "fail" and rows:
            polarity = rows[0]["polarity"]
            outcomes = [noul_outcome(r["noul"], polarity) for r in rows]
            if "fail" in outcomes:
                result, owner = "fail", "mixed" if f.get("result") else "jev"
                notes = (notes + " Jev Noul crossed the fail threshold. Engine decision, not a Jev verdict.").strip()
            elif outcomes and all(o == "pass" for o in outcomes) and result in {"needs_review", "pass"}:
                if f.get("result") == "fail":
                    result, owner = "fail", f["owner"]
                else:
                    result, owner = "pass", "mixed" if f else "jev"
            elif result != "fail":
                result, owner = "needs_review", "jev"
        if not f and not rows:
            result, owner, notes = "needs_review", "human", "No deterministic owner completed this SC."
            evidence = evidence or [{"source": "human", "snippet": "Not tested beyond inventory heuristics."}]
        if not remedy:
            if result == "fail":
                remedy = "Fix the highlighted markup, then re-rate. This is not a certification step."
            elif result == "needs_review":
                remedy = "Review the notes and the snapshot (or the live page). This SC is not closed from automated checks alone."
        criteria.append(_crit(cid, name, level, result, owner, True, evidence, traces, notes, remedy))

    applicable = [c for c in criteria if c["applicable"]]
    counts = {
        "pass": sum(1 for c in applicable if c["result"] == "pass"),
        "fail": sum(1 for c in applicable if c["result"] == "fail"),
        "na": sum(1 for c in criteria if c["result"] == "na"),
        "needs_review": sum(1 for c in applicable if c["result"] == "needs_review"),
        "applicable": len(applicable),
        "testedDeterministic": sum(1 for c in applicable if c["result"] in {"pass", "fail"}),
    }
    if counts["fail"]:
        status = "does_not_meet_tested"
    elif counts["needs_review"]:
        status = "incomplete_review_required"
    else:
        status = "no_failures_on_tested"
    risk = 100 * (1 - (counts["pass"] + 0.35 * counts["needs_review"]) / max(1, counts["applicable"]))
    return {
        "product": "508 Draft Rater",
        "disclaimer": DISCLAIMER,
        "pack": "Revised Section 508 E205 → WCAG 2.0 Level A and AA",
        "contentKind": kind,
        "source": source,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "page": {"title": inv.title, "lang": inv.lang, "url": inv.url},
        "status": status,
        "statusLabel": STATUS[status],
        "riskCoverageIndex": {
            "value": int(round(min(100, max(0, risk)))),
            "label": "risk/coverage index",
            "formula": "100 * (1 - (pass + 0.35 * needs_review) / applicable). Not a compliance score.",
        },
        "counts": counts,
        "criteria": criteria,
        "inventorySummary": {
            "images": len(inv.images),
            "links": len(inv.links),
            "headings": len(inv.headings),
            "formControls": len(inv.forms_controls),
            "media": len(inv.media),
        },
        "referee": {"implementation": referee.name, "model": referee.model},
        "limitations": [
            "v1 rates one HTML page as web content (E205).",
            "Jev accepts text only. Images, audio, and video are not sent to System One.",
            "This stdlib runner does not embed axe-core; the TypeScript app does when optional deps install.",
            "2.4.5, 3.2.3, and 3.2.4 need a set of pages.",
            "WCAG 2.2 is not part of this legal pack.",
        ],
        **({"previewHtml": inv.html} if include_preview else {}),
    }


def _crit(cid, name, level, result, owner, applicable, evidence, jev, notes, remedy=None):
    return {
        "id": cid,
        "name": name,
        "level": level,
        "result": result,
        "owner": owner,
        "applicable": applicable,
        "evidence": evidence,
        "jev": jev or None,
        "fpc": FPC.get(cid, []),
        "notes": notes,
        "remedy": remedy,
        "tools": list({owner} | {e["source"] for e in evidence}),
    }


def normalize_http_url(raw: str) -> str | None:
    """Bare hosts (`example.gov/page`) are fetched. Existing files stay files."""
    text = raw.strip()
    if text.startswith("http://") or text.startswith("https://"):
        return text
    if not re.match(r"^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)", text, re.I) and not re.match(
        r"^localhost(?::\d+)?(?:[/?#]|$)", text, re.I
    ):
        return None
    if Path(text).exists():
        return None
    return "https://" + text.lstrip("/")


def _read_limited(resp) -> str:
    return resp.read(2_000_000).decode("utf-8", "replace")


def _url_request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": "508-Draft-Rater/0.1"})


def fetch_url(url: str) -> str:
    try:
        with urllib.request.urlopen(_url_request(url), timeout=20) as resp:
            return _read_limited(resp)
    except urllib.error.HTTPError:
        raise
    except urllib.error.URLError as exc:
        reason = str(getattr(exc, "reason", exc))
        if "Tunnel connection failed" not in reason and "proxy" not in reason.lower():
            raise RuntimeError(f"Could not fetch {url}: {reason}") from exc
        # An ambient dev proxy often rejects the page the user asked to rate.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(_url_request(url), timeout=20) as resp:
                return _read_limited(resp)
        except urllib.error.URLError as exc2:
            reason2 = str(getattr(exc2, "reason", exc2))
            raise RuntimeError(f"Could not fetch {url}: {reason2}") from exc2


def load_input(raw: str, as_html: bool) -> tuple[str, dict, str | None]:
    if as_html or raw.lstrip().lower().startswith(("<!doctype", "<html", "<body")):
        return raw, {"kind": "html", "value": "(pasted HTML)"}, None
    url = normalize_http_url(raw)
    if url:
        html = fetch_url(url)
        return html, {"kind": "url", "value": url}, url
    path = Path(raw)
    html = path.read_text(encoding="utf-8")
    return html, {"kind": "file", "value": str(path)}, path.resolve().as_uri()


def rate(raw: str, *, as_html: bool = False, kind: str = "web", skip_jev: bool = False, include_preview: bool = False) -> dict:
    html, source, url = load_input(raw, as_html)
    inv = parse_html(html, url)
    referee = create_referee()
    rows = []
    if not skip_jev:
        for job in build_jobs(inv):
            res = referee.interpret(job["state"], {job["questionId"]: job["question"]})
            ans = res.get("answers", {}).get(job["questionId"], {})
            if "noul" in ans:
                rows.append({**job, "noul": float(ans["noul"])})
    return combine(inv, kind, source, referee, rows, include_preview=include_preview)


def main() -> None:
    ap = argparse.ArgumentParser(description="508 Draft Rater — pre-audit only")
    ap.add_argument("input", help="URL, file path, or HTML when --html")
    ap.add_argument("--html", action="store_true")
    ap.add_argument("--kind", default="web", choices=["web", "non_web_document", "non_web_software"])
    ap.add_argument("--skip-jev", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    report = rate(args.input, as_html=args.html, kind=args.kind, skip_jev=args.skip_jev)
    if args.json:
        json.dump(report, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return
    print(f"\n{report['product']}")
    print(report["pack"])
    print(f"Referee: {report['referee']['implementation']} / {report['referee'].get('model')}")
    print(f"Source: {report['source']['kind']} {report['source']['value']}")
    print(f"\nSTATUS: {report['statusLabel']}")
    rci = report["riskCoverageIndex"]
    print(f"Risk/coverage index: {rci['value']}  ← {rci['label']}, not a compliance score")
    c = report["counts"]
    print(f"Counts  fail={c['fail']}  needs_review={c['needs_review']}  pass={c['pass']}  na={c['na']}  applicable={c['applicable']}")
    print("\nPer-criterion:")
    for row in report["criteria"]:
        jev = ""
        if row.get("jev"):
            jev = "  [" + ",".join(f"noul={j['noul']:.2f}" for j in row["jev"] if "noul" in j) + "]"
        print(f"  {row['id']:<6} {row['result']:<13} {row['owner']:<7} {row['name']}{jev}")
    print("\n" + report["disclaimer"])


if __name__ == "__main__":
    main()
