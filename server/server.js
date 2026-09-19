// ---------------------------------------------------------------------------
// Gaming Community Pulse — live server
//
// Pipeline, end to end (this is the data flow the client asked to have
// documented in Questionary §4):
//
//   1. COLLECT   Four platform wrappers pull public data in parallel:
//                  YouTube  → lib/youtube.js  (Data API v3)
//                  Reddit   → lib/reddit.js   (OAuth API)
//                  Discord  → lib/discord.js  (Bot REST API, permissioned)
//                  Twitch   → lib/twitch.js   (Helix API)
//                Each returns rows in one shared schema, plus whatever
//                publication-region signal that platform exposes.
//
//   2. ENRICH    Every row is scored once:
//                  lib/nlp.js        → sentiment (-100..100), sarcasm, theme,
//                                      is_question, is_risk, language
//                  lib/engagement.js → Engagement Index (0-100, normalised
//                                      per platform)
//                  lib/region.js     → publication region + which signal
//                                      decided it
//
//   3. AGGREGATE lib/analytics.js turns rows into the figures the dashboard
//                shows: time series, spike detection, theme aggregates, risk
//                scoring, recurring-question clustering.
//
//   4. COMPARE   lib/store.js persists a daily snapshot; today is compared
//                against the most recent earlier one to produce deltas.
//
//   5. BRIEF     lib/briefing.js writes the daily narrative from the finished
//                analysis, and lib/gemini.js runs a second, independent AI
//                pass — Gemini, not Claude — that clusters each game's live
//                discussion (across whichever platforms are actually live
//                this refresh) into sub-topics with grounded quotes.
//
//   6. SERVE     /api/analysis returns aggregates AND the row-level records,
//                so the dashboard's three global filters (media channel,
//                game, time range) re-derive every panel client-side with no
//                round trip.
// ---------------------------------------------------------------------------

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const { buildAuth } = require("./lib/auth");
const { resolveChannel, fetchRecentVideos, fetchCommentsMerged } = require("./lib/youtube");
const { fetchChannelInfo, fetchChannelMessages } = require("./lib/discord");
const { getAppAccessToken, resolveGameId, fetchTopClips, fetchLiveStreams } = require("./lib/twitch");
const reddit = require("./lib/reddit");
const { loadSampleRows } = require("./lib/dataset");
const nlp = require("./lib/nlp");
const { engagementIndex, aggregateIndex, METHODOLOGY: ENGAGEMENT_METHODOLOGY } = require("./lib/engagement");
const { classifyRegion, REGIONS, METHODOLOGY: REGION_METHODOLOGY } = require("./lib/region");
const analytics = require("./lib/analytics");
const loadedStore = require("./lib/store");

const store = {
  storageInfo:
    typeof loadedStore.storageInfo === "function"
      ? loadedStore.storageInfo
      : () => ({
          mode: "unavailable",
          directory: null,
          snapshots_held: 0,
          retention_days: 90,
          durable: false,
        }),

  previousSnapshot:
    typeof loadedStore.previousSnapshot === "function"
      ? loadedStore.previousSnapshot
      : () => null,

  saveSnapshot:
    typeof loadedStore.saveSnapshot === "function"
      ? loadedStore.saveSnapshot
      : () => ({
          saved: false,
          mode: "unavailable",
          error: "Snapshot store unavailable",
        }),
};
const supabaseStore = require("./lib/supabase-store");
const { generateBriefing, TARGET_WORDS } = require("./lib/briefing");
const gemini = require("./lib/gemini");
const apiStats = require("./lib/apiStats");

const channelConfig = require("./config/channels.json");
const discordChannelConfig = require("./config/discord_channels.json");
const twitchGameConfig = require("./config/twitch_games.json");
const subredditConfig = require("./config/subreddits.json");

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.YOUTUBE_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

// Sample data ships on by default so the dashboard demonstrates a full tool.
// Set DEMO_DATA=false to run on collected data only.
const DEMO_DATA = String(process.env.DEMO_DATA || "true").toLowerCase() !== "false";

const GAMES = Array.from(
  new Set([
    ...channelConfig.map((c) => c.game),
    ...subredditConfig.map((c) => c.game),
    ...discordChannelConfig.map((c) => c.game),
    ...twitchGameConfig.map((c) => c.game),
  ])
);
const PLATFORMS = ["YouTube", "Reddit", "Discord", "Twitch"];

