const form = document.getElementById("form");
const out = document.getElementById("out");
const err = document.getElementById("err");
const go = document.getElementById("go");
const statusEl = document.getElementById("status");
const disclaimerEl = document.getElementById("disclaimer");
const resultsEl = document.getElementById("results");
const reviewEl = document.getElementById("review");
const preview = document.getElementById("preview");
const urlInput = document.getElementById("url");
const htmlInput = document.getElementById("html");
const paneUrl = document.getElementById("pane-url");
const paneHtml = document.getElementById("pane-html");
const modeUrl = document.getElementById("mode-url");
const modeHtml = document.getElementById("mode-html");

let report = null;
let selectedId = null;
let filter = "targets";
let sourceMode = "url";

modeUrl.addEventListener("click", () => setSourceMode("url"));
modeHtml.addEventListener("click", () => setSourceMode("html"));

function setSourceMode(mode) {
  sourceMode = mode === "html" ? "html" : "url";
  const urlOn = sourceMode === "url";
  paneUrl.hidden = !urlOn;
  paneHtml.hidden = urlOn;
  modeUrl.classList.toggle("is-on", urlOn);
  modeHtml.classList.toggle("is-on", !urlOn);
  modeUrl.setAttribute("aria-pressed", String(urlOn));
  modeHtml.setAttribute("aria-pressed", String(!urlOn));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.hidden = true;
  go.disabled = true;
  go.textContent = "Rating…";
  try {
    let html = "";
    let url = "";
    if (sourceMode === "url") {
      url = urlInput.value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^\/\//, "");
    } else {
      html = htmlInput.value.trim();
    }
    if (!url && !html) throw new Error(sourceMode === "url" ? "Enter a URL" : "Paste HTML");
    const body = {
      url: url || undefined,
      html: html || undefined,
      kind: document.getElementById("kind").value,
      skipJev: document.getElementById("skipJev").checked,
      skipAxe: document.getElementById("skipAxe").checked,
      includePreview: true,
    };
    const res = await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    report = data;
    selectedId = firstTargetId(data);
    render();
    loadPreview(data.previewHtml);
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message;
  } finally {
    go.disabled = false;
    go.textContent = "Rate page";
  }
});

document.querySelector(".filters")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-on", c === btn));
  renderResults();
});

resultsEl.addEventListener("click", (e) => {
  const jump = e.target.closest("[data-jump]");
  const row = e.target.closest("tr[data-sc]");
  if (jump) {
    e.preventDefault();
    selectedId = jump.dataset.sc;
    highlight(jump.dataset.selector, jump.dataset.target);
    renderReview();
    markSelected();
    return;
  }
  if (row) {
    selectedId = row.dataset.sc;
    const ev = firstJumpable(criterion(selectedId));
    if (ev) highlight(ev.selector, ev.targetId);
    renderReview();
    markSelected();
  }
});

reviewEl.addEventListener("click", async (e) => {
  const jump = e.target.closest("[data-jump]");
  const copy = e.target.closest("[data-copy]");
  if (jump) {
    highlight(jump.dataset.selector, jump.dataset.target);
    return;
  }
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.textContent = "Copied";
      setTimeout(() => {
        copy.textContent = "Copy selector";
      }, 1200);
    } catch {
      copy.textContent = "Copy failed";
    }
  }
});

function render() {
  if (!report) return;
  out.hidden = false;
  const r = report;
  const tone =
    r.status === "does_not_meet_tested" ? "fail" : r.status === "incomplete_review_required" ? "incomplete" : "ok";
  statusEl.className = `status ${tone}`;
  statusEl.innerHTML = `
    <strong>${escapeHtml(r.statusLabel)}</strong>
    <div class="meta">
      Referee ${escapeHtml(r.referee.implementation)}${r.referee.model ? " / " + escapeHtml(r.referee.model) : ""}
      · fail ${r.counts.fail} · review ${r.counts.needs_review} · pass ${r.counts.pass} · n/a ${r.counts.na}
      ${r.riskCoverageIndex ? " · risk/coverage index " + r.riskCoverageIndex.value + " (not a compliance score)" : ""}
    </div>
  `;
  disclaimerEl.textContent = r.disclaimer;
  renderResults();
  renderReview();
}

function renderResults() {
  if (!report) return;
  const rows = visibleCriteria()
    .map((c) => {
      const ev = firstJumpable(c);
      const canJump = Boolean(ev);
      const snip = (c.evidence || [])
        .slice(0, 2)
        .map((e) => escapeHtml(e.snippet))
        .join("<br>");
      return `<tr data-sc="${c.id}" class="${c.id === selectedId ? "is-selected" : ""} ${canJump ? "has-target" : ""}">
        <td>${c.id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td><span class="pill ${c.result}">${c.result.replace("_", " ")}</span></td>
        <td>${c.owner}</td>
        <td>${canJump ? `<button type="button" class="linkish" data-jump data-sc="${c.id}" data-selector="${escapeAttr(ev.selector)}" data-target="${escapeAttr(ev.targetId || "")}">Jump</button>` : "—"}</td>
        <td class="snip">${snip || escapeHtml(c.notes || "")}</td>
      </tr>`;
    })
    .join("");
  resultsEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>SC</th><th>Name</th><th>Result</th><th>Owner</th><th>Target</th><th>Evidence</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="6" class="meta">No rows in this filter.</td></tr>`}</tbody>
    </table>
  `;
}

