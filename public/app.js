const form = document.getElementById("form");
const out = document.getElementById("out");
const err = document.getElementById("err");
const go = document.getElementById("go");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.hidden = true;
  go.disabled = true;
  go.textContent = "Rating…";
  try {
    const body = {
      url: document.getElementById("url").value.trim() || undefined,
      html: document.getElementById("html").value.trim() || undefined,
      kind: document.getElementById("kind").value,
      skipJev: document.getElementById("skipJev").checked,
      skipAxe: document.getElementById("skipAxe").checked,
    };
    const res = await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    render(data);
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message;
  } finally {
    go.disabled = false;
    go.textContent = "Rate page";
  }
});

function render(r) {
  out.hidden = false;
  const tone =
    r.status === "does_not_meet_tested" ? "fail" : r.status === "incomplete_review_required" ? "incomplete" : "ok";
  const rows = r.criteria
    .map((c) => {
      const ev = (c.evidence || [])
        .slice(0, 2)
        .map((e) => escapeHtml(e.snippet))
        .join("<br>");
      const jev = (c.jev || [])
        .map((j) => (j.noul != null ? `noul ${j.noul.toFixed(2)}` : j.choice || ""))
        .join(", ");
      return `<tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td><span class="pill ${c.result}">${c.result.replace("_", " ")}</span></td>
        <td>${c.owner}</td>
        <td>${jev || "—"}</td>
        <td class="snip">${ev || escapeHtml(c.notes || "")}</td>
      </tr>`;
    })
    .join("");
  out.innerHTML = `
    <div class="status ${tone}">
      <strong>${escapeHtml(r.statusLabel)}</strong>
      <div class="meta">
        Referee ${r.referee.implementation}${r.referee.model ? " / " + r.referee.model : ""}
        · fail ${r.counts.fail} · review ${r.counts.needs_review} · pass ${r.counts.pass} · n/a ${r.counts.na}
        ${r.riskCoverageIndex ? " · risk/coverage index " + r.riskCoverageIndex.value + " (not a compliance score)" : ""}
      </div>
    </div>
    <p class="meta">${escapeHtml(r.disclaimer)}</p>
    <table>
      <thead>
        <tr>
          <th>SC</th><th>Name</th><th>Result</th><th>Owner</th><th>Jev</th><th>Evidence</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
