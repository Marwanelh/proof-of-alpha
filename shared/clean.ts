/**
 * Clean a post copied straight off a social page (CMC Community, X, Binance Square, Telegram).
 *
 * Selecting a post in the browser drags the UI along with it: Follow / Reply / Share buttons, like and view
 * counts, "2h ago", the author's handle, and price widgets such as "BNB $552.12 +1.23%". The widgets matter
 * most: a stray "$552.12" can be read as a price target. This keeps the sentences, drops the chrome, and
 * returns the author handle and the post's Bullish/Bearish tag when the page printed them.
 *
 * Pure and client-safe: the Verify page runs it on paste so the user sees what will be scored, and the API
 * runs it again so a scripted caller gets the same treatment.
 */

export type Cleaned = {
  text: string;
  author: string | null;
  /** CMC posts carry a Bullish/Bearish tag. Kept only when exactly one of the two appears. */
  sentiment: "bullish" | "bearish" | null;
  /** How many lines were dropped as UI, so the page can say it cleaned something. */
  dropped: number;
};

const UI_WORDS = new Set(
  [
    "follow", "following", "unfollow", "reply", "replies", "repost", "reposts", "retweet", "quote", "share",
    "like", "likes", "comment", "comments", "views", "view", "translate", "translate post", "show more",
    "show less", "see more", "read more", "more", "report", "copy link", "tip", "pinned", "promoted",
    "sponsored", "ad", "verified", "creator", "kol", "hot", "new", "top", "latest", "trending", "post",
    "posts", "bookmark", "save", "send", "edited", "original", "community", "·", "...", "…", "vote",
  ],
);

const RELATIVE_TIME =
  /^(?:just now|now|\d+\s*(?:s|m|h|d|w|mo|y|sec|secs|min|mins|hr|hrs|hour|hours|day|days|week|weeks|month|months|year|years)(?:\s+ago)?|yesterday|today)$/i;
const ABS_DATE =
  /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})(?:\s*[·,]?\s*\d{1,2}:\d{2}(?:\s*[ap]m)?)?$/i;
const COUNT = /^[+\-−]?\d[\d,.]*\s*[kmb]?(?:\s+(?:likes?|views?|comments?|replies|reposts?|shares?))?$/i;
/** "BNB $552.12 +1.23%", "$BNB +2.1%", "552.12 -0.4%", "+1.23%" — a ticker/price/change widget. */
const PRICE_WIDGET = /^(?:\$?[A-Z]{2,10}\s*)?(?:\$?\s?[\d,]+(?:\.\d+)?\s*)?[+\-−▲▼]?\s?\d+(?:\.\d+)?%$/i;
const LONE_TICKER = /^\$?[A-Z]{2,10}$/;
const LONE_PRICE = /^[+\-−]?\$\s?[\d,]+(?:\.\d+)?$/;
const HANDLE = /^@([A-Za-z0-9_.]{2,32})$/;
const INLINE_WIDGET = /\$?[A-Z]{2,10}\s+\$?[\d,]+(?:\.\d+)?\s*[+\-−▲▼]\s?\d+(?:\.\d+)?%/g;

export function cleanPastedPost(raw: string): Cleaned {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());

  let author: string | null = null;
  let bull = false;
  let bear = false;
  let dropped = 0;
  const kept: string[] = [];

  for (const line of lines) {
    if (line === "") continue;
    const lower = line.toLowerCase();

    if (lower === "bullish") {
      bull = true;
      dropped += 1;
      continue;
    }
    if (lower === "bearish") {
      bear = true;
      dropped += 1;
      continue;
    }
    const handle = line.match(HANDLE);
    if (handle) {
      author ??= handle[1]!;
      dropped += 1;
      continue;
    }
    if (
      UI_WORDS.has(lower) ||
      RELATIVE_TIME.test(line) ||
      ABS_DATE.test(line) ||
      COUNT.test(line) ||
      PRICE_WIDGET.test(line) ||
      LONE_TICKER.test(line) ||
      LONE_PRICE.test(line) ||
      /^[·•|\-–—]+$/.test(line)
    ) {
      dropped += 1;
      continue;
    }
    kept.push(line.replace(INLINE_WIDGET, "").trim());
  }

  // A short first line followed by the body is usually the display name ("CryptoNova" / "Crypto Nova ✓").
  if (kept.length > 1) {
    const first = kept[0]!;
    if (first.length <= 32 && !/[$%]|\d{2,}/.test(first) && first.split(" ").length <= 3 && !/[.!?]$/.test(first)) {
      author ??= first.replace(/[^\p{L}\p{N}_. ]/gu, "").trim().replace(/\s+/g, "") || null;
      kept.shift();
      dropped += 1;
    }
  }

  let text = kept.join(" ").replace(/\s+/g, " ").trim();

  // A trailing "— Name" signature names the author too.
  const sig = text.match(/(?:[—–]|\s-\s)\s*@?([A-Za-z0-9_.]{2,32})\s*$/);
  if (sig && author === null) author = sig[1]!;

  const sentiment = bull && !bear ? "bullish" : bear && !bull ? "bearish" : null;
  if (sentiment !== null && !new RegExp(`\\b${sentiment}\\b`, "i").test(text)) text = `${text} (${sentiment})`;

  return { text, author, sentiment, dropped };
}
