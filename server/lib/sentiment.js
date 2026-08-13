// ---------------------------------------------------------------------------
// Gaming-tuned lexicon sentiment scorer.
//
// This is the FALLBACK layer. The primary scorer is lib/nlp.js, which sends
// text to Claude for genuine semantic/contextual scoring (sarcasm, irony,
// negation, mixed sentiment). This module runs when ANTHROPIC_API_KEY is not
// configured, when the API errors, or for the pre-scored static sample.
//
// It is deliberately more than a keyword bag — it handles the four things a
// naive lexicon gets wrong on gaming text, which the client called out in
// Questionary §1:
//
//   1. NEGATION      "not good"        → negative, not positive
//   2. INTENSIFIERS  "absolutely bad"  → scaled up; "kinda bad" → scaled down
//   3. GAMING SLANG  "insane clutch"   → positive ("insane" is praise in a
//                                        gaming context, not an insult)
//   4. EMOJI         "🔥🔥🔥"           → positive (a naive /[a-z]+/ tokenizer
//                                        drops emoji entirely and scores 0)
//
// Scores are reported on a -100..+100 scale (Questionary §1.3). Every scored
// record also carries a `confidence` so the dashboard and the briefing can
// discount weak signals rather than treating them as fact.
// ---------------------------------------------------------------------------

// Weights are on a -3..+3 word scale, normalised to -100..100 at the end.
const POSITIVE = {
  // general praise
  good: 1, great: 2, amazing: 3, love: 2, loved: 2, best: 2, awesome: 3,
  excellent: 3, fantastic: 3, brilliant: 3, perfect: 3, superb: 3, solid: 1,
  nice: 1, cool: 1, fun: 2, enjoy: 2, enjoying: 2, enjoyed: 2, enjoyable: 2,
  beautiful: 3, stunning: 3, gorgeous: 3, polished: 2, smooth: 2, impressive: 2,
  masterpiece: 3, incredible: 3, phenomenal: 3, addictive: 2, charm: 1,
  refreshing: 2, generous: 2, worth: 1, recommend: 2, deserved: 1, respect: 1,
  // hype / anticipation
  hyped: 2, hype: 2, excited: 2, exciting: 2, stoked: 2, pumped: 2, finally: 1,
  "can't wait": 2, "cant wait": 2, "cannot wait": 2, "day one": 1, preorder: 1,
  // gaming-native praise — the terms a generic model gets backwards
  insane: 2, sick: 2, cracked: 2, goated: 3, goat: 2, fire: 2, banger: 3,
  clutch: 2, nuts: 2, filthy: 2, dope: 2, peak: 2, cinema: 2, based: 2,
  chef: 1, "hard carry": 2, carried: 1, "s tier": 3, "top tier": 2, buff: 1,
  buffed: 1, "well deserved": 2, "w update": 3, "big w": 3, gg: 1, poggers: 2,
  pog: 2, "let's go": 2, "lets go": 2, lfg: 2, hyperbolic: 0,
  // stability / quality signals
  optimized: 2, optimised: 2, stable: 2, responsive: 2, fixed: 2, improved: 2,
};

const NEGATIVE = {
  // general criticism
  bad: -1, worst: -3, terrible: -3, awful: -3, horrible: -3, hate: -3,
  garbage: -3, trash: -3, rubbish: -2, mediocre: -2, disappointing: -2,
  disappointed: -2, boring: -2, bland: -2, lazy: -2, lazily: -2, sloppy: -2,
  annoying: -2, frustrating: -2, frustrated: -2, painful: -2, miserable: -3,
  exhausting: -2, tedious: -2, ruined: -3, ruining: -3, gutted: -2, dead: -1,
  // technical
  broken: -2, buggy: -2, bug: -1, bugs: -1, glitch: -1, glitched: -1,
  unplayable: -3, crash: -2, crashed: -2, crashing: -2, crashes: -2,
  freeze: -2, freezing: -2, stutter: -2, stuttering: -2, lag: -2, laggy: -2,
  desync: -2, disconnect: -2, disconnected: -2, disconnects: -2, rubberbanding: -2,
  unoptimized: -2, unoptimised: -2, "frame drops": -2, fps: 0, "packet loss": -2,
  // fairness / cheating
  cheater: -2, cheaters: -2, cheating: -2, hacker: -2, hackers: -2,
  wallhack: -2, wallhacker: -2, wallhackers: -2, aimbot: -2, smurf: -1,
  smurfs: -1, rigged: -2, unfair: -2, unbalanced: -2, broken_meta: -2,
  // monetization
  predatory: -3, overpriced: -2, expensive: -1, greedy: -3, "cash grab": -3,
  cashgrab: -3, paywall: -2, p2w: -3, "pay to win": -3, fomo: -2, gacha: -1,
  whale: -1, whales: -1, milking: -2, scam: -3, scummy: -3, microtransaction: -1,
  microtransactions: -1, "battle pass": 0, nerf: -1, nerfed: -2, gutting: -3,
  // grind / time
  grindy: -2, grind: -1, grinding: -1, punishing: -2, "time gated": -2,
  timegated: -2, "sunk cost": -2, drought: -2, "content drought": -3,
  // sentiment toward messaging
  skeptical: -1, sceptical: -1, doubtful: -1, underwhelming: -2, underwhelmed: -2,
  overhyped: -2, copium: -1, "rest in peace": -2, rip: -1, refund: -2,
  uninstall: -3, uninstalled: -3, quitting: -2, quit: -1,
};

