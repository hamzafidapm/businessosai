import { describe, it, expect } from "vitest";
import { withSupabaseSsl } from "../src/lib/db";

describe("withSupabaseSsl", () => {
  it("rewrites sslmode to no-verify for Supabase pooler hosts (self-signed chain)", () => {
    expect(
      withSupabaseSsl("postgres://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require")
    ).toBe("postgres://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=no-verify");
  });

  it("appends sslmode=no-verify for direct Supabase hosts without one, preserving other params", () => {
    expect(withSupabaseSsl("postgres://user:pass@db.abcdefgh.supabase.co:5432/postgres?foo=bar")).toBe(
      "postgres://user:pass@db.abcdefgh.supabase.co:5432/postgres?foo=bar&sslmode=no-verify"
    );
  });

  it("leaves local and other hosts byte-identical", () => {
    expect(withSupabaseSsl("postgres://user:pass@localhost:5432/db?sslmode=require")).toBe(
      "postgres://user:pass@localhost:5432/db?sslmode=require"
    );
    expect(withSupabaseSsl("postgres://user:pass@db.example.com:5432/db")).toBe(
      "postgres://user:pass@db.example.com:5432/db"
    );
  });
});
