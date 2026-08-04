#!/usr/bin/env python3
"""
Generates a clearly-labeled SYNTHETIC Reddit + Discord dataset for 5 games,
to sit alongside the REAL YouTube data collected via browser capture.

Synthetic data is built from realistic, publicly-known discourse patterns for
each game (patch cycles, launches, monetization debates, balance complaints,
nostalgia, etc.) rather than pulled from any live feed. This is necessary
because Reddit is blocked for automated fetching in this environment, and
Discord requires server-specific access this prototype does not have.

Output: outputs/data/processed/synthetic_reddit_discord.csv
"""
import csv
import random
import datetime as dt

random.seed(42)

TODAY = dt.date(2026, 7, 30)
WINDOW_WEEKS = 8
START_DATE = TODAY - dt.timedelta(weeks=WINDOW_WEEKS)

GAMES = ["PUBG", "Once Human", "Marvel Rivals", "Where Winds Meet", "World of Warcraft"]

SUBREDDITS = {
    "PUBG": "r/PUBATTLEGROUNDS",
    "Once Human": "r/OnceHumanGame",
    "Marvel Rivals": "r/marvelrivals",
    "Where Winds Meet": "r/WhereWindsMeet",
    "World of Warcraft": "r/wow",
}

DISCORD_SERVERS = {
    "PUBG": "PUBG Official (unofficial fan)",
    "Once Human": "Once Human Community",
    "Marvel Rivals": "Marvel Rivals Community",
    "Where Winds Meet": "Where Winds Meet Community",
    "World of Warcraft": "WoW Community Hub",
}

# spike week offsets (weeks before today) tied to a plausible real event per game
SPIKE_WEEKS = {
    "PUBG": 2,          # Spider-Man mobile crossover / new content cadence
    "Once Human": 1,    # console launch date announcement
    "Marvel Rivals": 3, # Jubilee / Season reveal
    "Where Winds Meet": 5,
    "World of Warcraft": 4,  # Midnight PvP season discourse
}

