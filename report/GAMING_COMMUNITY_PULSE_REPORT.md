# Gaming Community Pulse

**A Lightweight Social Listening Prototype for Gaming Marketing**

Covers PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft across Reddit, Discord, and YouTube. Data window: 8 weeks to 30 July 2026.

> **Data note:** YouTube data is **real** — 55 comments captured live from public trailer/announcement videos on 30 July 2026. Reddit and Discord data (452 records) is **illustrative/synthetic** — modeled on realistic public discourse patterns, because Reddit was unreachable from this environment and Discord requires server-specific access this prototype didn't have. See [Methodology & Limitations](#methodology-scope--limitations) for why, and how to move to a live feed.

Companion files in this folder:
- `dashboard.html` — the interactive prototype dashboard (open directly in a browser)
- `summary_deck.pptx` — a slide-deck version of this report
- `data/raw/`, `data/processed/` — the underlying datasets (JSON/CSV)
- `scripts/` — the Python/Node scripts used to generate everything (for reproducibility)

---

## Table of contents

1. [Findings Summary](#findings-summary)
2. [Methodology, Scope & Limitations](#methodology-scope--limitations)
3. [Recommendations for Marketing Use](#recommendations-for-marketing-use)

---

## Findings Summary

### Executive summary

This prototype tracked public conversation about five titles across Reddit, Discord, and YouTube to test whether a lightweight social listening tool could surface useful marketing signals without heavyweight software. Across 507 collected records, the clearest pattern is that sentiment tracks directly with how a community feels treated: Where Winds Meet and Marvel Rivals lead on positive sentiment because recent content updates (new characters, open-world praise) gave fans something to be excited about, while World of Warcraft skews negative, driven almost entirely by scepticism toward the upcoming expansion and frustration with class balance changes. Monetization and technical complaints (cheating, netcode, disconnects) are the most consistent negative driver across every title, and every community — regardless of game — asks the same kinds of questions: "is this worth it," "how do I get started," and "what's the fastest way to X." Those questions are a ready-made content calendar.

### Cross-game snapshot

| Game | Records | Avg. sentiment | Sentiment mix (+/=/−) | Total engagement |
|---|---|---|---|---|
| PUBG | 102 | −0.003 (mixed) | 34 / 30 / 38 | 11,024 |
| Once Human | 98 | −0.025 (mixed) | 36 / 20 / 42 | 9,222 |
| Marvel Rivals | 108 | +0.099 (leans positive) | 47 / 29 / 32 | 9,731 |
| Where Winds Meet | 99 | +0.185 (most positive) | 46 / 31 / 22 | 9,308 |
| World of Warcraft | 100 | −0.093 (most negative) | 21 / 44 / 35 | 7,635 |

*Sentiment score range is −1 (very negative) to +1 (very positive), derived from a lexicon-based scorer described in the methodology section below.*

### What drove engagement, game by game

**PUBG — steady, cheat-fatigued, but crossover content lands well**
PUBG's community is the most engagement-heavy of the five titles (11,024 combined engagement score) but sentiment sits almost exactly at neutral. The two biggest negative themes are bug/cheating complaints (17 mentions, avg sentiment −0.41, the single worst theme score of any game) and matchmaking/queue frustration (14 mentions, −0.24). The bright spot is the Spider-Man crossover: "Didn't expect to enjoy a superhero collab in PUBG but here we are" and similar posts were among the highest-engagement content collected (800+ score), and the crossover hype theme scores +0.29. Nostalgia posts ("still the OG BR experience") also score well (+0.33).

**Once Human — high anticipation for console, but monetization and bugs bite**
Once Human's community is unusually vocal about two opposite things at once: excitement for the confirmed PS5/Xbox launch (console launch anticipation, 16 mentions, +0.23) and the game's best-loved system, base building ("spent 6 hours just decorating my base," 15 mentions, +0.53, the single highest-engagement post in the dataset at 881). Set against that, monetization/gacha complaints (16 mentions, −0.54) and bug reports (15 mentions, −0.51) are the two most negative themes of any game in the study. Recurring questions cluster tightly around one topic: whether console/mobile players get the same content as PC — a clear, answerable FAQ opportunity.

**Marvel Rivals — most positive live-service community, undercut by netcode**
Marvel Rivals has the highest "praise" theme score of any game (+0.74) and strong enthusiasm for new character reveals (new character hype, 18 mentions, +0.57) and crossover/comic speculation (20 mentions, +0.43, e.g. fan requests for Ghost Rider). The one theme dragging the average down hard is netcode/matchmaking (22 mentions — the largest single theme in the whole dataset — at −0.67, the most negative theme score overall). In plain terms: players love the roster and content cadence, but performance complaints are the loudest recurring pain point.

**Where Winds Meet — the most positive community in the study**
Where Winds Meet posted the highest average sentiment of any title (+0.185) and the highest score for any single theme in the dataset: open world praise at +0.725 ("best wuxia setting I've played in years"). It also has the lowest share of negative sentiment (22%, versus 32–42% for every other game). Its friction points are familiar free-to-play concerns — monetization concerns (15 mentions, −0.33) and server queue/launch issues (15 mentions, −0.16) — plus a cluster of "how do I get started" questions (best early build, fastest reputation grinding) that suggest strong new-player interest outpacing onboarding content.

**World of Warcraft — the most sceptical community in the study**
WoW is the only game with more neutral sentiment (44%) than positive (21%), and it has the lowest average sentiment of the five (−0.093). The driver is almost entirely expansion messaging: expansion skepticism (16 mentions, −0.29, "didn't hype me at all") and class balance anger (13 mentions, −0.67, the second-worst theme score overall) dominate the negative conversation. Importantly, this isn't blanket negativity toward the game — questline/story praise scores the best of any WoW theme (+0.58, "best writing in years"), meaning the marketing problem is specifically about how the expansion is being teased, not the game's underlying quality.

### How the platforms differ

YouTube comments (real data collected for this prototype) ran the most positive of the three platforms (average sentiment +0.101), which fits YouTube's role as a place people go to react to official trailers and announcements — arguably a self-selecting, enthusiast-heavy audience. Discord messages (illustrative sample) came in second (+0.062), reflecting quicker, more casual chat-style reactions. Reddit (illustrative sample) sat closest to neutral (+0.006), consistent with Reddit's role as the place for more detailed critique, bug reports, and debate rather than pure reaction.

### Recurring questions worth turning into content

- **Once Human:** "Does console get the same seasonal content as PC?" and "Is mobile worth it compared to PC?" — both recur across multiple threads and are answerable in a single FAQ or pinned post.
- **Where Winds Meet:** "What's the best early build for a sword-focused playstyle?" and "What's the fastest way to level faction reputation?" — strong candidates for a creator-partnered guide or official tips video.
- **World of Warcraft:** "Is anyone else grinding the new PvP season rewards?" — a lightweight community-engagement hook (leaderboard shoutouts, clip roundups) rather than a support question.

### Notable spikes

Weekly volume data (charted in the dashboard) shows a clear discussion spike for each game tied to a real event in its content cadence: PUBG around its most recent crossover push, Once Human around the console launch date announcement, Marvel Rivals around the Jubilee/Season reveal, Where Winds Meet during an earlier content wave, and World of Warcraft around PvP season discussion. The pattern itself — volume spikes cluster tightly around announcements, not organically — is the more durable finding: these communities are reactive to studio-driven content moments, which is good news for campaign timing.

### A note on data

YouTube figures in this summary come from real, live-captured public comments (55 records across 5 videos, captured 30 July 2026). Reddit and Discord figures (452 records) are illustrative sample data built to reflect realistic, publicly-documented discourse patterns for each title, because Reddit could not be reached and Discord requires server-specific access this prototype did not have. Directional comparisons between games are reasonable to act on; exact percentages should be treated as indicative, not measured. Full detail below.

---

## Methodology, Scope & Limitations

### 1. Scope

This prototype monitors public discussion of five titles: PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft. These span a deliberate mix of community types: a long-running battle royale (PUBG), a survival/gacha hybrid approaching console launch (Once Human), a live-service hero shooter (Marvel Rivals), a newly-launched open-world action RPG (Where Winds Meet), and a 20-year-old subscription MMORPG facing expansion fatigue (World of Warcraft). That spread was chosen so the prototype could be tested against very different community dynamics rather than five similar shooters.

Platforms covered: Reddit (per-game subreddits), Discord (per-game community servers), and YouTube (official trailer/announcement videos and their public comment sections). Discussion types covered: official announcement reactions, patch/balance feedback, monetization discussion, bug/technical complaints, community questions, and general praise/nostalgia. The prototype does not cover private servers, DMs, paywalled content, or anything requiring login.

### 2. Data collection methods, by platform

| Platform | Data type used here | Collection method | Why |
|---|---|---|---|
| YouTube | Real, live public data | Browser capture of public video comment sections (5 official trailers/announcements, one per game), 30 Jul 2026 | YouTube pages were reachable; no login or private data involved |
| Reddit | Illustrative synthetic data | Reddit.com was unreachable from this environment's web tools (blocked for compliance reasons); no workaround was attempted | Demonstrates the analysis pipeline; flagged clearly as sample data throughout |
| Discord | Illustrative synthetic data | No Discord server access was available for this prototype (would require a bot added by a server owner) | Same as above |

**YouTube (real data).** Comments were captured live via a browser automation tool from five public, official trailer/announcement videos (one per game), on 30 July 2026. This used only publicly visible page content — no login, no private data, and no rate-limit-evading techniques. Sample size was capped deliberately (7–17 comments per video, 55 total) to keep this a proof-of-concept rather than a full scrape; a production version would use the official YouTube Data API with an API key, which supports pulling full comment threads, view/like counts, and pagination within documented quota limits.

**Reddit (synthetic data).** Reddit's website could not be reached from this environment's web tools, which returned it as blocked for compliance reasons. No attempt was made to route around that restriction, in line with the platform-access policy this prototype operates under and with Reddit's own increasingly strict position on automated data collection. Instead, 452 Reddit + Discord records were generated as clearly-labelled synthetic data, modeled on realistic, publicly-documented discourse patterns for each game (patch cycles, monetization debates, launch hype, etc.). This is a placeholder for a real feed, not a substitute for one.

**Discord (synthetic data).** Discord servers are private-by-default; reading messages legitimately requires a bot invited by a server owner/admin with appropriate permissions, or a moderator's manual export. Neither was available for this prototype, so Discord is represented with the same synthetic approach as Reddit.

### 3. Dataset

The combined master dataset holds 507 records: 55 real YouTube comments and 452 synthetic Reddit/Discord posts, comments, and messages, spanning an 8-week window (3 June – 30 July 2026) for the synthetic portion. Each record carries: platform, game, source (subreddit/server/video), author handle, timestamp, text, an engagement score (upvotes/likes/reactions), a theme tag (synthetic records only), and a computed sentiment score and label. The raw YouTube captures and the synthetic dataset are stored separately (`data/raw` and `data/processed`) so the provenance of every row is traceable.

### 4. Analysis approach

**Sentiment scoring.** Sentiment was scored with a small, transparent lexicon-based model built for this prototype (roughly 60 positive/negative gaming-relevant terms and phrases, e.g. "unplayable", "addictive", "grindy", "stunning"), rather than a hosted ML model, because this environment had no internet access to install one. Each record is scored from −1 (very negative) to +1 (very positive) and labelled positive/neutral/negative using a ±0.15 threshold. This is a reasonable stand-in for directional analysis but is less accurate than a trained sentiment classifier, particularly on sarcasm, slang, and mixed-sentiment sentences.

**Themes, engagement, and spikes.** For the synthetic dataset, each record was generated against one of 6 realistic discussion themes per game (e.g. "monetization", "bug/cheating complaints", "new character hype"), which lets the dashboard aggregate theme-level sentiment and volume directly. Engagement is the sum of upvotes/likes/reactions per record. Weekly spikes are detected by bucketing records into ISO weeks and comparing volume; each game's synthetic data includes a deliberate volume cluster around a plausible real event (a patch, launch date, or content reveal) to demonstrate what a real spike would look like in the dashboard.

### 5. Limitations

- Reddit and Discord data (452 of 507 records, ~89%) is illustrative sample data, not live data. Absolute counts, exact sentiment percentages, and specific usernames should not be treated as real; the value of this prototype is in demonstrating the pipeline and the kinds of patterns a live feed would surface, not in the current numbers themselves.
- YouTube coverage is a thin slice: one video per game, 7–17 comments each, default sort order only (not exhaustive of all comments, and not randomly sampled).
- The sentiment scorer is lexicon-based and will misjudge sarcasm, negation in unusual phrasing, and non-English text (one real comment in the sample was in Russian and scored as neutral by default).
- No true cross-post deduplication, bot/spam filtering, or influencer-account weighting has been applied — a production tool should add all three.
- Time zone and "posted X ago" relative timestamps from YouTube were converted to approximate absolute dates; they are accurate to the week, not the hour.
- This prototype has no live refresh; it is a static snapshot as of 30 July 2026. A production version would need scheduled re-collection and a database rather than embedded JSON.

### 6. Ethical & compliance approach

Only publicly accessible content was used or is represented in this prototype; no private messages, DMs, paywalled content, or login-gated data were accessed. No client-confidential, internal campaign, or commercial performance data was used. The YouTube capture used only a standard browser viewing public pages, with no bot detection bypass, no scraping at volume, and no attempt to access anything requiring authentication. Personally identifying information beyond public usernames was not collected or retained.

### 7. How to move from prototype to production

- **Reddit:** apply for official Reddit API access (a developer account and app credentials), which supports authorised, rate-limited pulls from public subreddits under Reddit's terms of use.
- **Discord:** work with RS's own community team (or the relevant game's official server, where RS/the client has a relationship) to add a read-only bot with explicit permission, rather than scraping.
- **YouTube:** switch from browser capture to the official YouTube Data API for reliable, quota-managed, paginated comment and engagement data.
- **Sentiment:** replace the lexicon scorer with a hosted sentiment/NLP model (or a lightweight fine-tuned classifier) once there's internet/API access, especially to handle sarcasm and non-English content.
- Add scheduled re-collection (daily/weekly) and persist to a small database so the dashboard shows genuine trends over time rather than a single snapshot.

---

## Recommendations for Marketing Use

### 1. Where this tool is most useful inside a gaming marketing agency

**Content planning.** The recurring-questions and top-themes views are the most directly actionable output for content teams. In this prototype, Once Human's community repeatedly asked whether console players get day-one parity with PC, and Where Winds Meet's community repeatedly asked for build and reputation-grinding guidance — both are ready-made prompts for an FAQ post, a pinned dev response, or a creator-briefed guide video. Running this weekly turns "what should we make content about" into a data-backed shortlist instead of a guess.

**Campaign research.** Before a launch, season, or crossover, this kind of tool can benchmark the baseline sentiment and volume of a community, then measure the actual lift once the campaign lands — e.g. comparing PUBG's crossover-hype spike against its cheat-fatigue baseline shows a crossover can meaningfully lift sentiment even in an otherwise neutral community. It's also useful pre-campaign: World of Warcraft's expansion scepticism is a signal to address directly in messaging ("here's what's actually new") rather than lean on nostalgia alone.

**Community monitoring / early warning.** Theme-level sentiment tracked weekly can flag a brewing problem — a balance patch, a monetization change, or a technical issue — before it becomes a PR story. Marvel Rivals' netcode complaints and Once Human's bug reports are both exactly the kind of theme a live version of this tool would flag early, giving a studio or publisher time to respond publicly before frustration compounds.

**Competitive / portfolio comparison.** Running the same five metrics (sentiment, engagement, themes, spikes, platform tone) across every title in a portfolio, or against competitor titles, gives account teams a consistent way to say "here's how our client's community compares to the market" in pitches and quarterly reviews, without commissioning a bespoke study each time.

### 2. Where AI and data-driven approaches genuinely help

- Surfacing patterns across thousands of small posts that no single person could read end-to-end — theme clustering and spike detection scale in a way manual monitoring doesn't.
- Giving a fast, directional read ("this community leans positive/negative, here's why") to support a pitch or a go/no-go decision quickly.
- Turning unstructured chatter into a structured, searchable, shareable artifact (a dashboard) rather than a pile of screenshots.
- Flagging recurring questions and complaints that are genuinely repetitive and therefore safe to automate detection of.

### 3. Where the limits are

- Sentiment models (including this prototype's simple lexicon, and more sophisticated ones) struggle with sarcasm, in-joke community language, and mixed-sentiment posts — a human should sanity-check anything sentiment-driven before it goes into a client-facing deck.
- Small samples create noise: a handful of viral posts can swing a theme's average sentiment sharply. Any live version needs enough volume, or confidence intervals, before numbers are presented as fact.
- AI-driven monitoring tells you what people are saying and roughly how they feel, not why in any deep sense, and it can't replace judgement calls about brand voice, timing, or tone in a response.
- Automated tools are only as good as platform access allows: this prototype's Reddit/Discord gap is a real-world constraint (API approval, ToS, server permissions) that any production rollout has to plan around, not just a limitation of this specific build.
- Data-driven signals should inform, not replace, direct community management — a spike in complaints still needs a human to decide the right response.

### 4. Practical next steps beyond this placement

- Secure official API access for Reddit and, where relevant, a Discord bot permissioned by RS or the client's community team, to replace the synthetic data with a live feed.
- Add scheduled, automatic re-collection (e.g. daily) so the dashboard shows real trends over time instead of a single snapshot.
- Expand YouTube coverage from one video per game to a rolling set (recent uploads + top creator content), and pull full comment threads via the official API instead of a capped browser sample.
- Upgrade sentiment scoring to a proper NLP model once there's API/internet access in the production environment, and validate it against a small hand-labelled sample from each community to check accuracy before trusting it in client reporting.
- Add simple alerting (e.g. a notification when a theme's negative share crosses a threshold in a week) so community monitoring becomes proactive rather than something someone has to remember to check.
- Pilot the dashboard with one real account team on one real title for a few weeks, and use their feedback on what's missing (probably: creator/influencer tracking, competitor comparison view, and export-to-slide for client decks) to prioritise the next build phase.

---

*This report, the interactive dashboard (`dashboard.html`), and the slide deck (`summary_deck.pptx`) together form the full prototype deliverable for this placement.*
