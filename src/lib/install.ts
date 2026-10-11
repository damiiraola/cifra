/**
 * "Instalar Cifra" dentro de la app. Android/Chrome: the native prompt
 * (beforeinstallprompt, captured as early as possible because it fires once).
 * iPhone/iPad Safari has no prompt: we show the steps (Compartir → Agregar a
 * inicio). Hidden when already installed (standalone) or dismissed.
 */
import { useEffect, useState } from "react";

export type InstallMode = "hidden" | "native" | "ios";
export const INSTALL_DISMISS_KEY = "cifra-install-dismissed";

export function isIos(ua: string, maxTouchPoints = 0) {
  // iPadOS 13+ reports itself as Mac; touch points give it away.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

export function installMode(p: { standalone: boolean; ua: string; touch?: number; hasPrompt: boolean; dismissed: boolean }): InstallMode {
  if (p.standalone || p.dismissed) return "hidden";
  if (p.hasPrompt) return "native";
  if (isIos(p.ua, p.touch) && !/CriOS|FxiOS|EdgiOS/i.test(p.ua)) return "ios";
  return "hidden";
}

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    subs.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    subs.forEach((f) => f());
  });
}

function standalone() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  const mode: InstallMode = !ready
    ? "hidden"
    : installMode({
        standalone: standalone(),
        ua: navigator.userAgent,
        touch: navigator.maxTouchPoints,
        hasPrompt: !!deferred,
        dismissed: localStorage.getItem(INSTALL_DISMISS_KEY) === "1",
      });
  return {
    mode,
    /** Native prompt; returns true when the user accepted. */
    prompt: async () => {
      if (!deferred) return false;
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      bump((n) => n + 1);
      return outcome === "accepted";
    },
    dismiss: () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
      bump((n) => n + 1);
    },
  };
}
