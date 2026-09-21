import { WCAG20_AA } from "../catalog/criteria.ts";
import { loadInput } from "../ingest/load.ts";
import { buildInventory, inventoryCounts } from "../ingest/inventory.ts";
import { runCodeChecks } from "../tools/code-checks.ts";
import { runAxe } from "../tools/axe-runner.ts";
import { buildJevJobs, runJevJobs } from "../jev/jobs.ts";
import { combine } from "./combine.ts";
import { createReferee } from "../referee/index.ts";
import type { ContentKind, DraftReport } from "../types.ts";

export interface RateOptions {
  input: string;
  asHtml?: boolean;
  kind?: ContentKind;
  skipAxe?: boolean;
  skipJev?: boolean;
}

export async function ratePage(opts: RateOptions): Promise<DraftReport> {
  const loaded = await loadInput(opts.input, opts.asHtml);
  const inv = buildInventory(loaded.html, loaded.url);
  const kind = opts.kind ?? "web";
  const referee = createReferee();
  const code = runCodeChecks(inv, WCAG20_AA);
  const axe = opts.skipAxe ? {} : await runAxe(loaded.html, loaded.url);
  let jevAnswers = new Map();
  if (!opts.skipJev) {
    const jobs = buildJevJobs(inv);
    jevAnswers = await runJevJobs(referee, jobs);
  }
  const report = combine({
    inv,
    kind,
    source: loaded.source,
    code,
    axe,
    jevAnswers,
    referee,
  });
  report.inventorySummary = { ...report.inventorySummary, ...inventoryCounts(inv) };
  return report;
}
