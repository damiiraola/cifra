import { test } from "node:test";
import assert from "node:assert/strict";
import { NETWORK_MESSAGE, userMessage } from "./user-error.ts";

test("keeps our own Spanish validation messages", () => {
  assert.equal(userMessage(new Error("Monto inválido"), "x"), "Monto inválido");
  assert.equal(userMessage(new Error("El mail no coincide"), "x"), "El mail no coincide");
});

test("hides English and technical text", () => {
  assert.equal(userMessage(new Error("duplicate key value violates unique constraint"), "No pude guardar."), "No pude guardar.");
  assert.equal(userMessage(new Error("Falta RESEND_API_KEY en Vercel. Sin eso Cifra no puede mandar mails."), "No pude."), "No pude.");
  assert.equal(userMessage(undefined, "fallback"), "fallback");
});

test("network errors get a clear message", () => {
  assert.equal(userMessage(new TypeError("Failed to fetch"), "x"), NETWORK_MESSAGE);
});
