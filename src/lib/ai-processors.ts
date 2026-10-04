import { createServerFn } from "@tanstack/react-start";
import { aiProviders, processorsFor } from "@/lib/ai-provider";

/**
 * Public (no login): which AI processors are configured, for /privacidad.
 * Returns names only — never keys or tokens.
 */
export const getAiProcessors = createServerFn({ method: "GET" }).handler(async () => {
  const { vercelOidcToken } = await import("./ai-oidc.server");
  return processorsFor(aiProviders(process.env, vercelOidcToken()));
});
