# Gaming Community Pulse — 15-Minute Presentation Script

*A talk track for presenting this placement project. Timings are approximate at a natural speaking pace — practice once and adjust. [Bracketed notes] are stage directions, not things to say out loud.*

---

## 1. Opening (0:00–1:00)

Hi everyone. Today I want to walk you through a prototype I built during this placement: a lightweight social listening dashboard for gaming communities, and what it tells us about five real titles — PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft.

The brief was simple to state and hard to do well: can we build something that listens to what gamers are actually saying on Reddit, Discord, and YouTube, and turn that into signals a marketing team could actually use — without needing expensive enterprise software?

Over the next fifteen minutes I'll cover four things: how I approached the research and data collection, a live look at the dashboard itself, what we actually found across these five games, and where I think this goes next.

## 2. Scope and approach (1:00–4:00)

First, scope. I deliberately picked five very different communities, not five similar shooters. PUBG is a long-running battle royale with an established, sometimes jaded fanbase. Once Human is a survival game with gacha mechanics, right on the edge of a big console launch. Marvel Rivals is a live-service hero shooter riding a content-update cycle. Where Winds Meet is a newly launched open-world game still building its audience. And World of Warcraft is twenty years old, currently dealing with expansion fatigue. I wanted to stress-test the tool against communities that behave completely differently from each other.

[Pause] Now, an important honesty point, because I think it matters more than the pretty charts: not all of this data is real, and I want to be upfront about exactly which parts are and aren't.

YouTube data is real. It's pulled live from the YouTube Data API — actual comments, actual view counts, actual likes, refreshed on demand.

Reddit and Discord started as illustrative sample data, because Reddit's website was blocked for automated access in the environment I was building this in, and Discord requires a bot to actually be invited into a specific server — I didn't have that access when I started. So rather than fake being able to do something I couldn't, I built a clearly-labelled synthetic dataset modeled on realistic discussion patterns, so the rest of the pipeline — the analysis, the dashboard, the sentiment scoring — could all be built and tested properly.

And actually, partway through this project, I did get Discord access sorted out — I'll show you that it's now live for one channel as a proof of concept, with the same illustrative-Reddit-still-static caveat.

I think this distinction — being clear about what's real versus illustrative — is actually one of the more useful parts of this project, because it's exactly the kind of question a client would ask, and being able to answer it precisely builds trust.

## 3. Live dashboard walkthrough (4:00–7:30)

[Switch to the live dashboard at localhost:3000]

Let me show you the actual tool. This is running locally right now, pulling live data as we speak.

At the top, you can see the data source banner — it tells you plainly what's live and what isn't, right now: YouTube live, Discord live for one test channel, Reddit still illustrative. No guessing.

These chips let you filter the whole dashboard down to one game, or look at all five together. [Click a game chip]

This is the weekly discussion volume chart — and this is actually a good example of something I had to fix along the way. Real YouTube comments can trail back months, while the illustrative sample only covers a tight eight-week window. Mixed together, the older stretch looked almost flat compared to the recent spike. So I added this range slider underneath — you can drag it to zoom into any time window you want, and every other panel on the page reacts to your selection. By default it opens on the most recent eight weeks so you're not staring at a long quiet stretch first.

Right next to it, sentiment mix — positive, neutral, and negative share of the conversation, for whatever game and time window is selected.

Down here: engagement by game, so you can see at a glance which community is loudest by upvotes, likes, and reactions. And recurring themes — this is where the tool starts doing real work for a marketing team, because it's naming the actual topics driving the conversation, not just a sentiment number.

Top posts and comments is sorted purely by how liked something is — and I made a point of pulling comments two different ways here: once by recency, and once by YouTube's own top-comments ranking, so a genuinely viral comment doesn't get missed just because it's a few months old. The single most-liked one gets flagged.

And recurring questions — this is the one I'd point to first in a real meeting, because these are literally ready-made content ideas. Things like "does console get the same content as PC" or "what's the best early build" — these are FAQ posts and guide videos waiting to be made.

Below that, "Videos in this window" shows exactly which real YouTube uploads are contributing to whatever time range you've selected, with direct links.

[Pause, look up from screen] That's the tool. Now let's talk about what it actually found.

## 4. Key findings (7:30–11:30)