const VIDEOS_PER_CHANNEL = 8;
const COMMENTS_PER_VIDEO_PER_ORDER = 25;
const DISCORD_MESSAGES_PER_CHANNEL = 100;
const REDDIT_POSTS_PER_SUB = 50;
const REDDIT_COMMENTS_PER_SUB = 100;
const REDDIT_WINDOW = "week";
const TWITCH_CLIPS_PER_GAME = 20;
const TWITCH_CLIPS_WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { data: null, fetchedAt: 0 };

// ---------------------------------------------------------------------------
// Access control — this is an internal tool and must not be left open to the
// internet. A real /login page + signed session cookie gates every route,
// static assets included, before anything else. See lib/auth.js for the
// full design notes.
// ---------------------------------------------------------------------------
const auth = buildAuth(process.env.SESSION_SECRET);

// Express 4 does not catch rejections from async handlers — an unhandled one
// would leave the request hanging with no response. Wrap every async auth
// handler so a failure becomes a visible 500 instead of a stalled browser tab.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Render and Vercel both terminate TLS in front of this app, so the request
// Express sees is plain HTTP even in production. `trust proxy` makes
// `req.secure` reflect the original X-Forwarded-Proto instead of always
// reading false — that's what lets the session cookie get the Secure flag
// in production while still working over plain http://localhost locally.
app.set("trust proxy", 1);

// Public liveness probe for load balancers and uptime checks. Deliberately
// minimal: a probe needs a status code, not the configuration inventory that
// /api/health reports (which is why that one sits behind the gate).
app.get("/healthz", (req, res) => res.set("Cache-Control", "no-store").json({ ok: true }));

// Accounts are self-service: people sign up with an email and a password and
// are signed in immediately. There is no email verification or one-time code —
// the deployment is expected to sit behind RS's network, so this is defence in
// depth rather than the only control.
const formBody = express.urlencoded({ extended: false, limit: "4kb" });

// Same stack-trace exposure as the JSON routes, for the no-JavaScript path.
const formBodyError = (err, req, res, next) => {
  if (!err) return next();
  console.warn(`[auth] rejected form body on ${req.path}: ${err.message}`);
  res.status(err.type === "entity.too.large" ? 413 : 400)
     .type("html").send("<!doctype html><p>Malformed sign-in request. <a href=\"/login\">Try again</a>.");
};

// JSON auth API — what the sign-in UI calls. Public by necessity: it is how
// you get a session in the first place. /api/auth/me returns its own 401 so
// the front end can ask "am I signed in?" without being redirected.
const jsonBody = express.json({ limit: "4kb" });

app.get("/api/auth/status", wrap(auth.apiStatus));
app.get("/api/auth/me", auth.apiMe);
// A malformed or oversize body is rejected by the parser before the handler
// runs. Without this, Express's default handler answers with an HTML page
// containing a full stack trace and absolute server paths — on an endpoint
// that is reachable before sign-in. Scoped to these routes rather than global.
const jsonBodyError = (err, req, res, next) => {
  if (!err) return next();
  const tooBig = err.type === "entity.too.large";
  console.warn(`[auth] rejected request body on ${req.path}: ${err.message}`);
  res.status(tooBig ? 413 : 400).json({
    error: tooBig ? "Request too large." : "Malformed request.",
  });
};

app.post("/api/auth/login", jsonBody, jsonBodyError, wrap(auth.apiLogin));
app.post("/api/auth/signup", jsonBody, jsonBodyError, wrap(auth.apiSignup));
app.post("/api/auth/logout", auth.apiLogout);

// Page routes. GET serves the rich UI; POST is the no-JavaScript fallback and
// renders its errors server-side.
app.get("/signup", wrap(auth.signupPage));
app.post("/signup", formBody, formBodyError, wrap(auth.signupSubmit));
app.get("/login", wrap(auth.loginPage));
app.post("/login", formBody, formBodyError, wrap(auth.loginSubmit));
app.get("/logout", auth.logout);

app.use(auth.requireAuth);

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard-live.html")));

// ---------------------------------------------------------------------------
// 1. COLLECT
// ---------------------------------------------------------------------------

