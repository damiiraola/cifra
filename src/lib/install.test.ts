import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installMode, isIos } from "./install.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const base = { standalone: false, hasPrompt: false, dismissed: false };

describe("instalar app", () => {
  it("Android with the native prompt", () => assert.equal(installMode({ ...base, ua: ANDROID, hasPrompt: true }), "native"));
  it("Android without prompt yet: nothing", () => assert.equal(installMode({ ...base, ua: ANDROID }), "hidden"));
  it("iPhone Safari: steps", () => assert.equal(installMode({ ...base, ua: IPHONE }), "ios"));
  it("iPad (reports Mac) with touch: steps", () => {
    assert.equal(isIos(IPAD, 5), true);
    assert.equal(isIos(IPAD, 0), false);
    assert.equal(installMode({ ...base, ua: IPAD, touch: 5 }), "ios");
  });
  it("Chrome on iPhone can't add to home: hidden", () => assert.equal(installMode({ ...base, ua: IPHONE.replace("Version/18.0", "CriOS/129.0") }), "hidden"));
  it("already installed or dismissed: hidden", () => {
    assert.equal(installMode({ ...base, ua: IPHONE, standalone: true }), "hidden");
    assert.equal(installMode({ ...base, ua: ANDROID, hasPrompt: true, dismissed: true }), "hidden");
  });
});
