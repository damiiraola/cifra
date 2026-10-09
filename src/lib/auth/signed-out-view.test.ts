import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signedOutView } from "./signed-out-view.ts";

describe("signedOutView (front page for visitors)", () => {
  it("no session cookie on / or /ia: the front page right away, even while the session loads", () => {
    assert.equal(signedOutView({ path: "/", isPending: true, hasCookie: false }), "landing");
    assert.equal(signedOutView({ path: "/ia", isPending: true, hasCookie: false }), "landing");
  });

  it("with a cookie (maybe a real session): wait, and the front page only once it is surely signed out", () => {
    assert.equal(signedOutView({ path: "/", isPending: true, hasCookie: true }), "wait");
    assert.equal(signedOutView({ path: "/", isPending: false, hasCookie: true }), "landing");
    assert.equal(signedOutView({ path: "/", isPending: true, hasCookie: null }), "wait");
  });

  it("any other page of the app keeps going to /login", () => {
    assert.equal(signedOutView({ path: "/tarjetas", isPending: false, hasCookie: false }), "login");
    assert.equal(signedOutView({ path: "/ajustes", isPending: true, hasCookie: false }), "wait");
  });
});