THEMES = {
    "PUBG": [
        ("bug/cheating complaints", -1, [
            "Ran into another obvious wallhacker in ranked, report system does nothing",
            "Anti-cheat needs a total overhaul, ESP hackers every other match on Erangel",
            "Hit reg has been awful since the last patch, dying behind walls",
        ]),
        ("crossover hype", 1, [
            "The Spider-Man crossover skins actually look really good this time",
            "Didn't expect to enjoy a superhero collab in PUBG but here we are",
            "New collab event has decent rewards for once, actually worth the grind",
        ]),
        ("matchmaking/queue", -1, [
            "Queue times on Miramar are getting rough during off-peak hours",
            "Matchmaking keeps putting solo players against premade squads, feels unfair",
        ]),
        ("mode feedback", 0, [
            "Xeno Point mode is a fun change of pace but wears thin after a few rounds",
            "New game mode is fine, wish it had its own separate ranked ladder",
        ]),
        ("nostalgia", 1, [
            "Still can't believe this game holds up in 2026, the OG BR experience",
            "Coming back after 2 years, the gunplay still feels the best in the genre",
        ]),
        ("monetization", -1, [
            "Crate prices keep creeping up, this used to be a lot more generous",
            "Battle pass grind takes way too long unless you buy XP boosts",
        ]),
    ],
    "Once Human": [
        ("console launch anticipation", 1, [
            "Finally, console launch is confirmed, been waiting since the PC release",
            "So hyped for Aug 25, controller support better be tight though",
            "Two years of waiting and it's finally coming to PS5, worth it",
        ]),
        ("monetization/gacha", -1, [
            "The gacha weapon system is getting predatory, pulls are brutal value",
            "Cash shop prices for cosmetics are honestly kind of insane for a survival game",
        ]),
        ("server/season fatigue", -1, [
            "Server wipes every season are rough if you don't no-life the game",
            "Losing my base every reset season is exhausting, wish there was a permanent server",
        ]),
        ("build/base building praise", 1, [
            "Base building in this game is genuinely some of the best in the genre",
            "Spent 6 hours just decorating my base, this system is so addictive",
        ]),
        ("new content questions", 0, [
            "Anyone know if the console version gets the same seasonal content day one?",
            "Is the mobile version worth it or does it feel like a downgrade from PC?",
        ]),
        ("bugs", -1, [
            "Getting disconnected mid-boss fight twice this week, lost all my loot",
            "Deviant pathing is still broken in the new map area",
        ]),
    ],
    "Marvel Rivals": [
        ("balance patch reaction", -1, [
            "This balance patch absolutely gutted my main, unplayable now",
            "Whoever buffed that duelist needs to actually play the game before shipping changes",
        ]),
        ("new character hype", 1, [
            "Jubilee's kit looks so much fun, finally a mobility duelist done right",
            "Season 9 roster additions are genuinely creative, love the character design work",
        ]),
        ("netcode/matchmaking", -1, [
            "Rubberbanding has gotten worse since the update, unplayable in ranked",
            "Matchmaking keeps stacking smurfs against new accounts, terrible experience",
        ]),
        ("comic/crossover speculation", 0, [
            "Calling it now, Ghost Rider gets announced next season",
            "Would love to see an X-Men themed map added with the new roster additions",
        ]),
        ("ranked complaints", -1, [
            "Rank reset this season feels way too punishing compared to last one",
            "One-trick counter picks are ruining competitive integrity right now",
        ]),
        ("praise", 1, [
            "Best hero shooter to come out in years, the character variety is unmatched",
            "Movement tech in this game keeps it feeling fresh months after launch",
        ]),
    ],
    "Where Winds Meet": [
        ("open world praise", 1, [
            "The open world design is stunning, best wuxia setting I've played in years",
            "Combat feels like a genuine mix of Sekiro and Wukong, really well done",
        ]),
        ("monetization concerns", -1, [
            "Cosmetic gacha rates are pretty rough for a supposedly free game",
            "Battle pass FOMO is real, missed two weeks and feel behind already",
        ]),
        ("server queue/launch issues", -1, [
            "Queue times at peak hours are still 20+ minutes on my server",
            "Login server crashed twice this week during the event",
        ]),
        ("comparisons", 0, [
            "How does this compare to Wukong difficulty-wise for anyone who's played both?",
            "Is the story worth following closely or mostly just an excuse for combat?",
        ]),
        ("community questions", 0, [
            "Anyone know the best early build for a sword-focused playstyle?",
            "What's the fastest way to level reputation with the current faction event?",
        ]),
        ("praise", 1, [
            "Genuinely surprised by how much content is here for a free-to-play title",
            "The activities outside combat (cooking, fishing, sightseeing) add so much charm",
        ]),
    ],
    "World of Warcraft": [
        ("expansion skepticism", -1, [
            "Midnight trailer didn't hype me at all, feels like more of the same systems",
            "Not sure I'm resubbing this time, the content drought before this expansion was rough",
        ]),
        ("nostalgia/nostalgia fatigue", 0, [
            "Twenty years in and the game still scratches the itch for me somehow",
            "Classic servers still feel better designed than half of retail honestly",
        ]),
        ("class balance", -1, [
            "This class balance pass ruined my spec, no survivability in M+ anymore",
            "Tank changes this patch have made tanking in high keys miserable",
        ]),
        ("subscription/monetization", -1, [
            "Subscription plus a cash shop plus expansion price feels like a lot to ask",
            "Token prices are getting out of hand, gold farming barely keeps up",
        ]),
        ("questline/story praise", 1, [
            "The new questline actually had some of the best writing in years",
            "Story pacing in this patch was surprisingly tight, more of this please",
        ]),
        ("pvp season", 0, [
            "New PvP season balance feels rough for melee specs right now",
            "Anyone else grinding the new PvP season rewards this week?",
        ]),
    ],
}

FIRST_PARTS = ["Alex", "Jordan", "Sam", "Casey", "Morgan", "Riley", "Taylor", "Drew", "Avery", "Quinn",
               "Skyler", "Reese", "Blair", "Hayden", "Rowan", "Ellis", "Finley", "Sage", "Emerson", "Kai"]
