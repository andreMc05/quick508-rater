import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ratePage } from "./engine/rate.ts";
import type { ContentKind } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (_req, res) => {
  res.json({
    product: "508 Draft Rater",
    referee: process.env.TYPESAFE_API_KEY ? "typesafe" : "stub",
    disclaimer: "pre-audit only",
  });
});

app.post("/api/rate", async (req, res) => {
  try {
    const { url, html, kind, skipAxe, skipJev, includePreview } = req.body as {
      url?: string;
      html?: string;
      kind?: ContentKind;
      skipAxe?: boolean;
      skipJev?: boolean;
      includePreview?: boolean;
    };
    if (!url && !html) {
      res.status(400).json({ error: "Provide url or html" });
      return;
    }
    const report = await ratePage({
      input: html || url!,
      asHtml: Boolean(html),
      kind: kind || "web",
      skipAxe: Boolean(skipAxe),
      skipJev: Boolean(skipJev),
      includePreview: includePreview !== false,
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.PORT || 5080);
app.listen(port, () => {
  console.log(`508 Draft Rater http://localhost:${port}`);
  console.log("Pre-audit only. Not a conformance engine.");
});
