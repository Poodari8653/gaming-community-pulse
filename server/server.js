const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const { resolveUploadsPlaylistId, fetchRecentVideos, fetchCommentsMerged } = require("./lib/youtube");
const { fetchChannelInfo, fetchChannelMessages } = require("./lib/discord");
const { getAppAccessToken, resolveGameId, fetchTopClips, fetchLiveStreams } = require("./lib/twitch");
const { loadSyntheticRows } = require("./lib/dataset");
const { scoreSentiment, sentimentLabel } = require("./lib/sentiment");
const channelConfig = require("./config/channels.json");
const discordChannelConfig = require("./config/discord_channels.json");
const twitchGameConfig = require("./config/twitch_games.json");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const YT_GAMES = channelConfig.map((v) => v.game);
const DISCORD_GAMES = discordChannelConfig.map((v) => v.game);
const TWITCH_GAMES = twitchGameConfig.map((v) => v.game);
// Union — a channel can introduce a "game" bucket (e.g. a test channel) that
// isn't one of the 5 YouTube-tracked titles, and it'll still get its own
// filter chip and full set of charts on the dashboard.
const GAMES = Array.from(new Set([...YT_GAMES, ...DISCORD_GAMES, ...TWITCH_GAMES]));
const LIVE_DISCORD_GAMES = new Set(DISCORD_GAMES);

const VIDEOS_PER_CHANNEL = 8; // recent uploads pulled per game
// Two commentThreads calls per video (order=time + order=relevance), merged and
// deduplicated — "time" spreads comments across real weeks for the volume chart,
// "relevance" is YouTube's own top-comments ranking so the most-liked/viral
// comments are captured even if they're not among the most recent ones.
const COMMENTS_PER_VIDEO_PER_ORDER = 25;
const DISCORD_MESSAGES_PER_CHANNEL = 100; // max allowed per call by Discord's API
const TWITCH_CLIPS_PER_GAME = 20; // top clips over the trailing window, per category
const TWITCH_CLIPS_WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — keeps API usage low on repeated page loads
let cache = { data: null, fetchedAt: 0 };

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard-live.html"));
});

// ---------------------------------------------------------------------------
// Live YouTube fetch — pulls each game's channel, its recent uploads, and
// comments on each of those uploads, so both video-publish dates and comment
// dates are genuine and spread across real weeks (not a single fetch-day snapshot).
// ---------------------------------------------------------------------------
async function fetchLiveYouTubeData() {
  const rows = [];
  const videos = [];
  const errors = [];

  await Promise.all(
    channelConfig.map(async ({ game, handle }) => {
      try {
        const playlistId = await resolveUploadsPlaylistId(handle, API_KEY);
        const recentVideos = await fetchRecentVideos(playlistId, API_KEY, VIDEOS_PER_CHANNEL);

        if (!recentVideos.length) {
          errors.push({ game, handle, message: "No videos returned for this channel" });
          return;
        }

        await Promise.all(
          recentVideos.map(async (v) => {
            videos.push({
              game,
              videoId: v.videoId,
              title: v.title,
              publishedAt: v.publishedAt,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
              url: `https://www.youtube.com/watch?v=${v.videoId}`,
            });

            const comments = await fetchCommentsMerged(v.videoId, API_KEY, COMMENTS_PER_VIDEO_PER_ORDER);
            for (const c of comments) {
              const s = scoreSentiment(c.text);
              rows.push({
                platform: "YouTube",
                data_type: "real",
                game,
                source: v.title,
                content_type: "comment",
                author: c.author,
                timestamp: c.publishedAt, // real comment date from the API
                text: c.text,
                theme: "",
                score: c.likeCount,
                num_comments: c.replyCount,
                url: `https://www.youtube.com/watch?v=${v.videoId}`,
                sentiment_score: Math.round(s * 1000) / 1000,
                sentiment_label: sentimentLabel(s),
              });
            }
          })
        );
      } catch (err) {
        errors.push({ game, handle, message: err.message });
      }
    })
  );

  return { rows, videos, errors };
}

