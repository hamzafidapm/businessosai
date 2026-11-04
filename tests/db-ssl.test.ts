import { describe, it, expect } from "vitest";
import { resolvePoolSsl } from "../src/lib/db";

describe("resolvePoolSsl", () => {
  it("disables certificate verification for Supabase pooler hosts (self-signed chain)", () => {
    expect(resolvePoolSsl("postgres://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("disables certificate verification for direct Supabase hosts", () => {
    expect(resolvePoolSsl("postgres://user:pass@db.abcdefgh.supabase.co:5432/postgres?sslmode=require")).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("leaves SSL untouched for local and other hosts", () => {
    expect(resolvePoolSsl("postgres://user:pass@localhost:5432/db")).toBeUndefined();
    expect(resolvePoolSsl("postgres://user:pass@db.example.com:5432/db")).toBeUndefined();
  });
});
