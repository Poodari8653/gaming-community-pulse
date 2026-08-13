// ---------------------------------------------------------------------------
// Reddit collection via the official OAuth API.
//
// This closes the biggest gap in the original prototype: Reddit was the one
// platform in the brief with no implementation at all, and its 295 records
// were procedurally generated stand-ins. This module replaces them with real
// data from public subreddits, collected the way Reddit's terms require.
//
// COMPLIANCE
//   • Official OAuth API only — no scraping, no old.reddit HTML parsing, no
//     unauthenticated JSON endpoints, no rate-limit evasion.
//   • Application-only (client_credentials) auth by default: read-only access
//     to PUBLIC subreddit content, no user account acting on anyone's behalf.
//     A script-app password grant is supported for installs that need it.
//   • Reddit requires a descriptive, identifying User-Agent on every request
//     and treats a generic one as abuse; ours names the app and contact.
//   • Free-tier OAuth allows 100 queries/minute averaged over 10 minutes. Two
//     calls per subreddit per refresh (posts + comments) across a handful of
//     subreddits sits far inside that.
//
// Docs: https://github.com/reddit-archive/reddit/wiki/OAuth2
//       https://support.reddithelp.com/hc/en-us/articles/16160319875092
// ---------------------------------------------------------------------------

const AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ||
  "nodejs:gaming-community-pulse:v2.0 (social listening prototype for Ruisheng Holdings)";

let cachedToken = null; // { token, expiresAt }

async function getAppAccessToken(clientId, clientSecret) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams();

  // A script app with a username/password uses the password grant; anything
  // else uses application-only auth, which is all we need for public reads.
  if (process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD) {
    body.set("grant_type", "password");
    body.set("username", process.env.REDDIT_USERNAME);
    body.set("password", process.env.REDDIT_PASSWORD);
  } else {
    body.set("grant_type", "client_credentials");
  }

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Reddit token request failed (${res.status})`);
  }

  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function redditGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Reddit API ${res.status} on ${path}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return res.json();
}

/**
 * Top posts in a subreddit over a trailing window. `t` is Reddit's own
 * timeframe parameter: hour | day | week | month | year | all.
 */
async function fetchTopPosts(subreddit, token, { limit = 50, t = "week" } = {}) {
  const body = await redditGet(
    `/r/${encodeURIComponent(subreddit)}/top?limit=${limit}&t=${t}&raw_json=1`,
    token
  );
  return (body?.data?.children || [])
    .map((c) => c.data)
    .filter((p) => p && !p.stickied)
    .map((p) => ({
      id: p.id,
      author: p.author ? `u/${p.author}` : "unknown",
      title: p.title || "",
      text: [p.title, p.selftext].filter(Boolean).join(" — ").slice(0, 2000),
      createdAt: new Date((p.created_utc || 0) * 1000).toISOString(),
      score: Number(p.score || 0),
      numComments: Number(p.num_comments || 0),
      url: `https://www.reddit.com${p.permalink}`,
      contentType: "post",
      flair: p.link_flair_text || "",
    }));
}

/**
 * Recent comments across a whole subreddit. One call gets a broad slice of
 * live discussion without paying a request per thread.
 */
async function fetchRecentComments(subreddit, token, { limit = 100 } = {}) {
  const body = await redditGet(
    `/r/${encodeURIComponent(subreddit)}/comments?limit=${limit}&raw_json=1`,
    token
  );
  return (body?.data?.children || [])
    .map((c) => c.data)
    .filter((c) => c && c.body && c.body !== "[deleted]" && c.body !== "[removed]")
    .map((c) => ({
      id: c.id,
      author: c.author ? `u/${c.author}` : "unknown",
      text: c.body.slice(0, 2000),
      createdAt: new Date((c.created_utc || 0) * 1000).toISOString(),
      score: Number(c.score || 0),
      numComments: 0,
      url: `https://www.reddit.com${c.permalink || ""}`,
      contentType: "comment",
    }));
}

/** Subreddit metadata — used for display and for a declared language, if any. */
async function fetchSubredditInfo(subreddit, token) {
  const body = await redditGet(`/r/${encodeURIComponent(subreddit)}/about?raw_json=1`, token);
  const d = body?.data || {};
  return {
    name: d.display_name_prefixed || `r/${subreddit}`,
    subscribers: Number(d.subscribers || 0),
    lang: d.lang || "",
    over18: Boolean(d.over18),
  };
}

module.exports = { getAppAccessToken, fetchTopPosts, fetchRecentComments, fetchSubredditInfo };
