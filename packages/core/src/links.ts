const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Pulls out http(s) URLs from a text message so clients can render them as clickable links. */
export function extractLinks(text: string): string[] {
  return text.match(URL_PATTERN) ?? [];
}
