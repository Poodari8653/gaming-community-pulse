#!/usr/bin/env python3
"""
Combines:
  - REAL YouTube comment data (data/raw/youtube_*.json) collected via live
    browser capture on 2026-07-30.
  - SYNTHETIC Reddit + Discord data (data/processed/synthetic_reddit_discord.csv).

Produces:
  - data/processed/master_dataset.csv   (unified row-level dataset)
  - data/processed/analysis.json        (aggregated metrics for the dashboard)

Sentiment: lightweight lexicon-based scorer (no internet/model dependency),
documented in the methodology doc. Not a substitute for a production NLP
sentiment model, but sufficient to demonstrate the analysis approach.
"""
import csv
import json
import glob
import re
import datetime as dt
from collections import defaultdict, Counter

TODAY = dt.date(2026, 7, 30)
WINDOW_WEEKS_CONST = 8

# ---------------------------------------------------------------------------
# 1. Lightweight sentiment lexicon
# ---------------------------------------------------------------------------
POSITIVE_WORDS = {
    "good": 1, "great": 2, "amazing": 2, "love": 2, "best": 2, "fun": 1, "awesome": 2,
    "hyped": 1, "hype": 1, "excited": 1, "worth": 1, "well": 1, "nice": 1, "cool": 1,
    "beautiful": 2, "stunning": 2, "addictive": 1, "solid": 1, "charm": 1, "genuinely": 0,
    "surprised": 0, "creative": 1, "unmatched": 2, "fresh": 1, "tight": 1, "finally": 0,
    "cant wait": 1, "can't wait": 1, "yesss": 1, "yes": 0, "glad": 1, "enjoy": 1,
    "impressive": 2, "polished": 1, "smooth": 1, "generous": 1,
}
NEGATIVE_WORDS = {
    "bad": -1, "worst": -2, "hate": -2, "broken": -2, "bug": -1, "bugs": -1, "buggy": -1,
    "lazy": -1, "lazily": -1, "unplayable": -2, "ruined": -2, "gutted": -2, "predatory": -2,
    "cheating": -1, "hacker": -1, "hackers": -1, "wallhacker": -1, "wallhackers": -1,
    "rough": -1, "miserable": -2, "punishing": -1, "fomo": -1, "grind": -1, "grindy": -1,
    "crash": -1, "crashed": -1, "disconnect": -1, "disconnected": -1, "exhausting": -1,
    "insane": -1, "brutal": -1, "terrible": -2, "awful": -2, "annoying": -1, "sunk cost": -1,
    "fallacy": -1, "biased": -1, "overpriced": -1, "expensive": -1, "drought": -1,
    "skeptical": -1, "doesnt hype": -1, "doesn't hype": -1, "rest in peace": -2, "rip": -1,
}

WORD_RE = re.compile(r"[a-zA-Z']+")

def score_sentiment(text: str) -> float:
    t = text.lower()
    score = 0
    hits = 0
    for phrase, val in {**POSITIVE_WORDS, **NEGATIVE_WORDS}.items():
        if " " in phrase and phrase in t:
            score += val
            hits += 1
    words = WORD_RE.findall(t)
    for w in words:
        if w in POSITIVE_WORDS:
            score += POSITIVE_WORDS[w]
            hits += 1
        elif w in NEGATIVE_WORDS:
            score += NEGATIVE_WORDS[w]
            hits += 1
    if hits == 0:
        return 0.0
    # normalize roughly to [-1, 1]
    return max(-1.0, min(1.0, score / max(3, hits * 1.5)))

def sentiment_label(s: float) -> str:
    if s > 0.15:
        return "positive"
    if s < -0.15:
        return "negative"
    return "neutral"

# ---------------------------------------------------------------------------
# 2. Load YouTube real data
# ---------------------------------------------------------------------------
GAME_NAME_FIX = {
    "PUBG": "PUBG",
    "Once Human": "Once Human",
    "Marvel Rivals": "Marvel Rivals",
    "Where Winds Meet": "Where Winds Meet",
    "World of Warcraft": "World of Warcraft",
}

