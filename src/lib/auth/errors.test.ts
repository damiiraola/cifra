import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_MESSAGES, authErrorMessage, isExpiredLinkError } from "./errors.ts";

test("known Better Auth codes map to Spanish", () => {
  assert.equal(authErrorMessage({ code: "INVALID_TOKEN", message: "Invalid token" }, "x"), AUTH_MESSAGES.linkExpired);
  assert.equal(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }, "x"), AUTH_MESSAGES.wrongCredentials);
  assert.equal(authErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, "x"), AUTH_MESSAGES.alreadyExists);
  assert.equal(authErrorMessage({ code: "EMAIL_NOT_VERIFIED" }, "x"), AUTH_MESSAGES.notVerified);
  assert.equal(authErrorMessage({ code: "PASSWORD_TOO_SHORT" }, "x"), AUTH_MESSAGES.passwordShort);
});

test("429 is 'too many attempts' whatever the text", () => {
  assert.equal(authErrorMessage({ status: 429, message: "Too many requests. Please try again later." }, "x"), AUTH_MESSAGES.tooMany);
});

test("unknown English text never leaks: the fallback wins", () => {
  assert.equal(authErrorMessage({ message: "Something exploded" }, "No pude entrar."), "No pude entrar.");
  assert.equal(authErrorMessage(new Error("Falta RESEND_API_KEY en Vercel"), "No pude mandar el mail."), "No pude mandar el mail.");
  assert.equal(authErrorMessage(null, "fallback"), "fallback");
});

test("network failures are explained", () => {
  assert.equal(authErrorMessage(new TypeError("Failed to fetch"), "x"), AUTH_MESSAGES.network);
});

test("server errors get a generic Spanish message", () => {
  assert.equal(authErrorMessage({ status: 500, message: "Internal" }, "x"), AUTH_MESSAGES.server);
});

test("expired link detection", () => {
  assert.equal(isExpiredLinkError({ code: "INVALID_TOKEN" }), true);
  assert.equal(isExpiredLinkError("INVALID_TOKEN"), true);
  assert.equal(isExpiredLinkError({ message: "Invalid token" }), true);
  assert.equal(isExpiredLinkError({ code: "USER_NOT_FOUND" }), false);
});
