/**
 * Local email/password — this app's Better Auth DB, not the Grok broker.
 * Mail (confirm + reset + welcome + password-changed) via Resend.
 */
import {
  APP_ORIGIN,
  MAIL,
  appOrigin,
  greeting,
  mailConfigured,
  sendCifraMail,
  sendMailQuiet,
} from "../mail";

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
      url,
      ...MAIL.reset,
    });
  },
  onPasswordReset: async ({ user }: { user: MailUser }) => {
    await sendMailQuiet({
      to: user.email,
      url: appOrigin(),
      ...MAIL.passwordChanged,
    });
  },
};

export const emailVerificationOptions = {
  sendOnSignUp: mailConfigured(),
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }: { user: MailUser; url: string }) => {
    await sendOrThrow({
      to: user.email,
      url,
      ...MAIL.verify(user.name),
    });
  },
  afterEmailVerification: async (user: MailUser) => {
    await sendMailQuiet({
      to: user.email,
      url: appOrigin() || APP_ORIGIN,
      ...MAIL.welcome,
      body: `${greeting(user.name)} ${MAIL.welcome.body}`,
    });
  },
};
