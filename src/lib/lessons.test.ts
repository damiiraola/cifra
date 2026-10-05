import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lessonSet } from "./lessons.ts";

describe("lessons", () => {
  it("explains the book in everyday words", () => {
    const lessons = lessonSet(5_830_000);
    assert.equal(lessons.length, 6);
    const text = lessons.map((l) => l.body).join(" ");
    assert.match(text, /no es un gasto/);
    assert.match(text, /interés compuesto/);
    assert.match(text, /5\.830\.000/);
    assert.doesNotMatch(text, /ETF|yield|portfolio|broker/i);
    for (const l of lessons) assert.ok(l.body.length < 700);
  });
});
