import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface LoadedPage {
  html: string;
  source: { kind: "url" | "html" | "file"; value: string };
  url?: string;
}

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 2_000_000;

export async function loadInput(input: string, asHtml = false): Promise<LoadedPage> {
  if (asHtml || looksLikeHtml(input)) {
    return { html: input, source: { kind: "html", value: "(pasted HTML)" } };
  }
  const url = normalizeHttpUrl(input);
  if (url) {
    const html = await fetchUrl(url);
    return { html, source: { kind: "url", value: url }, url };
  }
  const html = await readFile(input, "utf8");
  return {
    html,
    source: { kind: "file", value: input },
    url: pathToFileURL(input).href,
  };
}

/** Bare hosts (`example.gov/page`) are fetched. Existing files stay files. */
export function normalizeHttpUrl(input: string): string | null {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(raw) && !/^localhost(?::\d+)?(?:[/?#]|$)/i.test(raw)) {
    return null;
  }
  if (existsSync(raw)) return null;
  return `https://${raw.replace(/^\/\//, "")}`;
}

function looksLikeHtml(s: string): boolean {
  const t = s.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<body") || t.startsWith("<div");
}

async function fetchUrl(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "508-Draft-Rater/0.1 (pre-audit; not a crawler suite)" },
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return buf.subarray(0, MAX_BYTES).toString("utf8");
    }
    return buf.toString("utf8");
  } finally {
    clearTimeout(t);
  }
}
