/**
 * A chat message. Content is intentionally text-only (plus extracted links) —
 * no rich embeds/attachments are modeled, by design (see docs/ARCHITECTURE.md).
 */
export interface Message {
  id: string;
  text: string;
  /** URLs found in `text`, extracted so clients can render them as clickable links. */
  links: string[];
  author: string;
  createdAt: number;
}
