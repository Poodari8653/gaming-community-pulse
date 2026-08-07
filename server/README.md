# Gaming Community Pulse — Live Server

A small local server that fetches **live** YouTube comments and stats via the
YouTube Data API, merges them with the static illustrative Reddit/Discord
sample, and serves an interactive dashboard at `http://localhost:3000`.

## 1. Run it

```bash
cd server
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

Your YouTube API key is already saved in `server/.env` (`YOUTUBE_API_KEY=...`).
If you ever need to change it, edit that file directly — it's never sent
anywhere except to Google's API, and it's git-ignored by default.

## 2. What's live vs. static right now

| Platform | Status |
|---|---|
| YouTube | **Live** — for each game, the server pulls the channel's most recent uploads (not just one fixed video) and their comments, with real publish/comment dates, fetched fresh on every page load and cached 5 minutes server-side to conserve quota. Click "Refresh live data" to force an immediate re-fetch. |
| Reddit | Static illustrative sample (see `report/GAMING_COMMUNITY_PULSE_REPORT.md`, Methodology section). Requires official Reddit API credentials to go live — not configured yet. |
| Discord | Static illustrative sample. Requires a Discord bot invited to a specific server — see below to set that up when you're ready. |

## 3. Which channels are tracked

Edit `server/config/channels.json` to change which YouTube channel is tracked
per game (the server automatically pulls that channel's most recent uploads —
`VIDEOS_PER_CHANNEL` in `server.js`, currently 8):

```json
[
  { "game": "PUBG", "handle": "PUBG" },
  { "game": "Once Human", "handle": "oncehuman_official" },
  { "game": "Marvel Rivals", "handle": "marvelrivalsofficial" },
  { "game": "Where Winds Meet", "handle": "WhereWindsMeet" },
  { "game": "World of Warcraft", "handle": "WorldofWarcraft" }
]
```

`handle` is the part after the `@` in a channel's YouTube URL (e.g.
`youtube.com/@PUBG` → `"PUBG"`). Restart the server after editing this file.
Because real videos now span real weeks, the dashboard's **weekly discussion
volume** chart has a drag-to-select range slider under it — narrowing the
window filters every panel (sentiment, themes, top posts, questions, the raw
data table, and the "Videos in this window" list) to just that period, and
widening it shows more history. Comments are fetched ordered by time (not
"top comments"), so the spread of dates is genuine.

## 4. API quota

The default YouTube Data API quota is 10,000 units/day. Per game, one refresh
costs roughly: 1 unit (resolve channel) + 1 unit (list recent uploads) + 1 unit
(batch video stats) + up to 16 units (**two** commentThreads calls per tracked
video — one ordered by time, one by relevance, merged and deduplicated so both
real weekly spread *and* the truly most-liked/viral comments are captured) ≈
19 units. Across all 5 games that's ~95 units per full refresh — even
refreshing every few minutes all day stays well under quota. The 5-minute
server-side cache means normal page reloads don't cost anything extra.
`search.list` (100 units/call) is deliberately avoided — recent uploads come
from the channel's free "uploads" playlist instead.

## 5. Top / most-viral comments

The "Top posts & comments" panel is sorted by like count, so it always
surfaces the most-liked / most-viral comments in whatever time window and
game you've selected. To make sure genuinely viral comments aren't missed
just because they're old, each video is queried twice — once for the most
recent comments (`order=time`, feeds the weekly volume chart) and once for
YouTube's own top-comments ranking (`order=relevance`) — and the two lists
are merged and deduplicated by comment ID before sentiment scoring and
display. The single highest-liked comment in view is flagged with a
"🔥 Most viral" badge.

## 6. Discord (live)

Discord is wired up via `lib/discord.js`, configured in `server/config/discord_channels.json`:

```json
[
  { "game": "Community Test Channel", "channelId": "1529473615987347569" }
]
```

`DISCORD_BOT_TOKEN` is already set in `server/.env`. On each refresh, the
server pulls the most recent 100 messages from every configured channel
(real timestamps, reactions used as the engagement score since Discord has
no "like" button) and merges them into the dataset — replacing the
illustrative synthetic Discord sample for that specific game bucket only
(other games keep their synthetic Discord sample until you add a real
channel for them too).

**If Discord data doesn't show up:**
- Confirm the bot is a member of the server that channel belongs to (a bot
  token alone isn't enough — it has to actually be invited via an OAuth2
  invite link with `bot` scope and **View Channels** + **Read Message
  History** permissions).
- Confirm **Message Content Intent** is enabled for the bot in the
  [Discord Developer Portal](https://discord.com/developers/applications) →
  your app → Bot → Privileged Gateway Intents. Without this, message text
  comes back empty even though the API call succeeds.
- Check the red error banner on the dashboard, or the server's terminal
  output — Discord errors are reported the same way YouTube ones are
  (`fetch_errors` in the API response).

To track more channels (for the 5 real games, or additional servers), add
more entries to `discord_channels.json` — no code changes needed. Since the
token you shared was pasted in chat, consider regenerating it in the
Developer Portal (Bot → Reset Token) and updating `.env` once you're done
testing, just as good hygiene.

## 7. Twitch (live)

Twitch is wired up via `lib/twitch.js`, configured in `server/config/twitch_games.json`.
Unlike YouTube/Discord, this doesn't track one channel per game — most PUBG/WoW/
etc. streaming happens on individual creators' channels, not a publisher's own
Twitch presence. So instead it listens at the **category (game) level** across
Twitch's whole directory for each title:

```json
[
  { "game": "PUBG", "twitchCategory": "PUBG: BATTLEGROUNDS" },
  { "game": "Once Human", "twitchCategory": "Once Human" },
  { "game": "Marvel Rivals", "twitchCategory": "Marvel Rivals" },
  { "game": "Where Winds Meet", "twitchCategory": "Where Winds Meet" },
  { "game": "World of Warcraft", "twitchCategory": "World of Warcraft" }
]
```

`twitchCategory` must match Twitch's exact category display name (visible in
the URL slug at `twitch.tv/directory/category/<slug>` — e.g. `pubg-battlegrounds`
→ display name `"PUBG: BATTLEGROUNDS"`).

`TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are already set in `server/.env`,
from a Twitch app registered at the
[developer console](https://dev.twitch.tv/console). On each refresh, the
server:

- Gets an app access token via the Client Credentials flow (no per-user Twitch
  login needed — cached in memory and refreshed automatically before it
  expires, roughly every 60 days).
- Pulls the **top clips** per category from the last 30 days (`TWITCH_CLIPS_WINDOW_DAYS`
  in `server.js`) — clips are community-made highlights with a real title,
  creator, view count, and creation date, which is the closest Twitch
  equivalent to a "post" for this dataset. These feed into sentiment scoring,
  weekly volume, top posts, etc. exactly like YouTube comments or Discord
  messages do.
- Pulls a **live snapshot** per category (how many channels are streaming that
  game right now, total concurrent viewers, the top live stream) — shown in
  the "Twitch — live right now" panel. This isn't historical text data, so it
  isn't filtered by the time-range slider and isn't scored for sentiment.

**If Twitch data doesn't show up:**
- Confirm `twitchCategory` in `twitch_games.json` matches Twitch's category
  name exactly (case and punctuation matter — `resolveGameId` will fail with
  "Could not resolve Twitch category" if it doesn't).
- Check the red error banner or `fetch_errors` in the API response — auth
  failures (bad Client ID/Secret) show up there as `"Twitch auth failed: ..."`.
- Since the Client ID and Secret were shared in chat, consider regenerating
  the secret in the [developer console](https://dev.twitch.tv/console) (open
  the app → **New Secret**) and updating `.env`, once you're done testing.

To track more games, add more entries to `twitch_games.json` — no code
changes needed.

## 8. Troubleshooting

- **"YOUTUBE_API_KEY is not set"** — check `server/.env` has the key on its own line with no quotes.
- **Fetch errors for a specific game** — shown in the red banner on the dashboard; usually means comments are disabled on that video, or the video ID is wrong/removed.
- **403 / quota errors** — you've hit the daily YouTube API quota; it resets at midnight Pacific time, or you can request a quota increase in Google Cloud Console.
- **Port already in use** — change `PORT=3000` in `server/.env` to a free port.
- **"Could not resolve Twitch category"** — the `twitchCategory` value in `twitch_games.json` doesn't match Twitch's exact category name; check the directory page for that game on twitch.tv.
