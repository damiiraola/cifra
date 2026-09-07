/**
 * Local email/password — this app's Better Auth DB, not the Grok broker.
 * Mail (confirm + reset) is sent via Resend when RESEND_API_KEY is set.
 */
import { mailConfigured, sendCifraMail } from "../mail";

export const emailAndPasswordEnabled = true;

type MailUser = { email: string; name?: string | null };

async function sendOrThrow(
  input: Parameters<typeof sendCifraMail>[0],
): Promise<void> {
  const result = await sendCifraMail(input);
  if (!result.ok) throw new Error(result.error);
}

export const emailPasswordOptions = {
  enabled: true as const,
  requireEmailVerification: mailConfigured(),
  sendResetPassword: async ({ user, url }: { user: MailUser; url: string }) => {
    await sendOrThrow({
      to: user.email,
      subject: "Cambiar tu contraseña — Cifra",
      heading: "Cambiar contraseña",
      body: "Pediste una clave nueva para Cifra. El enlace vale una hora. Si no fuiste vos, ignorá este mail.",
      cta: "Elegir nueva clave",
      url,
    });
  },
};

export const emailVerificationOptions = {
  sendOnSignUp: mailConfigured(),
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }: { user: MailUser; url: string }) => {
    await sendOrThrow({
      to: user.email,
      subject: "Confirmá tu mail — Cifra",
      heading: "Confirmá tu cuenta",
      body: `Hola${user.name ? ` ${user.name}` : ""}. Tocá el botón para confirmar el mail y abrir tu libro.`,
      cta: "Confirmar mail",
      url,
    });
  },
};
