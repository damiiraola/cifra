import { useEffect } from "react";

/**
 * Registers /sw.js (offline page only, see public/sw.js). Production builds
 * only, and never inside an iframe (the live preview), where a worker would
 * outlive the session and confuse the host.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.top !== window.self) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