function renderReview() {
  const c = criterion(selectedId);
  if (!c) {
    reviewEl.innerHTML = `<h2>Review</h2><p class="meta">Select a row to jump to the snapshot, read the notes, and copy a selector.</p>`;
    return;
  }
  const jumps = (c.evidence || []).filter((e) => e.selector);
  const sourceUrl = report.page?.url || (report.source?.kind === "url" ? report.source.value : "");
  const evidence = (c.evidence || [])
    .map((e) => {
      const actions = e.selector
        ? `<button type="button" class="linkish" data-jump data-selector="${escapeAttr(e.selector)}" data-target="${escapeAttr(e.targetId || "")}">Jump</button>
           <button type="button" class="linkish" data-copy="${escapeAttr(e.selector)}">Copy selector</button>`
        : "";
      return `<li><code>${escapeHtml(e.snippet)}</code> ${actions}</li>`;
    })
    .join("");
  reviewEl.innerHTML = `
    <h2>${c.id} ${escapeHtml(c.name)}</h2>
    <p><span class="pill ${c.result}">${c.result.replace("_", " ")}</span> · owner ${escapeHtml(c.owner)}</p>
    <p class="remedy"><strong>Remedy</strong> — ${escapeHtml(c.remedy || c.notes || "No automated next step. Human review.")}</p>
    <p class="meta">${escapeHtml(c.notes || "")}</p>
    <ul class="evidence-list">${evidence || "<li class=\"meta\">No element-level evidence. This SC needs a browser or a set of pages.</li>"}</ul>
    <div class="review-actions">
      ${jumps[0] ? `<button type="button" class="linkish" data-jump data-selector="${escapeAttr(jumps[0].selector)}" data-target="${escapeAttr(jumps[0].targetId || "")}">Jump to first target</button>` : ""}
      ${sourceUrl ? `<a class="linkish" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source page</a>` : ""}
    </div>
    <p class="meta">Remedy text is a draft hint, not a 508 sign-off.</p>
  `;
}

function visibleCriteria() {
  const list = report.criteria || [];
  if (filter === "all") return list;
  return list.filter((c) => c.result === "fail" || (c.result === "needs_review" && (c.evidence || []).some((e) => e.selector)));
}

function criterion(id) {
  return (report?.criteria || []).find((c) => c.id === id);
}

function firstTargetId(r) {
  return (r.criteria || []).find((c) => c.result === "fail" && firstJumpable(c))?.id
    || (r.criteria || []).find((c) => firstJumpable(c))?.id
    || r.criteria?.[0]?.id
    || null;
}

function firstJumpable(c) {
  return (c?.evidence || []).find((e) => e.selector);
}

function loadPreview(html) {
  preview.removeAttribute("srcdoc");
  if (!html) {
    preview.srcdoc = "<p style='font:14px sans-serif;padding:1rem'>No snapshot. Paste HTML or rate a URL again.</p>";
    return;
  }
  preview.srcdoc = withBase(html, sourceUrl());
  preview.addEventListener("load", () => {
    if (selectedId) {
      const ev = firstJumpable(criterion(selectedId));
      if (ev) highlight(ev.selector, ev.targetId);
    }
  }, { once: true });
}

function sourceUrl() {
  return report?.page?.url || (report?.source?.kind === "url" ? report.source.value : "");
}

function withBase(html, pageUrl) {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return html;
  const existing = html.match(/<base\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  if (existing) {
    try {
      const abs = new URL(existing[1], pageUrl).href;
      if (abs === existing[1]) return html;
      return html.replace(existing[0], existing[0].replace(existing[1], abs));
    } catch {
      return html;
    }
  }
  const tag = `<base href="${escapeAttr(pageUrl)}">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `<head>${tag}</head>${html}`;
}

function highlight(selector, targetId) {
  const doc = preview.contentDocument;
  if (!doc) return;
  doc.querySelectorAll("[data-r508-active]").forEach((el) => el.removeAttribute("data-r508-active"));
  if (!doc.getElementById("r508-hl-style")) {
    const style = doc.createElement("style");
    style.id = "r508-hl-style";
    style.textContent = "[data-r508-active]{outline:3px solid #c45c00!important;outline-offset:3px;background:rgba(255,211,107,.4)!important;scroll-margin:3rem}";
    (doc.head || doc.documentElement).appendChild(style);
  }
  const el =
    (targetId && doc.querySelector(`[data-r508="${CSS.escape(targetId)}"]`))
    || (selector && querySafe(doc, selector));
  if (!el) return;
  el.setAttribute("data-r508-active", "1");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

function querySafe(doc, selector) {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function markSelected() {
  resultsEl.querySelectorAll("tr[data-sc]").forEach((tr) => {
    tr.classList.toggle("is-selected", tr.dataset.sc === selectedId);
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s ?? "");
}
