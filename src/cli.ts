#!/usr/bin/env npx tsx
import { ratePage } from "./engine/rate.ts";
import type { ContentKind } from "./types.ts";

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0) return process.argv[i + 1];
  return fallback;
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (has("-h") || has("--help") || positional.length === 0) {
    console.log(`508 Draft Rater — pre-audit only (not a conformance engine)

Usage:
  npx tsx src/cli.ts <url-or-file> [options]
  npx tsx src/cli.ts --html '<html>...' 

Options:
  --kind web|non_web_document|non_web_software   default web
  --skip-axe
  --skip-jev
  --html                 treat the argument as raw HTML
  --json                 print full JSON report

Environment:
  TYPESAFE_API_KEY       if unset, Referee is the offline stub
  TYPESAFE_MODEL         default jev-latest
`);
    process.exit(positional.length === 0 ? 1 : 0);
  }

  const input = has("--html") ? (arg("--html") || positional[0]) : positional[0];
  const kind = (arg("--kind", "web") || "web") as ContentKind;
  const report = await ratePage({
    input,
    asHtml: has("--html"),
    kind,
    skipAxe: has("--skip-axe"),
    skipJev: has("--skip-jev"),
  });

  if (has("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n${report.product}`);
  console.log(report.pack);
  console.log(`Referee: ${report.referee.implementation}${report.referee.model ? " / " + report.referee.model : ""}`);
  console.log(`Source: ${report.source.kind} ${report.source.value}`);
  console.log(`\nSTATUS: ${report.statusLabel}`);
  if (report.riskCoverageIndex) {
    console.log(
      `Risk/coverage index: ${report.riskCoverageIndex.value}  ← ${report.riskCoverageIndex.label}, not a compliance score`,
    );
  }
  console.log(
    `Counts  fail=${report.counts.fail}  needs_review=${report.counts.needs_review}  pass=${report.counts.pass}  na=${report.counts.na}  applicable=${report.counts.applicable}`,
  );
  console.log("\nPer-criterion:");
  for (const c of report.criteria) {
    const jev = c.jev?.map((j) => (j.noul !== undefined ? `noul=${j.noul.toFixed(2)}` : j.choice)).join(",") || "";
    console.log(
      `  ${c.id.padEnd(6)} ${c.result.padEnd(13)} ${c.owner.padEnd(7)} ${c.name}${jev ? "  [" + jev + "]" : ""}`,
    );
  }
  console.log("\n" + report.disclaimer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