async function collectYouTube() {
  const rows = [];
  const videos = [];
  const errors = [];
  if (!API_KEY) return { rows, videos, errors, configured: false };

  await Promise.all(
    channelConfig.map(async ({ game, handle }) => {
      try {
        const channel = await resolveChannel(handle, API_KEY);
        const recentVideos = await fetchRecentVideos(channel.uploadsPlaylistId, API_KEY, VIDEOS_PER_CHANNEL);
        if (!recentVideos.length) {
          errors.push({ platform: "YouTube", game, message: `No videos returned for @${handle}` });
          return;
        }

        await Promise.all(
          recentVideos.map(async (v) => {
            const region = classifyRegion({ channelCountry: channel.country, contentLanguage: v.language });
            videos.push({
              game,
              videoId: v.videoId,
              title: v.title,
              publishedAt: v.publishedAt,
              viewCount: v.viewCount,
              likeCount: v.likeCount,
              commentCount: v.commentCount,
              region: region.region,
              url: `https://www.youtube.com/watch?v=${v.videoId}`,
            });

            const comments = await fetchCommentsMerged(v.videoId, API_KEY, COMMENTS_PER_VIDEO_PER_ORDER);
            for (const c of comments) {
              rows.push({
                platform: "YouTube",
                data_type: "collected",
                is_sample: false,
                game,
                source: v.title,
                content_type: "comment",
                author: c.author,
                timestamp: c.publishedAt,
                text: c.text,
                score: c.likeCount,
                num_comments: c.replyCount,
                url: `https://www.youtube.com/watch?v=${v.videoId}`,
                _regionSignals: { channelCountry: channel.country, contentLanguage: v.language },
              });
            }
          })
        );
      } catch (err) {
        errors.push({ platform: "YouTube", game, message: err.message });
      }
    })
  );

  return { rows, videos, errors, configured: true };
}

async function collectReddit() {
  const rows = [];
  const errors = [];
  const communities = [];
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return { rows, errors, communities, configured: false };

  try {
    const token = await reddit.getAppAccessToken(REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET);

    await Promise.all(
      subredditConfig.map(async ({ game, subreddit, region: configRegion }) => {
        try {
          const [info, posts, comments] = await Promise.all([
            reddit.fetchSubredditInfo(subreddit, token).catch(() => ({ name: `r/${subreddit}`, subscribers: 0, lang: "" })),
            reddit.fetchTopPosts(subreddit, token, { limit: REDDIT_POSTS_PER_SUB, t: REDDIT_WINDOW }),
            reddit.fetchRecentComments(subreddit, token, { limit: REDDIT_COMMENTS_PER_SUB }),
          ]);

          communities.push({ game, subreddit: info.name, subscribers: info.subscribers });
          const signals = { configRegion: configRegion || null, contentLanguage: info.lang || "" };

          for (const item of [...posts, ...comments]) {
            rows.push({
              platform: "Reddit",
              data_type: "collected",
              is_sample: false,
              game,
              source: info.name,
              content_type: item.contentType,
              author: item.author,
              timestamp: item.createdAt,
              text: item.text,
              score: item.score,
              num_comments: item.numComments,
              url: item.url,
              _regionSignals: signals,
            });
          }
        } catch (err) {
          errors.push({ platform: "Reddit", game, message: err.message });
        }
      })
    );
  } catch (err) {
    errors.push({ platform: "Reddit", game: null, message: `Reddit auth failed: ${err.message}` });
  }

  return { rows, errors, communities, configured: true };
}

async function collectDiscord() {
  const rows = [];
  const errors = [];
  if (!DISCORD_TOKEN) return { rows, errors, configured: false };

  await Promise.all(
    discordChannelConfig.map(async ({ game, channelId, region: configRegion }) => {
      try {
        const info = await fetchChannelInfo(channelId, DISCORD_TOKEN);
        const messages = await fetchChannelMessages(channelId, DISCORD_TOKEN, DISCORD_MESSAGES_PER_CHANNEL);
        const signals = { guildLocale: info.guildLocale, configRegion: configRegion || null };

        for (const m of messages) {
          rows.push({
            platform: "Discord",
            data_type: "collected",
            is_sample: false,
            game,
            source: `#${info.name}`,
            content_type: "message",
            author: m.author,
            timestamp: m.timestamp,
            text: m.text,
            score: m.score,
            num_comments: 0,
            url: info.guildId ? `https://discord.com/channels/${info.guildId}/${channelId}/${m.messageId}` : "",
            _regionSignals: signals,
          });
        }
      } catch (err) {
        errors.push({ platform: "Discord", game, message: err.message });
      }
    })
  );

  return { rows, errors, configured: true };
}