// Words that flip the polarity of what follows, within a short window.
const NEGATORS = new Set([
  "not", "no", "never", "none", "cannot", "cant", "can't", "dont", "don't",
  "doesnt", "doesn't", "didnt", "didn't", "isnt", "isn't", "wasnt", "wasn't",
  "wont", "won't", "aint", "ain't", "nothing", "nobody", "hardly", "barely",
  "without", "lacks", "lacking", "stop", "stopped", "quit",
]);
const NEGATION_WINDOW = 3; // tokens after a negator that get flipped

// Multiply the magnitude of the next sentiment token.
const INTENSIFIERS = {
  very: 1.5, really: 1.4, extremely: 1.8, absolutely: 1.8, incredibly: 1.7,
  insanely: 1.7, super: 1.4, so: 1.3, totally: 1.4, completely: 1.6,
  utterly: 1.8, genuinely: 1.3, actually: 1.2, seriously: 1.4, damn: 1.4,
  hella: 1.5, mad: 1.4, "so much": 1.5, "way too": 1.6, way: 1.3,
};
const DIMINISHERS = {
  kinda: 0.6, kind: 0.7, sorta: 0.6, somewhat: 0.6, slightly: 0.5,
  "a bit": 0.6, "a little": 0.6, fairly: 0.8, mildly: 0.5, barely: 0.4,
  mostly: 0.9, "pretty much": 0.9, ish: 0.6,
};

// Emoji carry a lot of the signal in Discord and Twitch chat, where a naive
// /[a-zA-Z]+/ tokenizer scores an emoji-only reaction as flat neutral.
const EMOJI = {
  "🔥": 2, "❤️": 2, "😍": 3, "🥰": 3, "😂": 1, "🤣": 1, "👏": 2, "💯": 3,
  "🙌": 2, "😎": 1, "✨": 1, "🎉": 2, "👍": 2, "💪": 2, "🤩": 3, "😁": 2,
  "😊": 2, "🥳": 2, "⭐": 2, "🏆": 2, "🚀": 2, "😭": 0, "🤡": -2, "💀": -1,
  "👎": -2, "😡": -3, "🤬": -3, "😠": -2, "😞": -2, "😢": -1, "🙄": -2,
  "😤": -1, "🤮": -3, "💩": -3, "😐": 0, "🫠": -1, "😬": -1, "⚠️": -1,
};

// Explicit sarcasm markers. These don't flip the score on their own — they
// lower confidence and dampen the magnitude, because a lexicon genuinely
// cannot resolve "This game is amazing" said bitterly. That case is exactly
// why lib/nlp.js exists; this is damage limitation when it isn't available.
const SARCASM_MARKERS = [
  "/s", "yeah right", "sure buddy", "totally not", "shocking", "what a surprise",
  "who could have guessed", "as always", "of course they", "classic",
  "thanks for nothing", "great job", "well done", "brilliant move", "genius move",
];

