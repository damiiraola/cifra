#!/usr/bin/env node
/**
 * Sends the five Cifra templates once per environment.
 * Called from migrate.mjs on production deploys until the marker is stored.
 */
import { sendTemplatePreviews } from "../src/lib/mail.ts";

const to = process.env.CIFRA_MAIL_DRILL_TO?.trim() || "iraoladamian@gmail.com";

const result = await sendTemplatePreviews(to);
if (!result.ok) {
  console.error("[mail-drill]", result.error);
  process.exit(1);
}
console.log(`[mail-drill] sent 5 templates to ${to}`);