async function collectTwitch() {
  const rows = [];
  const liveSnapshot = [];
  const errors = [];
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return { rows, liveSnapshot, errors, configured: false };

  try {
    const token = await getAppAccessToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);

    await Promise.all(
      twitchGameConfig.map(async ({ game, twitchCategory }) => {
        try {
          const gameId = await resolveGameId(twitchCategory, TWITCH_CLIENT_ID, token);
          const [clips, streams] = await Promise.all([
            fetchTopClips(gameId, TWITCH_CLIENT_ID, token, { days: TWITCH_CLIPS_WINDOW_DAYS, maxResults: TWITCH_CLIPS_PER_GAME }),
            fetchLiveStreams(gameId, TWITCH_CLIENT_ID, token, 20),
          ]);

          for (const c of clips) {
            rows.push({
              platform: "Twitch",
              data_type: "collected",
              is_sample: false,
              game,
              source: c.broadcasterName,
              content_type: "clip",
              author: c.creatorName,
              timestamp: c.createdAt,
              text: c.title,
              score: c.viewCount,
              num_comments: 0,
              url: c.url,
              _regionSignals: { contentLanguage: c.language },
            });
          }

          // Live-viewer snapshot is a "right now" figure, not a text record —
          // it is never sentiment-scored and never enters the time series.
          const byRegion = {};
          for (const s of streams) {
            const r = classifyRegion({ contentLanguage: s.language }).region;
            byRegion[r] = (byRegion[r] || 0) + s.viewerCount;
          }
          liveSnapshot.push({
            game,
            liveChannelCount: streams.length,
            totalLiveViewers: streams.reduce((a, s) => a + s.viewerCount, 0),
            viewersByRegion: byRegion,
            topStream: streams[0]
              ? { userName: streams[0].userName, title: streams[0].title, viewerCount: streams[0].viewerCount, url: streams[0].url }
              : null,
          });
        } catch (err) {
          errors.push({ platform: "Twitch", game, message: err.message });
        }
      })
    );
  } catch (err) {
    errors.push({ platform: "Twitch", game: null, message: `Twitch auth failed: ${err.message}` });
  }

  return { rows, liveSnapshot, errors, configured: true };
}

// ---------------------------------------------------------------------------
// 2. ENRICH
// ---------------------------------------------------------------------------

async function enrich(rows) {
  const analyses = await nlp.analyzeRecords(rows);

  return rows.map((row, i) => {
    const a = analyses[i] || { score: 0, label: "neutral", confidence: 0, theme: "", is_question: false, is_risk: false, sarcasm: false, language: "", method: "lexicon" };
    const detectedLanguage =
  a.language ||
  row.language ||
  row._regionSignals?.contentLanguage ||
  "";

const signals = {
  ...(row._regionSignals || {}),
  textLanguage: detectedLanguage,
};
    const region = classifyRegion(signals);

    const enriched = {
      platform: row.platform,
      data_type: row.data_type,
      is_sample: Boolean(row.is_sample),
      game: row.game,
      source: row.source,
      content_type: row.content_type,
      author: row.author,
      timestamp: row.timestamp,
      text: row.text,
      score: row.score,
      num_comments: row.num_comments,
      url: row.url,
      theme: a.theme,
      sentiment_score: a.score,
      sentiment_label: a.label,
      sentiment_confidence: a.confidence,
      sentiment_method: a.method,
      sarcasm: a.sarcasm,
      is_question: a.is_question,
      is_risk: a.is_risk,
      
      region: region.region,
      region_source: region.source,
      region_confidence: region.confidence,
    };
    enriched.engagement_index = engagementIndex(enriched);
    return enriched;
  });
}

// ---------------------------------------------------------------------------
// 3. AGGREGATE
// ---------------------------------------------------------------------------

