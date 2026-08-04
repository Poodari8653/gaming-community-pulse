// Lightweight lexicon-based sentiment scorer — a JS port of the same scorer
// used to build the original prototype dataset (scripts/build_dataset_and_analysis.py),
// so live YouTube data and the static synthetic sample stay on a consistent scale.
// Not a substitute for a hosted NLP model — see report/GAMING_COMMUNITY_PULSE_REPORT.md
// (Methodology, section 4) for its known limitations.

const POSITIVE_WORDS = {
  good: 1, great: 2, amazing: 2, love: 2, best: 2, fun: 1, awesome: 2,
  hyped: 1, hype: 1, excited: 1, worth: 1, well: 1, nice: 1, cool: 1,
  beautiful: 2, stunning: 2, addictive: 1, solid: 1, charm: 1,
  surprised: 0, creative: 1, unmatched: 2, fresh: 1, tight: 1, finally: 0,
  "cant wait": 1, "can't wait": 1, yesss: 1, yes: 0, glad: 1, enjoy: 1,
  impressive: 2, polished: 1, smooth: 1, generous: 1,
};

const NEGATIVE_WORDS = {
  bad: -1, worst: -2, hate: -2, broken: -2, bug: -1, bugs: -1, buggy: -1,
  lazy: -1, lazily: -1, unplayable: -2, ruined: -2, gutted: -2, predatory: -2,
  cheating: -1, hacker: -1, hackers: -1, wallhacker: -1, wallhackers: -1,
  rough: -1, miserable: -2, punishing: -1, fomo: -1, grind: -1, grindy: -1,
  crash: -1, crashed: -1, disconnect: -1, disconnected: -1, exhausting: -1,
  insane: -1, brutal: -1, terrible: -2, awful: -2, annoying: -1, "sunk cost": -1,
  fallacy: -1, biased: -1, overpriced: -1, expensive: -1, drought: -1,
  skeptical: -1, "doesnt hype": -1, "doesn't hype": -1, "rest in peace": -2, rip: -1,
};

const ALL_PHRASES = { ...POSITIVE_WORDS, ...NEGATIVE_WORDS };
const WORD_RE = /[a-zA-Z']+/g;

function scoreSentiment(text) {
  const t = (text || "").toLowerCase();
  let score = 0;
  let hits = 0;

  for (const [phrase, val] of Object.entries(ALL_PHRASES)) {
    if (phrase.includes(" ") && t.includes(phrase)) {
      score += val;
      hits += 1;
    }
  }

  const words = t.match(WORD_RE) || [];
  for (const w of words) {
    if (w in POSITIVE_WORDS) {
      score += POSITIVE_WORDS[w];
      hits += 1;
    } else if (w in NEGATIVE_WORDS) {
      score += NEGATIVE_WORDS[w];
      hits += 1;
    }
  }

  if (hits === 0) return 0;
  const normalized = score / Math.max(3, hits * 1.5);
  return Math.max(-1, Math.min(1, normalized));
}

function sentimentLabel(s) {
  if (s > 0.15) return "positive";
  if (s < -0.15) return "negative";
  return "neutral";
}

module.exports = { scoreSentiment, sentimentLabel };
