/** Portada: what "create account" says, by signup mode (closed beta by default). */
export function landingSignup(mode: "invitacion" | "abierto" | null) {
  const closed = mode !== "abierto";
  return {
    closed,
    cta: closed ? "Tengo invitación" : "Crear cuenta",
    notice: closed ? "para crear una cuenta necesitás un código de invitación." : "",
    showWaitlist: closed,
  };
}
