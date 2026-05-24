/**
 * UUID generator. Production deploys are HTTPS (secure context) so
 * `crypto.randomUUID` is always defined. Used for Dexie primary keys
 * (drill attempts, API key rows, chat messages, etc.).
 */
export function uuid(): string {
  return crypto.randomUUID();
}