RELATIVE_MONTHS = {
    "1 month ago": 4, "2 weeks ago": 2, "3 weeks ago": 3, "1 week ago": 1,
    "4 months ago": 17, "3 months ago": 13, "6 months ago": 26, "8 months ago": 34,
}

def relative_to_date(rel: str) -> dt.date:
    weeks = RELATIVE_MONTHS.get(rel)
    if weeks is None:
        # fallback parse "N weeks/months ago"
        m = re.match(r"(\d+)\s+(day|week|month)s?\s+ago", rel)
        if not m:
            return TODAY
        n, unit = int(m.group(1)), m.group(2)
        if unit == "day":
            return TODAY - dt.timedelta(days=n)
        if unit == "week":
            return TODAY - dt.timedelta(weeks=n)
        if unit == "month":
            return TODAY - dt.timedelta(weeks=n * 4)
    return TODAY - dt.timedelta(weeks=weeks)

rows = []
row_id = 100000

yt_files = sorted(glob.glob("data/raw/youtube_*.json"))
for fp in yt_files:
    with open(fp, encoding="utf-8") as f:
        d = json.load(f)
    game = d["game"]
    for c in d["comments"]:
        date = relative_to_date(c["time"])
        text = c["text"]
        rows.append({
            "row_id": row_id, "platform": "YouTube", "data_type": "real",
            "game": game, "source": d["video_title"], "content_type": "comment",
            "author": c["author"], "timestamp": dt.datetime.combine(date, dt.time(12, 0)).isoformat(),
            "text": text, "theme": "", "polarity_seed": "", "score": c.get("likes", 0),
            "num_comments": c.get("replies", 0), "url": d["video_url"],
        })
        row_id += 1

print(f"Loaded {len(rows)} real YouTube comment rows from {len(yt_files)} videos.")

