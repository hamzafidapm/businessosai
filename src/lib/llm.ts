// LLM adapter — DISABLED BY DEFAULT, intentionally separated from the AI tools.
// If a future operator sets LLM_PROVIDER + LLM_API_KEY, this module may ONLY rephrase
// the deterministic tool outputs produced by src/lib/ai.ts. It must never be given SQL
// access, never be asked to compute a total, and never receive customer PII.
// Until then, isLlmEnabled() is false and the app uses the deterministic explainer.
export function isLlmEnabled(): boolean {
  return Boolean(process.env.LLM_PROVIDER && process.env.LLM_API_KEY);
}
export async function rephraseWithLlm(_toolAnswer: string): Promise<string | null> {
  // Not implemented in v1: returning null keeps the deterministic answer as the answer.
  // Implementing this requires an approved provider, prompt-injection tests, and a
  // redaction pass — see README "Deferred" section. Do not wire a provider here casually.
  return null;
}
