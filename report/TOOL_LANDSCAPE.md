# Existing Social Listening Tools

Social listening promises that everything players say about a game, anywhere public, arrives in one place, scored and sorted, in time to act on. The category has built genuinely impressive machinery to deliver it: licensed data feeds, multilingual sentiment models, alerting, archives going back years.

What RS needs is narrower and harder. Not "what is the world saying about our brand", but: what are the communities around a specific title arguing about this week, on the four platforms where gaming discussion actually happens (Reddit, Discord, YouTube, Twitch), tuned to how gamers talk, split by publisher region so a Chinese-market title and a Western-market title can be read side by side, cheap enough to spin up per title and per campaign, and delivered as a short read rather than a wall of charts.

Most products below do the first well and the second badly. This document sets out where the market sits, where the gaps are, and what the Gaming Community Pulse prototype does differently as a result.

## The market in three tiers

| Tier | Example products | Rough price band | What you get | Who it's for |
|---|---|---|---|---|
| **Enterprise suites** | Brandwatch, Sprinklr, Talkwalker, Meltwater, Pulsar, StatSocial | Custom quote, tens of thousands a year. Vendr's aggregated contract data puts Brandwatch's median at [$50,000/yr across 40 purchases, ranging $19,542–$81,200](https://www.vendr.com/marketplace/brandwatch), and Meltwater's at [$25,800/yr across 126 purchases](https://www.vendr.com/marketplace/meltwater). Sprinklr [retired its self-serve tier on 30 April 2026](https://chatarmin.com/en/blog/sprinklr-pricing), so enterprise sales is now the only way in. Pulsar states plainly that there is [no published tier list and no self-serve checkout](https://www.pulsarplatform.com/guides/what-is-pulsar-trac-features-pricing) | Licensed firehose data, multi-year archives, very broad language coverage, audience segmentation, share-of-voice benchmarking, compliance, named CSM | Global brands and holding-company agencies with a dedicated insights team |
| **Mid-market** | Brand24, Determ, Mention, Sprout Social, Hootsuite | Roughly $100–$700 a month. [Brand24 runs $249–$699/mo billed monthly](https://brand24.com/pricing/) (3–25 keywords, 2k–100k mentions; Enterprise from $1,499); [Determ €99–€499/mo](https://determ.com/pricing/) (1–10 topics, 1k–10k mentions); [Sprout Social $79–$399 per seat/month, with Listening sold as a separate add-on at an undisclosed price](https://sproutsocial.com/pricing/); [Hootsuite $99–$399 per user/month, but advanced listening sits in the custom-priced Enterprise tier](https://www.hootsuite.com/plans) | Keyword monitoring across mainstream socials plus news and forums, basic sentiment, alerts, reporting | In-house marketing teams and small agencies doing brand monitoring |
| **Niche / single-platform** | SullyGnome, TwitchTracker, Streams Charts, Social Blade, vidIQ, Statbot, CommunityOne, Reddit Pro, Levellr, Gameplainer | Free to a few hundred a month. [SullyGnome is a free hobby project](https://sullygnome.com/) — its own footer asks people not to scrape it; [Reddit Pro is free](https://techcrunch.com/2025/01/07/reddit-intros-new-trends-tools-for-businesses-and-an-ama-ad-format/); [Gameplainer has a free tier](https://gameplainer.com/) | Deep, accurate data on exactly one platform — and nothing else | Creators, community managers and analysts who already know which platform matters |

The gap between tier two and tier one is the interesting one. Nothing in the middle gives you Discord, Twitch and gaming-literate sentiment together. GummySearch, the best-known cheap Reddit research tool, ran at $29–$199/month and its site now reads simply ["GummySearch is closed as of 11/30/2025"](https://gummysearch.com/pricing/) — a useful signal about how fragile the cheap end of this market is.

## Where the incumbents are strong

Be clear about this: the enterprise tier is not overpriced snake oil. It buys things a prototype cannot replicate.

**Licensed data, not scraped data.** Brandwatch is an [Official X Partner with access to the complete X firehose including all past public posts](https://www.brandwatch.com/datanetworks/x/), and offers [comprehensive coverage of all public (safe-for-work) subreddits in near-real-time, with Reddit history back to 2011](https://www.brandwatch.com/datanetworks/reddit/). It got there early: Brandwatch was [the first social intelligence provider to include Reddit data compliantly, in June 2017](https://www.prnewswire.com/news-releases/brandwatch-becomes-first-social-intelligence-provider-to-compliantly-offer-access-to-reddit-data-300470431.html). That is a contractual position no small tool can buy its way into.

**Historical archives.** Enterprise suites answer "how did sentiment move during the last expansion launch" going back years. A prototype starting today has no past.

**Multilingual coverage at scale.** Talkwalker — [acquired by Hootsuite in a deal announced on 8 April 2024](https://www.hootsuite.com/newsroom/press-releases/hootsuite-agrees-to-acquire-talkwalker) — covers [30+ social networks, 300+ review sites and over 150 million websites in 187 languages](https://www.talkwalker.com/products/data). Meltwater claims [over 400,000 traditional media sources, more than 200 million online publications, over 20,000 podcasts and more than 240 languages](https://www.meltwater.com/en/platform/global-content-coverage). For a business bridging Chinese and Western markets, that breadth matters.

**Alerting, workflow and compliance.** Crisis alerts, approval chains, audit trails, SSO, data-processing agreements — unglamorous, and exactly what a publisher's legal team asks about.

**Share-of-voice benchmarking.** Consistent methodology across competitors over time is worth paying for when you need to show a client they are gaining ground on a rival.

## Where they leave gaps for a gaming agency specifically

### Discord is close to invisible to the whole category

Game communities live on Discord, and almost no general-purpose listening tool covers it. Discord does not appear on [Brandwatch's data networks page](https://www.brandwatch.com/datanetworks/), which names 22 sources from TikTok and WeChat to Twitch and Reddit. It is absent from [Talkwalker's coverage page](https://www.talkwalker.com/products/data), from [Brand24's source list](https://brand24.com/pricing/) (which does include Reddit, YouTube, TikTok and Twitch) and from [Determ's](https://determ.com/pricing/). The exception we found is Pulsar, which lists [Discord and Twitch among 45+ source types](https://www.pulsarplatform.com/guides/what-is-pulsar-trac-features-pricing) — at enterprise pricing, with no published rate card.

The near-absence is not laziness. It is architectural:

- **Private by default.** Discord servers are invite-gated rooms, not a public timeline. There is no public index to crawl and no firehose to license.
- **Message content is a privileged intent.** Reading message text requires a bot with the `MESSAGE_CONTENT` privileged intent enabled, and Discord's docs state that [once an app has more than 10,000 unique users who can see it across all the servers it is in, it requires review for continued access to privileged intents](https://docs.discord.com/developers/events/gateway). A vendor cannot switch Discord on globally; every server needs an admin to invite their bot.
- **Discord's own analytics are thin.** Server Insights only unlocks at [500+ members and carries a multi-day data lag](https://blog.communityone.io/discord-growth-analytics/), goes back [120 days for non-Partner and non-Verified servers](https://support.discord.com/hc/en-us/articles/360032807371-Server-Insights-FAQ) — and shows only your own server.

The workarounds are all narrow. Statbot and CommunityOne give a server owner analytics on their own server. [Levellr](https://www.levellr.com/social-listening-for-discord/) is one of the few products applying AI sentiment analysis to Discord specifically for gaming, but it is Discord-only. [Gameplainer](https://gameplainer.com/) is the closest thing to this prototype's shape — it pulls reviews, forums, social and streaming from 15+ platforms into your Discord — but that is monitoring *delivered into* Discord, not monitoring *of* Discord. None of them give an agency a cross-server view of a title's community.

### Twitch and clip culture barely register

Twitch is where a live-service game's reputation is made in public, and the listening tools treat it as a text source. Brand24 and Talkwalker both list Twitch, but as mentions — not viewer concurrency by category, not which clips broke out, not which creator drove a spike. The tools that do this properly are single-platform and analyst-facing: SullyGnome, TwitchTracker and Streams Charts, which provides chat analytics for [approximately 200,000 Twitch channels since January 2022](https://streamscharts.com/news/streams-charts-expands-chat-analytics-include-kick-and-youtube-gaming). On YouTube, the equivalents are Social Blade and vidIQ — creator-growth tools, not listening tools. Nobody joins these signals to Reddit and Discord conversation for you.

### Generic sentiment models mis-score gaming language

"This boss is insane", "that clip is sick", "his aim is cracked", "the new gun is broken", "the endgame is grindy" — three of those are praise, one is a bug report and one is a complaint about pacing, and a general-purpose model will get at least two wrong. The problem is documented on both sides. Academically, [polysemy is one of the core obstacles for slang representation](https://arxiv.org/abs/2212.05613), and researchers building game sentiment tools have had to [construct a game-specific lexicon because general-purpose ones misread in-game vocabulary](https://aclanthology.org/2020.gamnlp-1.1.pdf). Commercially, Levellr makes the same point from inside the industry: gaming conversation is full of slang, memes and sarcasm, and in gamer usage ["sick" means excellent while a basic tool reads it as negative](https://www.levellr.com/advanced-sentiment-analysis-in-gaming/). Very few mid-market tools let a customer edit the lexicon at all.

### The pricing shape is wrong for per-title work

An agency wants to stand up listening for a new title for six weeks around a beta, then stop. The market sells annual contracts with keyword and mention caps. [Brand24's entry plan is 3 keywords and 2,000 mentions a month for $249](https://brand24.com/pricing/) — one busy Reddit thread. [Determ's entry plan is one topic and 1,000 mentions](https://determ.com/pricing/). Running six titles concurrently means the top tier or a custom quote, and a custom quote means a procurement cycle. Experimentation dies there.

### They report volume and sentiment, not "what should I do today"

Dashboards answer "how much" and "how positive". They rarely answer "which three things changed since yesterday and what do I do about them". That last translation is still a human's morning job — which is precisely the job an LLM is now good at.

### Reddit's 2023 API repricing closed the cheap route

In 2023 Reddit began charging for API access. Apollo's developer reported the rate as [$12,000 per 50 million requests](https://techcrunch.com/2023/06/08/popular-third-party-reddit-app-apollo-is-shutting-down-as-a-result-of-reddits-new-api-pricing/) — roughly $0.24 per 1,000 calls. Apollo, making 7 billion requests a month, calculated a bill of $1.7 million a month or $20 million a year, and shut down on 30 June 2023. The knock-on effect for listening is that Reddit access at scale is now a licensing relationship, which is why Brandwatch's near-real-time subreddit coverage is a selling point, and why cheap Reddit tools keep dying. The upside: [Reddit Pro is free and its Trends tool covers around 100,000 "smart" keywords and phrases](https://techcrunch.com/2025/01/07/reddit-intros-new-trends-tools-for-businesses-and-an-ama-ad-format/), showing conversation volume, the communities mentioning a term and a feed of the conversations. It is a legitimate zero-cost starting point.

## What a lightweight alternative should do differently

The prototype is not trying to beat Brandwatch. It is trying to be the thing you reach for on a Tuesday when Brandwatch is not in the budget for this title.

**Normalise engagement per platform.** A Twitch clip gets five figures of passive views; a Discord message gets three reactions. Summing them makes "total engagement" a proxy for which API you happened to call most. The prototype computes an Engagement Index of 0–100 per record — weighted native metrics, log-compressed so one viral post cannot dominate, then divided by that platform's own viral ceiling — and aggregates by *mean*, with raw volume reported separately.

**Score sentiment for gamers, then check the meaning.** Two layers. A gaming-tuned lexicon in which `insane`, `sick`, `cracked`, `goated`, `banger` and `clutch` are positive and `grindy`, `p2w`, `cash grab` and `content drought` are negative, with negation and intensifier handling and emoji scoring. Above it, an LLM pass that reads sarcasm, irony and mixed sentiment and assigns themes from a controlled vocabulary so themes aggregate across platforms. Scores are reported on the −100 to +100 scale RS asked for, every record carries a confidence, and the dashboard states which engine produced the score.

**Tag publisher region, honestly.** Records are classified into Americas / EMEA / APAC using, in priority order: the channel's declared country, the Discord server's locale, the content's published language, a region set in our own source config, and finally detected text language at low confidence. Anything unresolved shows as "Undetermined" rather than being defaulted. This is publication region, not user geolocation; individuals are never located.

**Write a briefing, not a chart wall.** The output a marketer should read first is a few hundred words: what moved, which themes drove it, which questions keep recurring, what looks like a brewing risk. Charts sit underneath as evidence.

**Ask permission for Discord rather than scraping it.** A bot invited by the server owner into named channels, with message content intent enabled — the only compliant route, and it means Discord coverage grows one relationship at a time. That is a genuine limit, not a bug.

**Run at near-zero cost.** [`commentThreads.list` costs 1 quota unit and projects get 10,000 units a day](https://developers.google.com/youtube/v3/determine_quota_cost) across all endpoints other than `search.list` and `videos.insert`, which are capped at 100 calls each — which is why the collector avoids `search.list` entirely and works from configured channel IDs. Twitch's Helix API has no usage fee and is [rate-limited by a token bucket, most endpoints costing 1 point per call](https://dev.twitch.tv/docs/api/guide/); Discord's API is free. The only real running cost is LLM scoring.

## Honest comparison

| Capability | Enterprise suite | Mid-market | Gaming Community Pulse |
|---|---|---|---|
| Reddit coverage | **All public subreddits, near real time, history to 2011** | Sampled, limited by mention cap | Free-tier API, targeted subreddits, small samples |
| Discord coverage | None, except Pulsar | None | Permissioned bot, only in servers that invite it |
| YouTube coverage | **Yes, at scale** | Yes | Yes, within free daily quota |
| Twitch coverage | Text mentions only | Text mentions only | Category viewership + top clips |
| Gaming-tuned sentiment | Generic, sometimes customisable | Generic, rarely customisable | Purpose-built lexicon + LLM semantic layer |
| Daily narrative briefing | Increasingly, via AI add-ons | Rare | Yes, primary output |
| Region tagging | **Rich, licensed geo data** | Basic | Publisher-region only, confidence-scored |
| Cost | Tens of thousands a year | ~$100–$700/mo | Near zero + LLM usage |
| Historical archive | **Years** | **Months** | **None — starts from first run** |
| Alerting | **Mature: crisis alerts, thresholds, routing** | **Email/Slack alerts** | **None yet** |
| Multilingual | **187–240+ languages** | **Several** | **English-first; non-English scored at lower confidence** |
| Sample sizes | **Millions of mentions** | **Thousands** | **Hundreds — directional, not statistical** |
| Support and SLA | **Named CSM, contractual SLA** | **Ticketed support** | **None — a prototype, not a product** |
| Compliance / SSO / DPA | **Yes** | **Partial** | **No** |

The bolded rows are the ones the prototype loses, and there are more of them than there are wins. It has no memory of the past, cannot wake anyone at 3am, will read a Simplified Chinese comment less reliably than an English one, has no support arrangement, and works with sample sizes that support direction-of-travel judgements and nothing more. Where it wins is coverage of the two platforms the category ignores, language it actually understands, and a cost that makes it worth pointing at a title before anyone has approved a budget.

## Sources

1. [Vendr — Brandwatch pricing (aggregated contract data)](https://www.vendr.com/marketplace/brandwatch)
2. [Vendr — Meltwater pricing (aggregated contract data)](https://www.vendr.com/marketplace/meltwater)
3. [Brand24 — pricing and monitored sources](https://brand24.com/pricing/)
4. [Determ — pricing](https://determ.com/pricing/)
5. [Sprout Social — pricing](https://sproutsocial.com/pricing/)
6. [Hootsuite — plans and pricing](https://www.hootsuite.com/plans)
7. [Chatarmin — Sprinklr pricing and self-serve retirement](https://chatarmin.com/en/blog/sprinklr-pricing)
8. [Pulsar — TRAC features, sources and pricing guide](https://www.pulsarplatform.com/guides/what-is-pulsar-trac-features-pricing)
9. [GummySearch — pricing page and closure notice](https://gummysearch.com/pricing/)
10. [Brandwatch — X (Twitter) data network](https://www.brandwatch.com/datanetworks/x/)
11. [Brandwatch — Reddit data network](https://www.brandwatch.com/datanetworks/reddit/)
12. [Brandwatch — full data networks list](https://www.brandwatch.com/datanetworks/)
13. [PR Newswire — Brandwatch first to compliantly offer Reddit data (June 2017)](https://www.prnewswire.com/news-releases/brandwatch-becomes-first-social-intelligence-provider-to-compliantly-offer-access-to-reddit-data-300470431.html)
14. [Hootsuite — press release announcing the Talkwalker acquisition, 8 April 2024](https://www.hootsuite.com/newsroom/press-releases/hootsuite-agrees-to-acquire-talkwalker)
15. [Talkwalker — data coverage](https://www.talkwalker.com/products/data)
16. [Meltwater — global content coverage](https://www.meltwater.com/en/platform/global-content-coverage)
17. [Discord Developer Docs — Gateway and privileged intents](https://docs.discord.com/developers/events/gateway)
18. [Discord Support — Server Insights FAQ](https://support.discord.com/hc/en-us/articles/360032807371-Server-Insights-FAQ)
19. [CommunityOne — Discord server analytics and Server Insights limits](https://blog.communityone.io/discord-growth-analytics/)
20. [Levellr — social listening for Discord](https://www.levellr.com/social-listening-for-discord/)
21. [Levellr — advanced sentiment analysis in gaming](https://www.levellr.com/advanced-sentiment-analysis-in-gaming/)
22. [Gameplainer — multi-platform player feedback monitoring](https://gameplainer.com/)
23. [SullyGnome — free Twitch statistics](https://sullygnome.com/)
24. [Streams Charts — chat analytics coverage across Twitch, Kick and YouTube Gaming](https://streamscharts.com/news/streams-charts-expands-chat-analytics-include-kick-and-youtube-gaming)
25. [arXiv — A Study of Slang Representation Methods](https://arxiv.org/abs/2212.05613)
26. [ACL Anthology (GAMNLP 2020) — Creating a Sentiment Lexicon with Game-Specific Words](https://aclanthology.org/2020.gamnlp-1.1.pdf)
27. [TechCrunch — Apollo shuts down over Reddit API pricing](https://techcrunch.com/2023/06/08/popular-third-party-reddit-app-apollo-is-shutting-down-as-a-result-of-reddits-new-api-pricing/)
28. [TechCrunch — Reddit Pro Trends launch](https://techcrunch.com/2025/01/07/reddit-intros-new-trends-tools-for-businesses-and-an-ama-ad-format/)
29. [Google — YouTube Data API quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
30. [Twitch Developers — API concepts and rate limits](https://dev.twitch.tv/docs/api/guide/)

**A note on what could not be verified.** Brandwatch, Sprinklr, Talkwalker, Meltwater, Pulsar and StatSocial publish no rate cards; the Vendr figures are aggregated third-party contract data, indicative rather than quotes. Sprout Social and Hootsuite do not publish the price of their listening tiers. Statbot's, CommunityOne's, Streams Charts' and Gameplainer's paid prices could not be retrieved (their pricing pages block automated requests), so no figures are given for them. Twitch's documentation shows a rate-limit example of 800 points per minute but does not state it as a guaranteed default, so no figure is quoted above. Discord's Server Insights FAQ also blocks automated fetching; its 120-day retention figure is taken from that page's published text as indexed, while the 500-member threshold and multi-day lag are corroborated by CommunityOne. Vendor claims about their own coverage — Talkwalker's 187 languages, Meltwater's source counts, Pulsar's Discord support — are marketing figures, not independently audited.
