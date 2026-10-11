/**
 * Modo claro / oscuro. The preference lives on the device (localStorage), not
 * in the ledger: each phone follows its own system. "system" (the default)
 * follows prefers-color-scheme; CSS does the rest with `html[data-theme]`.
 */
import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "cifra-theme";
export const THEME_COLOR = { dark: "#09090b", light: "#fafaf7" } as const;

export function parseTheme(raw: unknown): ThemePref {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** Runs before paint (inline in <head>) so there is no dark flash in light mode. */
export const THEME_BOOT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=document.documentElement;d.dataset.theme=(p==="light"||p==="dark")?p:"system";var r=d.dataset.theme==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):d.dataset.theme;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",r==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");}catch(e){}})();`;

function systemDark() {
  return typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
}

function apply(pref: ThemePref) {
  const d = document.documentElement;
  d.dataset.theme = pref;
  const r = resolveTheme(pref, systemDark());
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[r]);
  return r;
}

/** Current preference + resolved theme, and a setter that persists it. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const p = parseTheme(localStorage.getItem(THEME_KEY));
    setPref(p);
    setResolved(apply(p));
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setResolved(apply(parseTheme(localStorage.getItem(THEME_KEY))));
    const sync = () => { const q = parseTheme(localStorage.getItem(THEME_KEY)); setPref(q); on(); };
    mq.addEventListener("change", on);
    window.addEventListener("cifra-theme", sync);
    return () => { mq.removeEventListener("change", on); window.removeEventListener("cifra-theme", sync); };
  }, []);
  const set = (p: ThemePref) => {
    if (p === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
    setPref(p);
    setResolved(apply(p));
    window.dispatchEvent(new Event("cifra-theme"));
  };
  return { pref, resolved, set };
}