// ---------------------------------------------------------------------------
// Live Discord fetch — pulls the most recent messages from each configured
// channel. Requires the bot to already be a member of that channel's server
// with View Channels + Read Message History, and Message Content Intent
// enabled in the Developer Portal (otherwise message text comes back blank).
// ---------------------------------------------------------------------------
async function fetchLiveDiscordData() {
  const rows = [];
  const errors = [];

  if (!DISCORD_TOKEN) {
    return { rows, errors }; // Discord simply isn't configured yet — not a hard error
  }

  await Promise.all(
    discordChannelConfig.map(async ({ game, channelId }) => {
      try {
        const info = await fetchChannelInfo(channelId, DISCORD_TOKEN);
        const messages = await fetchChannelMessages(channelId, DISCORD_TOKEN, DISCORD_MESSAGES_PER_CHANNEL);
        for (const m of messages) {
          const s = scoreSentiment(m.text);
          rows.push({
            platform: "Discord",
            data_type: "real",
            game,
            source: `#${info.name}`,
            content_type: "message",
            author: m.author,
            timestamp: m.timestamp, // real message timestamp from the API
            text: m.text,
            theme: "",
            score: m.score, // sum of reaction counts — Discord's closest equivalent to "likes"
            num_comments: 0,
            url: info.guildId ? `https://discord.com/channels/${info.guildId}/${channelId}/${m.messageId}` : "",
            sentiment_score: Math.round(s * 1000) / 1000,
            sentiment_label: sentimentLabel(s),
          });
        }
      } catch (err) {
        errors.push({ game, channelId, message: err.message });
      }
    })
  );

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Live Twitch fetch — pulls, per game category, the top clips from the last
// TWITCH_CLIPS_WINDOW_DAYS days (community-made highlights: title, creator,
// view count, real created_at date) plus a live-viewers snapshot. Clips are
// the record-shaped data (fed into sentiment/weekly volume like every other
// platform); live streams are a lightweight supplementary "buzz right now"
// figure returned separately, not scored as text records.
// ---------------------------------------------------------------------------
async function fetchLiveTwitchData() {
  const rows = [];
  const liveSnapshot = [];
  const errors = [];

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return { rows, liveSnapshot, errors }; // not configured yet — not a hard error
  }

  try {
    const token = await getAppAccessToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);

    await Promise.all(
      twitchGameConfig.map(async ({ game, twitchCategory }) => {
        try {
          const gameId = await resolveGameId(twitchCategory, TWITCH_CLIENT_ID, token);

          const [clips, streams] = await Promise.all([
            fetchTopClips(gameId, TWITCH_CLIENT_ID, token, {
              days: TWITCH_CLIPS_WINDOW_DAYS,
              maxResults: TWITCH_CLIPS_PER_GAME,
            }),
            fetchLiveStreams(gameId, TWITCH_CLIENT_ID, token, 20),
          ]);

          for (const c of clips) {
            const s = scoreSentiment(c.title);
            rows.push({
              platform: "Twitch",
              data_type: "real",
              game,
              source: c.broadcasterName,
              content_type: "clip",
              author: c.creatorName,
              timestamp: c.createdAt, // real clip-creation date from the API
              text: c.title,
              theme: "",
              score: c.viewCount,
              num_comments: 0,
              url: c.url,
              sentiment_score: Math.round(s * 1000) / 1000,
              sentiment_label: sentimentLabel(s),
            });
          }

          liveSnapshot.push({
            game,
            liveChannelCount: streams.length,
            totalLiveViewers: streams.reduce((a, s) => a + s.viewerCount, 0),
            topStream: streams[0]
              ? { userName: streams[0].userName, title: streams[0].title, viewerCount: streams[0].viewerCount, url: streams[0].url }
              : null,
          });
        } catch (err) {
          errors.push({ game, twitchCategory, message: err.message });
        }
      })
    );
  } catch (err) {
    errors.push({ game: null, message: `Twitch auth failed: ${err.message}` });
  }

  return { rows, liveSnapshot, errors };
}

