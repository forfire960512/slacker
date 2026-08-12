// Capturing group so String.split keeps the matched URLs in the result
// (at odd indices) instead of discarding them — lets renderers interleave
// plain text and clickable link segments without extracting links twice.
const LINK_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** Pulls out http(s) URLs from a text message so clients can render them as clickable links. */
export function extractLinks(text: string): string[] {
  return text.match(LINK_PATTERN) ?? [];
}

/**
 * Splits `text` into alternating plain-text/link segments — even indices
 * are plain text, odd indices are links (same URLs `extractLinks` would
 * find). Lets a renderer turn just the URL substrings inside a message
 * into clickable elements, instead of showing the link a second time
 * below the text.
 */
export function splitTextByLinks(text: string): string[] {
  return text.split(LINK_PATTERN);
}