SUFFIXES = ["_gg", "99", "TTV", "_plays", "xo", "_yt", "22", "_dev", "_lol", "88", "_vibes", "_x", "07", "_og"]

def rand_username():
    return random.choice(FIRST_PARTS) + random.choice(SUFFIXES)

def rand_datetime_in_window(bias_week=None):
    """Return a datetime within the 8-week window; if bias_week given, cluster nearby for spike weeks."""
    if bias_week is not None and random.random() < 0.55:
        center = TODAY - dt.timedelta(weeks=bias_week)
        offset = random.randint(-2, 2)
        d = center + dt.timedelta(days=offset)
    else:
        offset_days = random.randint(0, WINDOW_WEEKS * 7)
        d = START_DATE + dt.timedelta(days=offset_days)
    d = min(d, TODAY)
    t = dt.time(random.randint(0, 23), random.randint(0, 59))
    return dt.datetime.combine(d, t)

rows = []
row_id = 1

for game in GAMES:
    themes = THEMES[game]
    spike_week = SPIKE_WEEKS[game]

    # ---- Reddit synthetic posts ----
    n_posts = random.randint(22, 28)
    for i in range(n_posts):
        theme_name, polarity, texts = random.choice(themes)
        text = random.choice(texts)
        bias = spike_week if random.random() < 0.35 else None
        ts = rand_datetime_in_window(bias)
        base_score = {1: (40, 900), 0: (5, 200), -1: (10, 500)}[polarity]
        score = random.randint(*base_score)
        num_comments = max(1, int(score * random.uniform(0.05, 0.35)))
        rows.append({
            "row_id": row_id, "platform": "Reddit", "data_type": "synthetic",
            "game": game, "source": SUBREDDITS[game], "content_type": "post",
            "author": "u/" + rand_username(), "timestamp": ts.isoformat(),
            "text": text, "theme": theme_name, "polarity_seed": polarity,
            "score": score, "num_comments": num_comments, "url": "",
        })
        row_id += 1

    # ---- Reddit synthetic top comments (nested under generic post context) ----
    n_comments = random.randint(30, 40)
    for i in range(n_comments):
        theme_name, polarity, texts = random.choice(themes)
        text = random.choice(texts)
        bias = spike_week if random.random() < 0.35 else None
        ts = rand_datetime_in_window(bias)
        base_score = {1: (5, 150), 0: (1, 40), -1: (2, 90)}[polarity]
        score = random.randint(*base_score)
        rows.append({
            "row_id": row_id, "platform": "Reddit", "data_type": "synthetic",
            "game": game, "source": SUBREDDITS[game], "content_type": "comment",
            "author": "u/" + rand_username(), "timestamp": ts.isoformat(),
            "text": text, "theme": theme_name, "polarity_seed": polarity,
            "score": score, "num_comments": 0, "url": "",
        })
        row_id += 1

    # ---- Discord synthetic messages ----
    n_discord = random.randint(28, 36)
    for i in range(n_discord):
        theme_name, polarity, texts = random.choice(themes)
        text = random.choice(texts)
        bias = spike_week if random.random() < 0.35 else None
        ts = rand_datetime_in_window(bias)
        reactions = random.randint(0, 25) if polarity != 0 else random.randint(0, 8)
        rows.append({
            "row_id": row_id, "platform": "Discord", "data_type": "synthetic",
            "game": game, "source": DISCORD_SERVERS[game], "content_type": "message",
            "author": rand_username(), "timestamp": ts.isoformat(),
            "text": text, "theme": theme_name, "polarity_seed": polarity,
            "score": reactions, "num_comments": 0, "url": "",
        })
        row_id += 1

fieldnames = ["row_id", "platform", "data_type", "game", "source", "content_type",
              "author", "timestamp", "text", "theme", "polarity_seed", "score", "num_comments", "url"]

import os
os.makedirs("data/processed", exist_ok=True)
with open("data/processed/synthetic_reddit_discord.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Generated {len(rows)} synthetic Reddit + Discord rows across {len(GAMES)} games.")
