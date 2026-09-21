/** axe-core impact tags → WCAG 2.0 SC. Only 2.0 A/AA tags are kept. */

const TAG_TO_SC: Record<string, string[]> = {
  "wcag111": ["1.1.1"],
  "wcag121": ["1.2.1"],
  "wcag122": ["1.2.2"],
  "wcag123": ["1.2.3"],
  "wcag124": ["1.2.4"],
  "wcag125": ["1.2.5"],
  "wcag131": ["1.3.1"],
  "wcag132": ["1.3.2"],
  "wcag133": ["1.3.3"],
  "wcag141": ["1.4.1"],
  "wcag142": ["1.4.2"],
  "wcag143": ["1.4.3"],
  "wcag144": ["1.4.4"],
  "wcag145": ["1.4.5"],
  "wcag211": ["2.1.1"],
  "wcag212": ["2.1.2"],
  "wcag221": ["2.2.1"],
  "wcag222": ["2.2.2"],
  "wcag241": ["2.4.1"],
  "wcag242": ["2.4.2"],
  "wcag243": ["2.4.3"],
  "wcag244": ["2.4.4"],
  "wcag245": ["2.4.5"],
  "wcag246": ["2.4.6"],
  "wcag247": ["2.4.7"],
  "wcag311": ["3.1.1"],
  "wcag312": ["3.1.2"],
  "wcag321": ["3.2.1"],
  "wcag322": ["3.2.2"],
  "wcag323": ["3.2.3"],
  "wcag324": ["3.2.4"],
  "wcag331": ["3.3.1"],
  "wcag332": ["3.3.2"],
  "wcag333": ["3.3.3"],
  "wcag334": ["3.3.4"],
  "wcag411": ["4.1.1"],
  "wcag412": ["4.1.2"],
};

export function scFromAxeTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const mapped = TAG_TO_SC[t.toLowerCase()];
    if (mapped) mapped.forEach((id) => out.add(id));
  }
  return [...out];
}

export function isWcag20AxeTag(tag: string): boolean {
  return tag.startsWith("wcag2a") || Object.prototype.hasOwnProperty.call(TAG_TO_SC, tag.toLowerCase());
}
