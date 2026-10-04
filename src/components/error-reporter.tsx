import { useEffect } from "react";
import { installGlobalErrorHandlers } from "@/lib/observability.browser";

/** Sends uncaught browser errors to Sentry when VITE_SENTRY_DSN is set. */
export function ErrorReporter() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return null;
}
