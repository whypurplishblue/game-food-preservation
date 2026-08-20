/**
 * Leaderboard display-name gate. Deferred: this always passes today. Both the
 * client (instant feedback before submit) and the API route (actual
 * enforcement) import this same function, so plugging in a real filter later
 * — a wordlist, leetspeak normalization, whatever — is a one-file change.
 */
export function isCleanName(name) {
  return true;
}
