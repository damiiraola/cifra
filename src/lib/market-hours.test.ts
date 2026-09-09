import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QUOTE_INTERVAL_MS,
  isArgentineWeekday,
  quotesAgeLabel,
  quotesAreStale,
  shouldRefreshQuotes,
} from "./market-hours.ts";

describe("market-hours", () => {
  it("treats Argentine weekdays as hábiles and weekends as not", () => {
    assert.equal(isArgentineWeekday(new Date("2026-09-07T15:00:00.000Z")), true);
    assert.equal(isArgentineWeekday(new Date("2026-09-04T15:00:00.000Z")), true);
    assert.equal(isArgentineWeekday(new Date("2026-09-05T02:00:00.000Z")), true);
    assert.equal(isArgentineWeekday(new Date("2026-09-05T15:00:00.000Z")), false);
    assert.equal(isArgentineWeekday(new Date("2026-09-06T15:00:00.000Z")), false);
    assert.equal(isArgentineWeekday(new Date("2026-09-05T03:30:00.000Z")), false);
  });

  it("marks quotes stale at 10 minutes", () => {
    const now = Date.parse("2026-09-07T15:00:00.000Z");
    assert.equal(quotesAreStale(null, now), true);
    assert.equal(quotesAreStale("nope", now), true);
    assert.equal(quotesAreStale(new Date(now - 9 * 60 * 1000).toISOString(), now), false);
    assert.equal(quotesAreStale(new Date(now - QUOTE_INTERVAL_MS).toISOString(), now), true);
  });

  it("only auto-refreshes on hábiles when stale", () => {
    const monday = new Date("2026-09-07T15:00:00.000Z");
    const saturday = new Date("2026-09-05T15:00:00.000Z");
    const fresh = new Date(monday.getTime() - 60_000).toISOString();
    const stale = new Date(monday.getTime() - QUOTE_INTERVAL_MS).toISOString();
    assert.equal(shouldRefreshQuotes(stale, monday), true);
    assert.equal(shouldRefreshQuotes(fresh, monday), false);
    assert.equal(shouldRefreshQuotes(stale, saturday), false);
    assert.equal(shouldRefreshQuotes(null, monday), true);
  });

  it("labels quote age in Spanish", () => {
    const now = Date.parse("2026-09-07T15:00:00.000Z");
    assert.equal(quotesAgeLabel(null, now), "sin actualizar");
    assert.equal(quotesAgeLabel(new Date(now - 20_000).toISOString(), now), "ahora");
    assert.equal(quotesAgeLabel(new Date(now - 60_000).toISOString(), now), "hace 1 min");
    assert.equal(quotesAgeLabel(new Date(now - 12 * 60_000).toISOString(), now), "hace 12 min");
    assert.equal(quotesAgeLabel(new Date(now - 60 * 60_000).toISOString(), now), "hace 1 h");
    assert.equal(quotesAgeLabel(new Date(now - 26 * 60 * 60_000).toISOString(), now), "hace 1 día");
  });
});
