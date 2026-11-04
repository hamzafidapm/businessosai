import { describe, it, expect } from "vitest";
import { resolveDatabaseUrl } from "../src/lib/db";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL over Supabase-injected variables", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://explicit/db",
        POSTGRES_URL_NON_POOLING: "postgres://nonpooling/db",
        POSTGRES_URL: "postgres://pooled/db",
      } as NodeJS.ProcessEnv)
    ).toBe("postgres://explicit/db");
  });

  it("falls back to POSTGRES_URL_NON_POOLING when DATABASE_URL is unset (Vercel Supabase integration)", () => {
    expect(
      resolveDatabaseUrl({
        POSTGRES_URL_NON_POOLING: "postgres://nonpooling/db",
        POSTGRES_URL: "postgres://pooled/db",
      } as NodeJS.ProcessEnv)
    ).toBe("postgres://nonpooling/db");
  });

  it("falls back to POSTGRES_URL as a last resort and returns undefined when nothing is set", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://pooled/db" } as NodeJS.ProcessEnv)).toBe(
      "postgres://pooled/db"
    );
    expect(resolveDatabaseUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