function summariseGroup(rows) {
  if (!rows.length) return { record_count: 0, avg_sentiment: 0, avg_engagement: 0, positive: 0, neutral: 0, negative: 0 };
  const dist = { positive: 0, neutral: 0, negative: 0 };
  let sentSum = 0;
  for (const r of rows) {
    sentSum += r.sentiment_score;
    dist[r.sentiment_label] += 1;
  }
  return {
    record_count: rows.length,
    avg_sentiment: Math.round(sentSum / rows.length),
    avg_engagement: aggregateIndex(rows),
    ...dist,
  };
}

function buildAnalysis(rows, extras) {
  const date = new Date().toISOString().slice(0, 10);
  const themes = analytics.aggregateThemes(rows);
  const risks = analytics.detectRisks(rows, themes);
  const dailySeries = analytics.buildSeries(rows, "day");
  const weeklySeries = analytics.buildSeries(rows, "week");
  const spikes = analytics.detectSpikes(weeklySeries).map((s) => ({ ...s, granularity: "week" }));

  const gamesSummary = GAMES.map((game) => {
    const g = rows.filter((r) => r.game === game);
    const platforms = {};
    for (const r of g) platforms[r.platform] = (platforms[r.platform] || 0) + 1;
    return { game, ...summariseGroup(g), platforms };
  }).filter((g) => g.record_count > 0);

  const platformSummary = PLATFORMS.map((platform) => {
    const p = rows.filter((r) => r.platform === platform);
    return { platform, ...summariseGroup(p) };
  }).filter((p) => p.record_count > 0);

  const regionSummary = REGIONS.map((region) => {
    const r = rows.filter((row) => row.region === region);
    return { region, ...summariseGroup(r) };
  }).filter((r) => r.record_count > 0);

  const sampleCount = rows.filter((r) => r.is_sample).length;

  const analysis = {
    date,
    generated_at: new Date().toISOString(),
    games: GAMES,
    platforms: PLATFORMS,
    regions: REGIONS,
    overall: summariseGroup(rows),
    games_summary: gamesSummary,
    platform_summary: platformSummary,
    region_summary: regionSummary,
    themes,
    risks,
    spikes,
    daily_series: dailySeries,
    weekly_series: weeklySeries,
    recurring_questions: analytics.clusterQuestions(rows),
    top_posts: [...rows]
      .sort((a, b) => b.engagement_index - a.engagement_index)
      .slice(0, 12)
      .map((r) => ({
        text: r.text.slice(0, 400),
        platform: r.platform,
        game: r.game,
        source: r.source,
        sentiment_score: r.sentiment_score,
        sentiment_label: r.sentiment_label,
        engagement_index: r.engagement_index,
        is_sample: r.is_sample,
        url: r.url,
      })),
    provenance: {
      total_records: rows.length,
      collected_records: rows.length - sampleCount,
      sample_records: sampleCount,
      sample_share_pct: rows.length ? Math.round((sampleCount / rows.length) * 100) : 0,
      demo_data_enabled: DEMO_DATA,
    },
    ...extras,
  };

  return analysis;
}

/** The compact form persisted daily so tomorrow can compute deltas. */
function toSnapshot(analysis) {
  return {
    date: analysis.date,
    generated_at: analysis.generated_at,
    overall: analysis.overall,
    games_summary: analysis.games_summary,
    platform_summary: analysis.platform_summary,
    region_summary: analysis.region_summary,
    themes: analysis.themes.map((t) => ({ theme: t.theme, count: t.count, avg_sentiment: t.avg_sentiment, negative_share: t.negative_share })),
    risk_count: analysis.risks.length,
    provenance: analysis.provenance,
  };
}

// ---------------------------------------------------------------------------
// Refresh — the whole pipeline in one call
// ---------------------------------------------------------------------------

