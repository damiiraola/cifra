import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearLeaving, isLeaving, markLeaving } from "./leaving.ts";

describe("leaving flag", () => {
  it("is off by default, on while leaving and off again if the sign-out failed", () => {
    assert.equal(isLeaving(), false);
    markLeaving();
    assert.equal(isLeaving(), true);
    clearLeaving();
    assert.equal(isLeaving(), false);
  });
});
