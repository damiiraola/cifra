/**
 * Better Auth answers in English (`{ code, message, status }`). Testers only
 * ever see Spanish: known codes get a rioplatense message and anything we do
 * not recognise falls back to the screen's own message, never the raw text.
 */
export type AuthErrorLike =
  | { code?: string | null; message?: string | null; status?: number | null }
  | null
  | undefined;

export const AUTH_MESSAGES = {
  wrongCredentials: "Mail o contraseña incorrectos.",
  notVerified: "Confirmá el mail primero. Si no te llegó, te lo reenviamos.",
  alreadyExists: "Ese mail ya tiene cuenta. Entrá o recuperá la clave.",
  passwordShort: "La contraseña tiene que tener al menos 8 caracteres.",
  passwordLong: "La contraseña es demasiado larga. Probá con una más corta.",
  invalidEmail: "Ese mail no parece válido. Revisalo.",
  linkExpired: "Este enlace venció o ya se usó.",
  tooMany: "Demasiados intentos. Esperá un minuto y probá de nuevo.",
  sessionExpired: "Tu sesión venció. Entrá de nuevo.",
  network: "No hay conexión con Cifra. Revisá internet y probá de nuevo.",
  server: "Cifra tuvo un problema. Probá de nuevo en un rato.",
} as const;

const BY_CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: AUTH_MESSAGES.wrongCredentials,
  INVALID_PASSWORD: AUTH_MESSAGES.wrongCredentials,
  USER_NOT_FOUND: AUTH_MESSAGES.wrongCredentials,
  CREDENTIAL_ACCOUNT_NOT_FOUND: AUTH_MESSAGES.wrongCredentials,
  EMAIL_NOT_VERIFIED: AUTH_MESSAGES.notVerified,
  USER_ALREADY_EXISTS: AUTH_MESSAGES.alreadyExists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: AUTH_MESSAGES.alreadyExists,
  PASSWORD_TOO_SHORT: AUTH_MESSAGES.passwordShort,
  PASSWORD_TOO_LONG: AUTH_MESSAGES.passwordLong,
  INVALID_EMAIL: AUTH_MESSAGES.invalidEmail,
  INVALID_TOKEN: AUTH_MESSAGES.linkExpired,
  TOKEN_EXPIRED: AUTH_MESSAGES.linkExpired,
  SESSION_EXPIRED: AUTH_MESSAGES.sessionExpired,
};

/** Message patterns for errors that arrive without a usable `code`. */
const BY_TEXT: [RegExp, string][] = [
  [/too many requests|rate.?limit/i, AUTH_MESSAGES.tooMany],
  [/not verified/i, AUTH_MESSAGES.notVerified],
  [/already exists/i, AUTH_MESSAGES.alreadyExists],
  [/invalid (email or )?password/i, AUTH_MESSAGES.wrongCredentials],
  [/password too short/i, AUTH_MESSAGES.passwordShort],
  [/password too long/i, AUTH_MESSAGES.passwordLong],
  [/invalid email/i, AUTH_MESSAGES.invalidEmail],
  [/invalid token|token expired/i, AUTH_MESSAGES.linkExpired],
  [/failed to fetch|network|load failed/i, AUTH_MESSAGES.network],
];

/** True when the error means "this reset / verification link is no good". */
export function isExpiredLinkError(err: AuthErrorLike | string): boolean {
  const code = typeof err === "string" ? err : (err?.code ?? "");
  const message = typeof err === "string" ? err : (err?.message ?? "");
  return code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED" || /invalid token|token expired/i.test(message);
}

/** Spanish text for a Better Auth error (or a thrown Error). */
export function authErrorMessage(err: AuthErrorLike | Error | unknown, fallback: string): string {
  if (!err) return fallback;
  const e = err as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof e.code === "string" ? e.code.toUpperCase() : "";
  const message = typeof e.message === "string" ? e.message : "";
  const status = typeof e.status === "number" ? e.status : 0;
  if (status === 429) return AUTH_MESSAGES.tooMany;
  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const [re, text] of BY_TEXT) if (re.test(message) || re.test(code)) return text;
  if (status >= 500) return AUTH_MESSAGES.server;
  return fallback;
}
