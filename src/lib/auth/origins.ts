/**
 * Which sites may talk to Cifra's auth API (credentialed POSTs: sign-in,
 * sign-up, reset…) and which hosts Better Auth may derive its base URL from.
 *
 * Before: any `*.vercel.app` site was trusted. Now only:
 *   - production (`cifra.lol`, `www.cifra.lol`, and `BETTER_AUTH_URL`),
 *   - THIS deployment's own Vercel URLs, read from the env Vercel injects at
 *     runtime (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`),
 *   - outside production: local dev and the Grok sandbox live preview,
 *   - anything listed in `AUTH_EXTRA_ORIGINS` (comma separated), as an escape hatch.
 *
 * Pure (takes the env as an argument) so it can be unit-tested.
 */
export const PRODUCTION_HOSTS = ["cifra.lol", "www.cifra.lol"] as const;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;
const LOCAL_PORTS = [8080, 8081] as const;
const SANDBOX_HOSTS = ["*.grok-sandbox.com"] as const;

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

/** `foo.vercel.app` from `foo.vercel.app`, `https://foo.vercel.app/` … */
function hostOf(v: string | undefined): string {
  const raw = clean(v);
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    return "";
  }
}

function originOf(v: string | undefined): string {
  const raw = clean(v);
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
}

export function isProductionEnv(env: Env): boolean {
  return clean(env.VERCEL_ENV) === "production";
}

export function authOrigins(env: Env): { trustedOrigins: string[]; allowedHosts: string[] } {
  const production = isProductionEnv(env);
  const deploymentHosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .map(hostOf)
    .filter(Boolean);
  const extra = clean(env.AUTH_EXTRA_ORIGINS)
    .split(",")
    .map(originOf)
    .filter(Boolean);
  const explicit = originOf(env.BETTER_AUTH_URL);

  const allowedHosts = new Set<string>([...PRODUCTION_HOSTS, ...deploymentHosts]);
  const trustedOrigins = new Set<string>([
    ...PRODUCTION_HOSTS.map((h) => `https://${h}`),
    ...deploymentHosts.map((h) => `https://${h}`),
    ...extra,
  ]);
  if (explicit) {
    trustedOrigins.add(explicit);
    allowedHosts.add(new URL(explicit).host);
  }
  for (const o of extra) allowedHosts.add(new URL(o).host);

  if (!production) {
    for (const h of LOCAL_HOSTS) {
      allowedHosts.add(h);
      for (const port of LOCAL_PORTS) trustedOrigins.add(`http://${h}:${port}`);
    }
    for (const h of SANDBOX_HOSTS) {
      allowedHosts.add(h);
      trustedOrigins.add(`https://${h}`);
    }
  }
  return { trustedOrigins: [...trustedOrigins], allowedHosts: [...allowedHosts] };
}