// ---------------------------------------------------------------------------
// Aggregation — mirrors scripts/build_dataset_and_analysis.py's output shape
// so the dashboard's chart/render code doesn't need to change, extended with
// a `videos` list so the UI can filter "which videos fall in this window".
// ---------------------------------------------------------------------------
function isoWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function buildAnalysis(allRows) {
  const byGame = {};
  const bySentimentDist = {};
  const weeklyVolume = {};
  const topThemes = {};
  const topPosts = {};
  const recurringQuestions = {};
  const platformRollup = {};

  for (const game of GAMES) {
    const rows = allRows.filter((r) => r.game === game);
    const n = rows.length;
    const avgSent = n ? rows.reduce((a, r) => a + r.sentiment_score, 0) / n : 0;
    const totalEngagement = rows.reduce((a, r) => a + r.score, 0);
    const platforms = {};
    for (const r of rows) platforms[r.platform] = (platforms[r.platform] || 0) + 1;

    byGame[game] = {
      record_count: n,
      avg_sentiment: Math.round(avgSent * 1000) / 1000,
      total_engagement_score: totalEngagement,
      platforms,
    };

    const dist = { positive: 0, neutral: 0, negative: 0 };
    for (const r of rows) dist[r.sentiment_label] += 1;
    bySentimentDist[game] = dist;

    // weekly volume — now includes BOTH the static synthetic sample AND live
    // YouTube comments, bucketed by each row's real timestamp, so the chart
    // reflects genuine spread across the chosen window rather than a single day.
    const weekly = {};
    for (const r of rows) {
      const wk = isoWeekStart(r.timestamp);
      if (!weekly[wk]) weekly[wk] = { count: 0, sentSum: 0 };
      weekly[wk].count += 1;
      weekly[wk].sentSum += r.sentiment_score;
    }
    const weeks = Object.keys(weekly).sort();
    weeklyVolume[game] = weeks.map((wk) => ({
      week: wk,
      count: weekly[wk].count,
      avg_sentiment: Math.round((weekly[wk].sentSum / weekly[wk].count) * 1000) / 1000,
    }));

    // themes — synthetic rows only (they carry a theme tag)
    const themeAgg = {};
    for (const r of rows) {
      if (!r.theme) continue;
      if (!themeAgg[r.theme]) themeAgg[r.theme] = { count: 0, sentSum: 0 };
      themeAgg[r.theme].count += 1;
      themeAgg[r.theme].sentSum += r.sentiment_score;
    }
    topThemes[game] = Object.entries(themeAgg)
      .map(([theme, v]) => ({ theme, count: v.count, avg_sentiment: Math.round((v.sentSum / v.count) * 1000) / 1000 }))
      .sort((a, b) => b.count - a.count);

    // top posts — merged real + synthetic, by engagement score
    topPosts[game] = [...rows]
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => ({ text: r.text, score: r.score, platform: r.platform, sentiment_label: r.sentiment_label, source: r.source }));

    // recurring questions — merged, text ending in '?'
    recurringQuestions[game] = rows
      .filter((r) => r.text.trim().endsWith("?"))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => ({ text: r.text, platform: r.platform, score: r.score, source: r.source }));
  }

  for (const r of allRows) {
    if (!platformRollup[r.platform]) platformRollup[r.platform] = { count: 0, sentSum: 0 };
    platformRollup[r.platform].count += 1;
    platformRollup[r.platform].sentSum += r.sentiment_score;
  }
  const byPlatform = {};
  const platformSentiment = {};
  for (const [plat, v] of Object.entries(platformRollup)) {
    const avg = Math.round((v.sentSum / v.count) * 1000) / 1000;
    byPlatform[plat] = { record_count: v.count, avg_sentiment: avg };
    platformSentiment[plat] = avg;
  }

  return {
    generated_at: new Date().toISOString(),
    total_records: allRows.length,
    games: GAMES,
    by_game: byGame,
    by_platform: byPlatform,
    weekly_volume: weeklyVolume,
    sentiment_distribution: bySentimentDist,
    top_themes: topThemes,
    top_posts: topPosts,
    recurring_questions: recurringQuestions,
    platform_sentiment: platformSentiment,
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get("/api/analysis", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: "YOUTUBE_API_KEY is not set. Add it to server/.env and restart the server." });
    }

    const force = req.query.force === "1";
    const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (fresh && !force) {
      return res.json(cache.data);
    }

    const [ytResult, discordResult, twitchResult] = await Promise.all([
      fetchLiveYouTubeData(),
      fetchLiveDiscordData(),
      fetchLiveTwitchData(),
    ]);

    // Drop the illustrative synthetic Discord rows for any game that now has
    // a real, live-configured channel — live data replaces the sample, it
    // doesn't stack with it. Synthetic Reddit rows are untouched (Reddit has
    // no live path configured yet).
    const synthetic = loadSyntheticRows().filter(
      (r) => !(r.platform === "Discord" && LIVE_DISCORD_GAMES.has(r.game))
    );

    const allRows = [...synthetic, ...ytResult.rows, ...discordResult.rows, ...twitchResult.rows];
    const analysis = buildAnalysis(allRows);

    const payload = {
      ...analysis,
      records: allRows,
      videos: ytResult.videos, // flat list of every fetched video (game, title, publishedAt, url, stats) for the time-range video picker
      twitch_live: twitchResult.liveSnapshot, // current live-viewer snapshot per game, separate from scored text records
      data_sources: {
        youtube: `live — fetched ${new Date().toISOString()} via YouTube Data API (last ${VIDEOS_PER_CHANNEL} uploads per channel)`,
        reddit: "static illustrative sample (see report/GAMING_COMMUNITY_PULSE_REPORT.md)",
        discord: DISCORD_TOKEN
          ? `live — fetched ${new Date().toISOString()} via Discord API (${discordChannelConfig.length} channel(s) configured)`
          : "static illustrative sample — add DISCORD_BOT_TOKEN to server/.env to go live",
        twitch:
          TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET
            ? `live — fetched ${new Date().toISOString()} via Twitch Helix API (top clips, last ${TWITCH_CLIPS_WINDOW_DAYS}d, ${twitchGameConfig.length} categories)`
            : "not configured — add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to server/.env to go live",
      },
      fetch_errors: [...ytResult.errors, ...discordResult.errors, ...twitchResult.errors],
    };

    cache = { data: payload, fetchedAt: Date.now() };
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    youtubeApiKeyConfigured: Boolean(API_KEY),
    discordBotTokenConfigured: Boolean(DISCORD_TOKEN),
    discordChannels: discordChannelConfig.length,
    twitchConfigured: Boolean(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET),
    twitchCategories: twitchGameConfig.length,
    games: GAMES,
  });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gaming Community Pulse (live) running at http://localhost:${PORT}`);
    if (!API_KEY) {
      console.warn("WARNING: YOUTUBE_API_KEY is not set in server/.env — /api/analysis will return an error until it is.");
    }
  });
}