const TOKEN_RE = /[a-z'’]+/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const ALL_PHRASES = { ...POSITIVE, ...NEGATIVE };
const MULTIWORD = Object.keys(ALL_PHRASES).filter((k) => k.includes(" "));

function normalise(text) {
  return (text || "").toLowerCase().replace(/’/g, "'");
}

/**
 * Full analysis of a single piece of text.
 * Returns a -100..+100 score, a label, and a 0..1 confidence.
 */
function analyzeSentiment(text) {
  const raw = text || "";
  const t = normalise(raw);
  if (!t.trim()) {
    return { score: 0, label: "neutral", confidence: 0, method: "lexicon", hits: 0 };
  }

  let total = 0;
  let hits = 0;

  // --- multi-word phrases first (they'd otherwise be split by the tokenizer)
  let masked = t;
  for (const phrase of MULTIWORD) {
    if (masked.includes(phrase)) {
      total += ALL_PHRASES[phrase];
      hits += 1;
      masked = masked.split(phrase).join(" ");
    }
  }

  // --- single tokens, with negation + intensity context
  const tokens = masked.match(TOKEN_RE) || [];
  let negateUntil = -1;
  let pendingMultiplier = 1;

  tokens.forEach((tok, i) => {
    if (NEGATORS.has(tok)) {
      negateUntil = i + NEGATION_WINDOW;
      return;
    }
    if (tok in INTENSIFIERS) {
      pendingMultiplier = INTENSIFIERS[tok];
      return;
    }
    if (tok in DIMINISHERS) {
      pendingMultiplier = DIMINISHERS[tok];
      return;
    }

    let val = 0;
    if (tok in POSITIVE) val = POSITIVE[tok];
    else if (tok in NEGATIVE) val = NEGATIVE[tok];
    if (val === 0) return;

    val *= pendingMultiplier;
    pendingMultiplier = 1;

    // Negation flips polarity but damps magnitude — "not great" is mildly
    // negative, not the mirror image of "great".
    if (i <= negateUntil) val = -val * 0.75;

    total += val;
    hits += 1;
  });

  // --- emoji
  const emojis = raw.match(EMOJI_RE) || [];
  for (const e of emojis) {
    if (e in EMOJI) {
      total += EMOJI[e];
      hits += 1;
    }
  }

  if (hits === 0) {
    return { score: 0, label: "neutral", confidence: 0.15, method: "lexicon", hits: 0 };
  }

  // --- emphasis: shouting and exclamation amplify whatever polarity exists
  const letters = raw.replace(/[^A-Za-z]/g, "");
  const capsRatio = letters.length >= 6 ? (raw.match(/[A-Z]/g) || []).length / letters.length : 0;
  let emphasis = 1;
  if (capsRatio > 0.6) emphasis *= 1.3;
  const bangs = (raw.match(/!/g) || []).length;
  if (bangs >= 2) emphasis *= 1.2;
  total *= emphasis;

  // --- sarcasm
  // A lexicon cannot reliably invert sarcasm, but it must not report the
  // literal reading either: "Great, another battle pass /s" is not positive.
  // Positive text carrying an explicit sarcasm marker is pulled to neutral —
  // an honest "we don't know" — rather than left reading as praise. Negative
  // text is merely damped, since sarcasm rarely makes a complaint into praise.
  const sarcastic = SARCASM_MARKERS.some((m) => t.includes(m));
  if (sarcastic) total = total > 0 ? total * 0.1 : total * 0.5;

  // Normalise: divide by a soft denominator so a single strong word doesn't
  // saturate, but a long list of mild ones still accumulates.
  const normalised = total / Math.max(2.5, hits * 1.4);
  const score = Math.round(Math.max(-1, Math.min(1, normalised)) * 100);

  // Confidence rises with the number of matched signals, falls with sarcasm
  // markers and with very short text.
  let confidence = Math.min(0.85, 0.3 + hits * 0.12);
  if (sarcastic) confidence *= 0.5;
  if (tokens.length < 4) confidence *= 0.7;

  return {
    score,
    label: sentimentLabel(score),
    confidence: Math.round(confidence * 100) / 100,
    method: "lexicon",
    hits,
  };
}

/**
 * Label thresholds on the -100..+100 scale. ±15 mirrors the ±0.15 band the
 * original prototype used, so historical figures stay comparable.
 */
function sentimentLabel(score100) {
  if (score100 > 15) return "positive";
  if (score100 < -15) return "negative";
  return "neutral";
}

/** Back-compat helper: the old -1..+1 scale, used by the static-sample loader. */
function scoreSentiment(text) {
  return analyzeSentiment(text).score / 100;
}

module.exports = { analyzeSentiment, sentimentLabel, scoreSentiment };
