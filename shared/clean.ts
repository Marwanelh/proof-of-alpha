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
  /**
   * When the post was made, read from the page's own timestamp line ("· Nov 23", "· 5h"). `dayOnly` when the
   * page showed a date without a time: the post is then taken as 12:00 Bangkok that day, and the UI says so.
   */
  posted: { at: string; dayOnly: boolean; raw: string } | null;
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "5h", "2d", "just now", "Nov 23", "Nov 23, 2026", "23 Nov", "2026-11-23", "Nov 23 · 14:05" -> a time. */
export function postedFrom(raw: string, now: Date = new Date()): { at: string; dayOnly: boolean; raw: string } | null {
  const s = raw.replace(/^[·•]\s*/, "").trim().toLowerCase();
  if (s === "" ) return null;
  if (s === "just now" || s === "now") return { at: now.toISOString(), dayOnly: false, raw };
  const rel = s.match(/^(\d+)\s*(s|m|h|d|w|sec|secs|min|mins|hr|hrs|hour|hours|day|days|week|weeks)(?:\s+ago)?$/);
  if (rel) {
    const n = Number(rel[1]);
    const u = rel[2]!;
    const ms = u.startsWith("s") ? n * 1e3 : u === "m" || u.startsWith("min") ? n * 6e4 : u.startsWith("h") ? n * 3.6e6 : u.startsWith("d") ? n * 8.64e7 : n * 6.048e8;
    return { at: new Date(now.getTime() - ms).toISOString(), dayOnly: /^(d|day|days|w|week|weeks)$/.test(u), raw };
  }
  if (s === "yesterday") return { at: new Date(now.getTime() - 8.64e7).toISOString(), dayOnly: true, raw };
  let y: number | null = null;
  let mo = -1;
  let d = 0;
  let a = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (a && MONTHS.includes(a[1]!)) {
    mo = MONTHS.indexOf(a[1]!);
    d = Number(a[2]);
    y = a[3] ? Number(a[3]) : null;
  } else if ((a = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/)) && MONTHS.includes(a[2]!)) {
    mo = MONTHS.indexOf(a[2]!);
    d = Number(a[1]);
    y = a[3] ? Number(a[3]) : null;
  } else if ((a = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    y = Number(a[1]);
    mo = Number(a[2]) - 1;
    d = Number(a[3]);
  } else return null;
  const time = s.match(/(\d{1,2}):(\d{2})\s*([ap]m)?/);
  let year = y ?? now.getUTCFullYear();
  const hh = time ? (Number(time[1]) % 12) + (time[3] === "pm" ? 12 : time[3] === "am" ? 0 : Number(time[1]) >= 12 ? 12 : 0) : 12;
  const mm = time ? Number(time[2]) : 0;
  const mk = (yr: number) => new Date(Date.UTC(yr, mo, d, hh - 7, mm)); // Bangkok, UTC+7
  let at = mk(year);
  if (y === null && at.getTime() > now.getTime() + 86_400_000) at = mk(--year); // "Dec 30" read in January
  if (Number.isNaN(at.getTime())) return null;
  return { at: at.toISOString(), dayOnly: time === null, raw };
}

export function cleanPastedPost(raw: string, now: Date = new Date()): Cleaned {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());
  let posted: Cleaned["posted"] = null;

  let author: string | null = null;
  let bull = false;
  let bear = false;
  let dropped = 0;
  const kept: string[] = [];
  // Inside "Take Profits :" / "Targets:" lists, bare numbers are the call, not like counts.
  let inList = false;

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
      // "Alek Carter" / "@Alek_Carter": the display name sits right above the handle.
      if (kept.length > 0 && isNameLike(kept[kept.length - 1]!)) kept.pop();
      dropped += 1;
      continue;
    }
    if (inList && /^[+\-−]?\$?\s?\d[\d,]*(?:\.\d+)?$/.test(line)) {
      kept.push(line);
      continue;
    }
    inList = false;
    // The page's own timestamp ("· Nov 23", "5h") is when the post was made: keep it, drop the line.
    const stamp = line.replace(/^[·•]\s*/, "");
    if (RELATIVE_TIME.test(stamp) || ABS_DATE.test(stamp)) {
      posted ??= postedFrom(stamp, now);
      dropped += 1;
      continue;
    }
    if (
      UI_WORDS.has(lower) ||
      COUNT.test(line) ||
      PRICE_WIDGET.test(line) ||
      LONE_TICKER.test(line) ||
      LONE_PRICE.test(line) ||
      /^[·•|\-–—]+$/.test(line)
    ) {
      dropped += 1;
      continue;
    }
    const cleanedLine = line.replace(INLINE_WIDGET, "").trim();
    kept.push(cleanedLine);
    inList = /:\s*$/.test(cleanedLine);
  }

  // A short first line followed by the body is usually the display name ("CryptoNova" / "Crypto Nova ✓").
  if (kept.length > 1 && isNameLike(kept[0]!)) {
    author ??= asHandle(kept[0]!);
    kept.shift();
    dropped += 1;
  }
  // …or the last line, when the page puts the name under the post ("… #BNB #Blockchain" / "Crypto Henry").
  if (kept.length > 1 && author === null && isNameLike(kept[kept.length - 1]!)) {
    author = asHandle(kept.pop()!);
    dropped += 1;
  }

  let text = kept.join(" ").replace(/\s+/g, " ").trim();

  // A trailing "— Name" signature names the author too.
  const sig = text.match(/(?:[—–]|\s-\s)\s*@?([A-Za-z0-9_.]{2,32})\s*$/);
  if (sig && author === null) author = sig[1]!;

  const sentiment = bull && !bear ? "bullish" : bear && !bull ? "bearish" : null;
  if (sentiment !== null && !new RegExp(`\\b${sentiment}\\b`, "i").test(text)) text = `${text} (${sentiment})`;

  return { text, author, sentiment, dropped, posted };
}

/** A display name: short, at most three words, no prices, digits runs, hashtags or sentence punctuation. */
function isNameLike(line: string): boolean {
  return (
    line.length <= 32 &&
    !/[$%#:]|\d{2,}/.test(line) &&
    line.split(" ").length <= 3 &&
    !/[.!?,]$/.test(line) &&
    /\p{L}/u.test(line)
  );
}

function asHandle(line: string): string | null {
  return line.replace(/[^\p{L}\p{N}_. ]/gu, "").trim().replace(/\s+/g, "") || null;
}