# ---------------------------------------------------------------------------
# 3. Load synthetic Reddit + Discord data
# ---------------------------------------------------------------------------
with open("data/processed/synthetic_reddit_discord.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        r["row_id"] = int(r["row_id"]) + 200000
        r["score"] = int(r["score"])
        r["num_comments"] = int(r["num_comments"])
        rows.append(r)

print(f"Total combined rows: {len(rows)}")

# ---------------------------------------------------------------------------
# 4. Score sentiment for every row
# ---------------------------------------------------------------------------
for r in rows:
    s = score_sentiment(r["text"])
    r["sentiment_score"] = round(s, 3)
    r["sentiment_label"] = sentiment_label(s)

# ---------------------------------------------------------------------------
# 5. Write master dataset CSV
# ---------------------------------------------------------------------------
fieldnames = ["row_id", "platform", "data_type", "game", "source", "content_type",
              "author", "timestamp", "text", "theme", "polarity_seed", "score",
              "num_comments", "url", "sentiment_score", "sentiment_label"]

with open("data/processed/master_dataset.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k, "") for k in fieldnames})

# ---------------------------------------------------------------------------
# 6. Aggregate analysis for dashboard
# ---------------------------------------------------------------------------
GAMES = ["PUBG", "Once Human", "Marvel Rivals", "Where Winds Meet", "World of Warcraft"]

analysis = {
    "generated_at": TODAY.isoformat(),
    "total_records": len(rows),
    "games": GAMES,
    "by_game": {},
    "by_platform": {},
    "weekly_volume": {},       # game -> [{week, count, avg_sentiment}]
    "sentiment_distribution": {},  # game -> {positive, neutral, negative}
    "top_themes": {},          # game -> [{theme, count, avg_sentiment}]
    "top_posts": {},           # game -> [{text, score, platform, sentiment_label}]
    "platform_sentiment": {},  # platform -> avg sentiment
}

by_game_rows = defaultdict(list)
for r in rows:
    by_game_rows[r["game"]].append(r)

for game in GAMES:
    grows = by_game_rows.get(game, [])
    n = len(grows)
    avg_sent = sum(r["sentiment_score"] for r in grows) / n if n else 0
    total_engagement = sum(r["score"] for r in grows)
    dist = Counter(r["sentiment_label"] for r in grows)
    analysis["by_game"][game] = {
        "record_count": n,
        "avg_sentiment": round(avg_sent, 3),
        "total_engagement_score": total_engagement,
        "platforms": dict(Counter(r["platform"] for r in grows)),
    }
    analysis["sentiment_distribution"][game] = {
        "positive": dist.get("positive", 0),
        "neutral": dist.get("neutral", 0),
        "negative": dist.get("negative", 0),
    }

    # weekly volume + sentiment (last 8 weeks, synthetic Reddit/Discord window only —
    # YouTube real comments span months and would create sparse/misleading gaps if mixed in)
    weekly = defaultdict(lambda: {"count": 0, "sent_sum": 0.0})
    for r in grows:
        if r["data_type"] != "synthetic":
            continue
        ts = dt.datetime.fromisoformat(r["timestamp"])
        # bucket by ISO week start (Monday)
        week_start = ts.date() - dt.timedelta(days=ts.date().weekday())
        weekly[week_start.isoformat()]["count"] += 1
        weekly[week_start.isoformat()]["sent_sum"] += r["sentiment_score"]

    # ensure every week in the 8-week window appears, even if count is 0
    win_start = TODAY - dt.timedelta(weeks=WINDOW_WEEKS_CONST)
    win_start = win_start - dt.timedelta(days=win_start.weekday())
    all_weeks = [(win_start + dt.timedelta(weeks=i)).isoformat() for i in range(WINDOW_WEEKS_CONST + 1)]

    weekly_list = []
    for wk in all_weeks:
        c = weekly[wk]["count"] if wk in weekly else 0
        weekly_list.append({
            "week": wk,
            "count": c,
            "avg_sentiment": round(weekly[wk]["sent_sum"] / c, 3) if c else 0,
        })
    analysis["weekly_volume"][game] = weekly_list

    # themes (synthetic rows have a theme field; YouTube rows don't)
    theme_rows = [r for r in grows if r.get("theme")]
    theme_agg = defaultdict(lambda: {"count": 0, "sent_sum": 0.0})
    for r in theme_rows:
        th = r["theme"]
        theme_agg[th]["count"] += 1
        theme_agg[th]["sent_sum"] += r["sentiment_score"]
    top_themes = sorted(
        [{"theme": k, "count": v["count"], "avg_sentiment": round(v["sent_sum"] / v["count"], 3)}
         for k, v in theme_agg.items()],
        key=lambda x: -x["count"]
    )
    analysis["top_themes"][game] = top_themes

    # top posts by engagement score
    top_posts = sorted(grows, key=lambda r: -r["score"])[:6]
    analysis["top_posts"][game] = [
        {"text": r["text"], "score": r["score"], "platform": r["platform"],
         "sentiment_label": r["sentiment_label"], "source": r["source"]}
        for r in top_posts
    ]

    # recurring questions: text ends in '?' or theme flagged as a question-type theme
    question_rows = [r for r in grows if r["text"].strip().endswith("?")]
    analysis.setdefault("recurring_questions", {})[game] = [
        {"text": r["text"], "platform": r["platform"], "score": r["score"], "source": r["source"]}
        for r in sorted(question_rows, key=lambda r: -r["score"])[:5]
    ]

# platform-level rollup
by_platform_rows = defaultdict(list)
for r in rows:
    by_platform_rows[r["platform"]].append(r)
for plat, prows in by_platform_rows.items():
    n = len(prows)
    avg_sent = sum(r["sentiment_score"] for r in prows) / n if n else 0
    analysis["by_platform"][plat] = {"record_count": n, "avg_sentiment": round(avg_sent, 3)}
    analysis["platform_sentiment"][plat] = round(avg_sent, 3)

with open("data/processed/analysis.json", "w", encoding="utf-8") as f:
    json.dump(analysis, f, indent=2)

print("Wrote master_dataset.csv and analysis.json")
print(json.dumps(analysis["by_game"], indent=2))
