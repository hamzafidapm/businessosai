import { describe, it, expect, afterEach } from "vitest";
import { secret } from "../src/lib/auth";

// SESSION_SECRET must be required and never defaulted: secret() throws for
// a missing or short value. (It is called on session issue and validation
// in src/lib/auth.ts, so a deployment without it fails closed.)
describe("SESSION_SECRET enforcement", () => {
  const original = process.env.SESSION_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });
  it("throws when missing or too short", () => {
    delete process.env.SESSION_SECRET;
    expect(() => secret()).toThrow();
    process.env.SESSION_SECRET = "short";
    expect(() => secret()).toThrow();
  });
  it("returns a long secret unchanged", () => {
    process.env.SESSION_SECRET = "a-long-enough-test-secret-value";
    expect(secret()).toBe("a-long-enough-test-secret-value");
  });
});
