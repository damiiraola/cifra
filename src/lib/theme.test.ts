import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTheme, resolveTheme, THEME_BOOT } from "./theme.ts";

describe("theme", () => {
  it("defaults to the system", () => {
    assert.equal(parseTheme(null), "system");
    assert.equal(parseTheme("x"), "system");
    assert.equal(parseTheme("light"), "light");
    assert.equal(resolveTheme("system", false), "light");
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("dark", false), "dark");
    assert.equal(resolveTheme("light", true), "light");
  });
  it("the boot script is valid JS", () => {
    assert.doesNotThrow(() => new Function(THEME_BOOT));
  });
});

/** WCAG contrast of the light palette (text tokens on the surfaces they sit on). */
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("contrast (AA, 4.5:1 for text)", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
  const tokens = (b: string) => Object.fromEntries([...b.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
  const light = tokens(block("--theme-light-start"));
  const dark = tokens(block("@theme {"));
  for (const [name, pal] of [["light", light], ["dark", dark]] as const) {
    it(`${name}: fg, muted, subtle, income, expense, warn on bg, surface and elevated`, () => {
      for (const t of ["fg", "muted", "subtle", "income", "expense", "warn"]) {
        for (const s of ["bg", "surface", "elevated"]) {
          const r = ratio(pal[t]!, pal[s]!);
          assert.ok(r >= 4.5, `${name} ${t} on ${s}: ${r.toFixed(2)}`);
        }
      }
      assert.ok(ratio(pal["accent-fg"]!, pal.accent!) >= 4.5, `${name} accent button`);
    });
  }
});
