import { createServerFn } from "@tanstack/react-start";

/** See `session-hint.server.ts`. Called only while server-rendering. */
export const sessionHint = createServerFn({ method: "GET" }).handler(async () => {
  const { hasSessionCookie } = await import("./session-hint.server");
  return { hasCookie: hasSessionCookie() };
});
