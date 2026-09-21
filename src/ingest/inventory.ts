import * as cheerio from "cheerio";
import type { PageInventory } from "../types.ts";

const MAX_ITEMS = 40;
const NEAR = 180;

export function buildInventory(html: string, url?: string): PageInventory {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const htmlLang = $("html").attr("lang")?.trim() || $("html").attr("xml:lang")?.trim() || null;

  const images = $("img")
    .toArray()
    .slice(0, MAX_ITEMS)
    .map((el, i) => {
      const $el = $(el);
      const parentLink = $el.closest("a");
      return {
        selector: `img:nth-of-type(${i + 1})[src="${($el.attr("src") || "").slice(0, 80)}"]`,
        src: $el.attr("src") || "",
        alt: $el.attr("alt") ?? null,
        hasAltAttr: $el.attr("alt") !== undefined,
        ariaHidden: $el.attr("aria-hidden") === "true",
        role: $el.attr("role") || null,
        inLink: parentLink.length > 0,
        nearbyText: nearby($, $el),
      };
    });

  const svgs = $("svg")
    .toArray()
    .slice(0, MAX_ITEMS)
    .map((el, i) => {
      const $el = $(el);
      return {
        selector: `svg:nth-of-type(${i + 1})`,
        title: $el.find("title").first().text().trim() || null,
        ariaLabel: $el.attr("aria-label") || $el.attr("aria-labelledby") || null,
        ariaHidden: $el.attr("aria-hidden") === "true",
      };
    });

  const links = $("a[href]")
    .toArray()
    .slice(0, MAX_ITEMS)
    .map((el, i) => {
      const $el = $(el);
      const text = visibleText($el);
      return {
        selector: `a[href]:nth-of-type(${i + 1})`,
        href: $el.attr("href") || "",
        text,
        ariaLabel: $el.attr("aria-label") || null,
        context: nearby($, $el),
      };
    });

  const headings = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .slice(0, MAX_ITEMS)
    .map((el, i) => {
      const $el = $(el);
      const tag = el.tagName.toLowerCase();
      return {
        selector: `${tag}:nth-of-type(${i + 1})`,
        level: Number(tag.slice(1)),
        text: $el.text().replace(/\s+/g, " ").trim(),
      };
    });

  const landmarks = unique(
    $("[role], header, nav, main, footer, aside, form")
      .toArray()
      .map((el) => $(el).attr("role") || el.tagName.toLowerCase()),
  );

  const skipLinks = $("a[href^='#']")
    .toArray()
    .slice(0, 8)
    .map((el) => ({ href: $(el).attr("href") || "", text: visibleText($(el)) }))
    .filter((l) => /skip|main|content|nav/i.test(l.text) || l.href === "#main" || l.href === "#content");

  const forms = $("form")
    .toArray()
    .slice(0, 15)
    .map((form, fi) => {
      const $form = $(form);
      const controls = $form
        .find("input, select, textarea")
        .toArray()
        .filter((c) => {
          const type = ($(c).attr("type") || "").toLowerCase();
          return !["hidden", "submit", "button", "image", "reset"].includes(type);
        })
        .slice(0, 30)
        .map((c, ci) => {
          const $c = $(c);
          const id = $c.attr("id") || null;
          const hasLabel = !!(
            (id && $(`label[for="${cssEscape(id)}"]`).length) ||
            $c.closest("label").length ||
            $c.attr("aria-label") ||
            $c.attr("aria-labelledby")
          );
          return {
            selector: `form:nth-of-type(${fi + 1}) :input(${ci})`,
            tag: c.tagName.toLowerCase(),
            type: $c.attr("type") || null,
            id,
            name: $c.attr("name") || null,
            hasLabel,
            ariaLabel: $c.attr("aria-label") || null,
            title: $c.attr("title") || null,
            required: $c.attr("required") !== undefined || $c.attr("aria-required") === "true",
          };
        });
      return { selector: `form:nth-of-type(${fi + 1})`, controls };
    });

  const media: PageInventory["media"] = [];
  $("audio").each((i, el) => {
    media.push({ kind: "audio", selector: `audio:nth-of-type(${i + 1})`, attrs: attrs($(el)) });
  });
  $("video").each((i, el) => {
    media.push({ kind: "video", selector: `video:nth-of-type(${i + 1})`, attrs: attrs($(el)) });
  });
  $("track").each((i, el) => {
    media.push({ kind: "track", selector: `track:nth-of-type(${i + 1})`, attrs: attrs($(el)) });
  });

  const langParts = $("[lang]")
    .toArray()
    .filter((el) => el.tagName.toLowerCase() !== "html")
    .slice(0, 20)
    .map((el, i) => ({
      selector: `${el.tagName.toLowerCase()}[lang]:nth-of-type(${i + 1})`,
      lang: $(el).attr("lang") || "",
      text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 80),
    }));

  const iframeTitles = $("iframe")
    .toArray()
    .map((el, i) => ({
      selector: `iframe:nth-of-type(${i + 1})`,
      title: $(el).attr("title") || $(el).attr("aria-label") || null,
    }));

  const buttons = $("button, input[type=submit], input[type=button], [role=button]")
    .toArray()
    .slice(0, MAX_ITEMS)
    .map((el, i) => {
      const $el = $(el);
      return {
        selector: `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
        text: visibleText($el) || $el.attr("value") || "",
        ariaLabel: $el.attr("aria-label") || null,
        type: $el.attr("type") || null,
      };
    });

  const colorPairs: PageInventory["colorPairs"] = [];
  $("[style]").each((i, el) => {
    if (colorPairs.length >= 25) return;
    const style = $(el).attr("style") || "";
    const color = matchCss(style, "color");
    const background = matchCss(style, "background-color") || matchCss(style, "background");
    if (color && background && !background.includes("url(")) {
      colorPairs.push({
        selector: `${el.tagName.toLowerCase()}[style]:nth-of-type(${i + 1})`,
        color,
        background,
        text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 60),
      });
    }
  });

  const bodyText = $("body").text() || "";
  return {
    html,
    url,
    title,
    htmlLang,
    images,
    svgs,
    links,
    headings,
    landmarks,
    skipLinks,
    forms,
    media,
    langParts,
    titleElements: $("title").toArray().map((el) => $(el).text()),
    iframeTitles,
    buttons,
    timedHints: /setTimeout|setInterval|meta[^>]+http-equiv=["']refresh/i.test(html),
    blinkMarquee: $("blink, marquee").length > 0 || /animation:\s*[^;]*blink/i.test(html),
    autofocus: $("[autofocus]").length > 0,
    tabIndexPositive: $("[tabindex]").toArray().filter((el) => Number($(el).attr("tabindex")) > 0).length,
    accessKeys: $("[accesskey]").length,
    scriptsHintKeyboard: /keydown|keyup|keypress|tabindex/i.test(html),
    colorPairs,
  };

  function nearby($root: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
    const parent = $el.parent();
    const t = parent.text().replace(/\s+/g, " ").trim();
    return t.slice(0, NEAR);
  }
}

function visibleText($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

function attrs($el: cheerio.Cheerio<any>): Record<string, string> {
  const a = $el.attr() || {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (typeof v === "string") out[k] = v;
  $el.find("track").each((_, t) => {
    const kind = $el.find(t).attr?.("kind") || "";
    if (kind) out[`track:${kind}`] = "1";
  });
  return out;
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

function matchCss(style: string, prop: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i");
  const m = style.match(re);
  return m ? m[1].trim() : null;
}

function cssEscape(id: string): string {
  return id.replace(/"/g, '\\"');
}

export function inventoryCounts(inv: PageInventory): Record<string, number> {
  return {
    images: inv.images.length,
    svgs: inv.svgs.length,
    links: inv.links.length,
    headings: inv.headings.length,
    forms: inv.forms.length,
    formControls: inv.forms.reduce((n, f) => n + f.controls.length, 0),
    media: inv.media.length,
    iframes: inv.iframeTitles.length,
    skipLinks: inv.skipLinks.length,
    landmarks: inv.landmarks.length,
    colorPairsInline: inv.colorPairs.length,
  };
}