async function refresh() {
  const [yt, rd, dc, tw] = await Promise.all([collectYouTube(), collectReddit(), collectDiscord(), collectTwitch()]);

  const collected = [...yt.rows, ...rd.rows, ...dc.rows, ...tw.rows];
  await supabaseStore.saveRawRecords(collected);
  const enriched = await enrich(collected);
  await supabaseStore.saveEnrichedRecords(enriched);
  
  // Sample rows only stand in for a platform that has NO live feed configured.
  // The moment a platform goes live, its sample rows are dropped rather than
  // stacked on top of real data.
  const livePlatforms = new Set(enriched.map((r) => r.platform));
  const sampleRows = DEMO_DATA ? loadSampleRows().filter((r) => !livePlatforms.has(r.platform)) : [];

  const rows = [...enriched, ...sampleRows];

  const fetchErrors = [...yt.errors, ...rd.errors, ...dc.errors, ...tw.errors];
  const stamp = new Date().toISOString();

  /**
   * Describes what a source ACTUALLY did this refresh, not merely whether its
   * credentials are present. Configured-but-failing must never report as "live":
   * a revoked token would otherwise show a green "live" line while the error
   * banner beside it reported 401 and the platform's rows came from the sample.
   *
   * The dashboard colours the status dot by whether the string starts with
   * "live", so getting this string right is what makes the indicator honest.
   */
  const describe = (result, opts) => {
    if (!result.configured) {
      return opts.hasSampleFallback && DEMO_DATA
        ? `not configured — showing labelled illustrative sample. ${opts.toGoLive}`
        : `not configured — ${opts.toGoLive}`;
    }
    const rowCount = result.rows.length;
    if (rowCount > 0) return `live — ${opts.detail}, fetched ${stamp}`;

    const why = result.errors.length
      ? result.errors.map((e) => e.message).join("; ").slice(0, 220)
      : "the API returned no records for the configured sources";
    const standIn = opts.hasSampleFallback && DEMO_DATA
      ? " Showing the labelled illustrative sample in its place."
      : "";
    return `configured but collected nothing — ${why}.${standIn}`;
  };

  const dataSources = {
    youtube: describe(yt, {
      detail: `${channelConfig.length} channels, last ${VIDEOS_PER_CHANNEL} uploads each`,
      toGoLive: "set YOUTUBE_API_KEY",
      hasSampleFallback: false,
    }),
    reddit: describe(rd, {
      detail: `${subredditConfig.length} subreddits, top posts (${REDDIT_WINDOW}) + recent comments`,
      toGoLive: "set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET",
      hasSampleFallback: true,
    }),
    discord: describe(dc, {
      detail: `${discordChannelConfig.length} permissioned channel(s)`,
      toGoLive: "set DISCORD_BOT_TOKEN",
      hasSampleFallback: true,
    }),
    twitch: describe(tw, {
      detail: `${twitchGameConfig.length} categories, top clips (last ${TWITCH_CLIPS_WINDOW_DAYS}d) + live snapshot`,
      toGoLive: "set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET",
      hasSampleFallback: false,
    }),
  };

  const analysis = buildAnalysis(rows, {
    videos: yt.videos,
    twitch_live: tw.liveSnapshot,
    reddit_communities: rd.communities,
    data_sources: dataSources,
    fetch_errors: fetchErrors,
    sentiment_engine: nlp.getStats(),
    storage: store.storageInfo(),
  });

  // 4. COMPARE — deltas against the most recent earlier snapshot, then persist.
  const previous = await store.previousSnapshot(analysis.date);  
  analysis.deltas = analytics.computeDeltas(analysis, previous);
  const saved = await store.saveSnapshot(toSnapshot(analysis));  
  analysis.storage = { ...analysis.storage, last_write: saved };

  // 5. BRIEF
  analysis.briefing = await generateBriefing(analysis);

  // 5b. DISCUSS — a second, independent AI pass (Gemini, not Claude) that
  // clusters each game's live discussion into sub-topics with grounded,
  // already-scored quotes. Runs over `enriched` specifically — every live
  // record across every platform, already carrying sentiment and Engagement
  // Index from step 2, but never the illustrative sample rows added below —
  // so every quote this panel shows links to an actual public post, comment
  // or clip, and ranks/attributes by the same normalised metrics as the rest
  // of the dashboard rather than each platform's own incomparable native
  // one. Whichever platforms are actually configured and live this refresh
  // is exactly what gets clustered; nothing here is hardcoded to one platform.
  analysis.discussion_summaries = await gemini.generateDiscussionSummaries(enriched);

  // 6. SERVE — records ride along so all three global filters work client-side.
  analysis.records = rows;

  return analysis;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get("/api/analysis", async (req, res) => {
  try {
    const force = req.query.force === "1";

    // Forcing a refresh is the one action on this dashboard that actually
    // costs money each time — it re-scores everything through Claude,
    // re-clusters through Gemini, and re-hits YouTube/Reddit/Discord/Twitch
    // quotas. Restricted to admins; a regular viewer's page just serves the
    // 5-minute cache, same as any unforced request. This 403s rather than
    // silently ignoring ?force=1, so the "Refresh data" button's failure (if
    // someone bypasses the UI, which already hides that button for
    // non-admins) is honest instead of quietly doing nothing.
    if (force && req.authRole !== "admin") {
      return res.status(403).json({
        error: "Only admins can force a refresh — it re-runs paid API calls (Claude, Gemini) and re-hits platform quotas.",
        your_role: req.authRole || "user",
      });
    }

    const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (fresh && !force) return res.json({ ...cache.data, viewer: { user: req.authUser, role: req.authRole } });

    const payload = await refresh();
    cache = { data: payload, fetchedAt: Date.now() };
    res.json({ ...payload, viewer: { user: req.authUser, role: req.authRole } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Everything the client asked to have explained (Questionary §1, §2, §3, §4),
 * served as data so the dashboard can render it on screen rather than pointing
 * at a document.
 */
app.get("/api/methodology", (req, res) => {
  res.json({
    engagement: ENGAGEMENT_METHODOLOGY,
    region: REGION_METHODOLOGY,
    sentiment: {
      name: "Sentiment",
      range: "-100 (extremely negative) to +100 (extremely positive)",
      labels: "positive > +15, negative < -15, neutral in between",
      primary_engine: {
        name: "Semantic scoring via Claude",
        model: nlp.MODEL,
        active: nlp.isConfigured(),
        reads: [
          "sarcasm and irony — 'This game is amazing' after a list of complaints scores negative",
          "negation — 'not good' scores negative rather than positive",
          "gaming slang — 'insane', 'sick', 'cracked', 'goated' read as praise",
          "mixed sentiment — a post that praises the art and attacks the monetisation",
          "non-English text, scored on meaning rather than dropped",
        ],
        also_returns: ["theme (controlled vocabulary)", "is_question", "is_risk", "language", "confidence"],
      },
      fallback_engine: {
        name: "Gaming-tuned lexicon",
        active_when: "ANTHROPIC_API_KEY is unset, or a semantic batch errors",
        handles: ["negation windows", "intensifiers and diminishers", "gaming slang polarity", "emoji", "shouting and punctuation emphasis"],
        cannot_handle: ["genuine sarcasm", "context-dependent irony", "long-range mixed sentiment"],
      },
      confidence: "Every record carries a 0-1 confidence. Low-confidence records still appear but should not drive a decision on their own.",
      themes: nlp.THEMES,
    },
    data_flow: {
      steps: [
        { step: 1, name: "Collect", detail: "Four platform wrappers pull public data in parallel via official APIs.", sources: PLATFORMS },
        { step: 2, name: "Enrich", detail: "Each row is scored once for sentiment, theme, question/risk flags, engagement index and publication region." },
        { step: 3, name: "Aggregate", detail: "Rows become time series, spike detections, theme aggregates, risk scores and question clusters." },
        { step: 4, name: "Compare", detail: "A daily snapshot is persisted; today is compared against the most recent earlier snapshot." },
        { step: 5, name: "Brief", detail: "The daily narrative is written from the finished analysis." },
        { step: 6, name: "Serve", detail: "Aggregates and row-level records are returned together so all three global filters re-derive every panel client-side." },
      ],
      dimensions_collected: [
        "platform", "game", "source (channel / subreddit / server / broadcaster)", "content type",
        "author handle (public display name only)", "timestamp", "text", "native engagement metrics",
        "publication-region signals", "url",
      ],
      derived_fields: [
        "sentiment_score (-100..100)", "sentiment_label", "sentiment_confidence", "sentiment_method",
        "sarcasm", "theme", "is_question", "is_risk", "language",
        "engagement_index (0-100)", "region", "region_source", "region_confidence",
      ],
    },
    briefing: {
      recommended_length: `${TARGET_WORDS.min}-${TARGET_WORDS.max} words for the narrative`,
      why: "Reads in 45-60 seconds, which is the realistic attention budget before a morning standup. Below ~120 words the brief loses its specifics and becomes horoscope text; above ~250 words people skim, and a skimmed narrative is worse than a scannable list — so everything beyond the narrative is structured as bullets.",
    },
  });
});

// Operational/config status — who's configured, which models, storage
// durability. Admin-only: this is infrastructure detail for whoever runs
// the tool, not something every viewer of the dashboard needs, and it's
// more than a regular user needs to see about how the instance is wired up.
app.get("/api/health", auth.requireAdmin, (req, res) => {
  res.json({
    ok: true,
    games: GAMES,
    platforms: {
      youtube: { configured: Boolean(API_KEY), channels: channelConfig.length },
      reddit: { configured: Boolean(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET), subreddits: subredditConfig.length },
      discord: { configured: Boolean(DISCORD_TOKEN), channels: discordChannelConfig.length },
      twitch: { configured: Boolean(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET), categories: twitchGameConfig.length },
    },
    semantic_analysis: { configured: nlp.isConfigured(), model: nlp.isConfigured() ? nlp.MODEL : null },
    discussion_summary: { configured: gemini.isConfigured(), model: gemini.isConfigured() ? gemini.MODEL : null, engine: "Gemini", scope: "All live platforms (never sample)" },
    demo_data_enabled: DEMO_DATA,
    storage: store.storageInfo(),
    // Running counts of failed platform/AI API calls since this process
    // started — 429s (rate limits) included, keyed by status code. Resets
    // on restart, same as the in-memory cache; this is a live quota signal
    // for an admin, not an audit log. See lib/apiStats.js.
    api_error_counts: apiStats.getStats(),
    access_control: {
      configured: auth.configured,
      account_store: "supabase",
      table: "app_users",
      signup_url: "/signup",
      login_url: "/login",
      session_secret_set: !auth.sessionSecretEphemeral,
      signed_in_as: req.authUser || null,
    },
  });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Gaming Community Pulse running at http://localhost:${PORT}`);

    if (!auth.configured) {
      console.warn(
        "\n" +
        "*************************************************************************\n" +
        "*  SUPABASE_URL / SUPABASE_SECRET_KEY are not set, so accounts cannot   *\n" +
        "*  be read. Every request will return 503 rather than serving the       *\n" +
        "*  dashboard without a login. Set both in server/.env and run           *\n" +
        "*  server/sql/001_app_users.sql in the Supabase SQL editor.             *\n" +
        "*************************************************************************\n"
      );
    } else {
      // Confirm the table actually exists, rather than only that the
      // credentials are present — a missing table is the likeliest setup slip.
      auth.checkTable().then(async (check) => {
        if (!check.ok) {
          console.warn(`\nAccess control: MISCONFIGURED — ${check.reason}\n`);
          return;
        }
        const count = await auth.countUsers();
        console.log(
          `Access control: ON — accounts in Supabase (app_users)` +
          (count === null ? "" : `, ${count} registered`) +
          `. Sign up at /signup, sign in at /login.`
        );
      });
      if (auth.sessionSecretEphemeral) {
        console.warn(
          "\n" +
          "*************************************************************************\n" +
          "*  WARNING: SESSION_SECRET is not set — a random one was generated for  *\n" +
          "*  this process only. Everyone gets signed out whenever this instance   *\n" +
          "*  restarts or a new one spins up (guaranteed on serverless hosts like  *\n" +
          "*  Vercel). Set SESSION_SECRET to any long random string for stable     *\n" +
          "*  sessions across restarts.                                            *\n" +
          "*************************************************************************\n"
        );
      }
    }

    const missing = [];
    if (!API_KEY) missing.push("YOUTUBE_API_KEY");
    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) missing.push("REDDIT_CLIENT_ID/SECRET");
    if (!DISCORD_TOKEN) missing.push("DISCORD_BOT_TOKEN");
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) missing.push("TWITCH_CLIENT_ID/SECRET");
    if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY (semantic sentiment + AI briefing)");
    if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY (Top discussions panel)");
    if (missing.length) {
      console.warn(`Not configured: ${missing.join(", ")}. See server/.env.example — the dashboard still runs, with those sources marked unavailable.`);
    }
  });
}
