import { JSDOM } from "jsdom";
import axe from "axe-core";
import { scFromAxeTags } from "../catalog/axe-map.ts";
import type { Evidence } from "../types.ts";

export interface AxeBySc {
  [sc: string]: {
    violations: Evidence[];
    passes: number;
    incomplete: Evidence[];
  };
}

export async function runAxe(html: string, url?: string): Promise<AxeBySc> {
  const by: AxeBySc = {};
  try {
    const dom = new JSDOM(html, {
      url: url || "http://localhost/rated",
      pretendToBeVisual: true,
      resources: "usable",
    });
    const { window } = dom;
    // axe-core expects a browser-like global. Run against jsdom document.
    const results = await axe.run(window.document.documentElement, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      resultTypes: ["violations", "passes", "incomplete"],
    });

    const bump = (sc: string) => {
      if (!by[sc]) by[sc] = { violations: [], passes: 0, incomplete: [] };
    };

    for (const v of results.violations) {
      const scs = scFromAxeTags(v.tags);
      const ev: Evidence = {
        source: "axe",
        ruleId: v.id,
        snippet: `${v.id}: ${v.help} — ${(v.nodes[0]?.failureSummary || v.nodes[0]?.html || "").slice(0, 220)}`,
        selector: v.nodes[0]?.target?.join(" ") as string | undefined,
      };
      if (scs.length === 0) continue;
      for (const sc of scs) {
        bump(sc);
        by[sc].violations.push(ev);
      }
    }
    for (const p of results.passes) {
      for (const sc of scFromAxeTags(p.tags)) {
        bump(sc);
        by[sc].passes += 1;
      }
    }
    for (const inc of results.incomplete) {
      const ev: Evidence = {
        source: "axe",
        ruleId: inc.id,
        snippet: `incomplete ${inc.id}: ${inc.help}`.slice(0, 220),
        selector: inc.nodes[0]?.target?.join(" ") as string | undefined,
      };
      for (const sc of scFromAxeTags(inc.tags)) {
        bump(sc);
        by[sc].incomplete.push(ev);
      }
    }
    dom.window.close();
  } catch (err) {
    by["__axe_error"] = {
      violations: [],
      passes: 0,
      incomplete: [
        {
          source: "axe",
          snippet: `axe-core did not complete in jsdom: ${(err as Error).message}`,
        },
      ],
    };
  }
  return by;
}
