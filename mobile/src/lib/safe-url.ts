/**
 * Only allow http(s) URLs from server-provided or message content. A crafted
 * value could be `javascript:...`, `file:...`, `tel:...` or an app-scheme URL,
 * which must never reach Linking.openURL or an image source. (RN's URL lacks
 * relative resolution, so this is a protocol allowlist rather than the web's
 * `new URL` probe.)
 */
export function safeHttpUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