Across roughly five hundred data points at the time of my main analysis, one pattern stood out clearly: sentiment tracks almost exactly with how a community feels treated by recent content, not with how much people generally like the game.

Where Winds Meet came out as the most positive community in the study. Its open-world design praise scored the highest of any single theme we measured, and it had the lowest share of negative sentiment of any of the five games. Its friction points were the predictable free-to-play ones — monetization concerns, server queues at launch.

Marvel Rivals told an interesting split story. Praise for the game itself — the roster, the content cadence — scored the best of any theme in the whole dataset. But netcode and matchmaking complaints were the single largest theme by volume, and deeply negative. Players love what the game is, and are frustrated by how it performs.

PUBG sat almost exactly neutral overall, but for two very different reasons pulling in opposite directions: cheating and hacking complaints were the worst-scoring theme for that game, while a recent Spider-Man crossover was genuinely one of the best-received pieces of content across the entire dataset.

Once Human showed real excitement for its console launch and real love for its base-building system — one of the single highest-engagement posts in the whole study was someone raving about decorating their base — but monetization and bugs were its two most negative themes.

And World of Warcraft was the most sceptical community we measured. But — and this is the important nuance — that scepticism was specifically about the expansion messaging and class balance changes, not the game as a whole. Story and questline content actually scored as the best theme for WoW. So the marketing problem there isn't "people don't like the game," it's "the current pitch for what's new isn't landing."

One more finding worth mentioning: across platforms, YouTube comments ran the most positive, Discord second, Reddit closest to neutral — which makes sense, since YouTube is where people go to react to a trailer, and Reddit is where people go to actually debate and critique.

## 5. Recommendations for marketing use (11:30–13:30)

So what does a marketing team actually do with this?

Content planning is the most direct use — those recurring questions I showed you are a ready-made shortlist instead of guesswork about what content to make next.

Campaign research: you can benchmark a community's sentiment before a launch or a season, and then measure the actual lift afterward — we saw that clearly with PUBG's crossover moment.

Community monitoring works as an early warning system — a rising negative theme, like Marvel Rivals' netcode complaints, is exactly the kind of thing you'd want to catch before it becomes a public relations story.

And it gives you a consistent scorecard for comparing titles across a portfolio, which is genuinely useful in a pitch or a quarterly review.

But I want to be honest about the limits too, because I think that's actually more valuable than overselling it. Sentiment scoring — mine included — struggles with sarcasm and in-jokes. Small samples can swing wildly on a handful of viral posts. And critically, this tool tells you what people are saying and roughly how they feel — it doesn't tell you why in any deep sense, and it can't replace a human's judgment on tone, timing, or how to actually respond.

## 6. Closing and next steps (13:30–15:00)

To wrap up: what I've delivered is a working prototype that's honest about what's real and what's illustrative, a live dashboard that actually pulls fresh YouTube data and, as of this week, live Discord data too, a set of findings that hold up as genuinely useful marketing signal, and a clear path to extend it further.

The next steps, if this were to continue: get proper Reddit API access to replace that last illustrative piece, add scheduled automatic refreshes instead of on-demand ones, upgrade the sentiment scoring to a real NLP model now that there's API access available, and pilot it with one real account team on one real title to see what they actually want more of.

That's the project. Happy to answer any questions, or to pull up any part of the dashboard again if you want to see something specific.

[End]

---

## Appendix: quick reference numbers (for Q&A)

- **Most positive game:** Where Winds Meet (avg sentiment +0.185)
- **Most negative game:** World of Warcraft (avg sentiment −0.093)
- **Highest engagement:** PUBG (11,024 total engagement score in the original static analysis)
- **Worst single theme:** Marvel Rivals netcode/matchmaking complaints (−0.67 average sentiment, largest theme by volume)
- **Best single theme:** Where Winds Meet open-world praise (+0.725 average sentiment)
- **Platform tone ranking:** YouTube most positive → Discord → Reddit closest to neutral
- **Data honesty:** YouTube = real, live. Discord = live for one configured channel. Reddit = illustrative sample pending API access.

*(These specific numbers come from the original static analysis in `GAMING_COMMUNITY_PULSE_REPORT.md`. If you refresh the live dashboard before presenting, the live YouTube/Discord numbers will differ slightly — the patterns and direction should hold, but call out that live figures are a fresh snapshot, not the same run.)*
