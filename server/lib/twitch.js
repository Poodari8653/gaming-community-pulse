// Thin wrapper around the Twitch Helix API.
// Docs: https://dev.twitch.tv/docs/api/get-started/
//       https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow
//
// Unlike YouTube/Discord, Twitch's useful public data isn't organized around
// one "official channel per game" — most PUBG/WoW/etc. discussion happens on
// individual streamers' channels, not a publisher's own Twitch presence. So
// instead of tracking one channel per game, this listens at the *category*
// (game) level: top clips (community-made highlights, titled by streamers/
// viewers — the closest Twitch equivalent to a "post") and current live
// viewer counts, both queried by Twitch's internal game/category ID.

const AUTH_BASE = "https://id.twitch.tv/oauth2/token";
const API_BASE = "https://api.twitch.tv/helix";

let cachedToken = null; // { token, expiresAt }

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.message || `Twitch API request failed (${res.status})`);
  }
  return body;
}

/**
 * App access token via the Client Credentials Grant Flow — no per-user
 * Twitch login needed, just the app's Client ID + Secret. Cached in memory
 * and refreshed a minute before actual expiry (tokens last ~60 days).
 */
async function getAppAccessToken(clientId, clientSecret) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(AUTH_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.message || `Twitch token request failed (${res.status})`);
  }
  cachedToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

function authHeaders(clientId, token) {
  return { Authorization: `Bearer ${token}`, "Client-Id": clientId };
}

/**
 * Resolves a Twitch category/game display name (must match exactly, e.g.
 * "PUBG: BATTLEGROUNDS") to Twitch's internal numeric game ID.
 */
async function resolveGameId(name, clientId, token) {
  const body = await getJson(
    `${API_BASE}/games?name=${encodeURIComponent(name)}`,
    authHeaders(clientId, token)
  );
  const item = body.data && body.data[0];
  if (!item) throw new Error(`Could not resolve Twitch category "${name}"`);
  return item.id;
}

/**
 * Top clips across the whole category in the last `days` days — clips are
 * community-made highlights with a title, view count, and creator, which is
 * the closest Twitch analogue to a "post" for this dataset's shape.
 */
async function fetchTopClips(gameId, clientId, token, { days = 30, maxResults = 20 } = {}) {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - days * 24 * 60 * 60 * 1000);
  const body = await getJson(
    `${API_BASE}/clips?game_id=${encodeURIComponent(gameId)}&first=${maxResults}` +
      `&started_at=${startedAt.toISOString()}&ended_at=${endedAt.toISOString()}`,
    authHeaders(clientId, token)
  );
  return (body.data || []).map((c) => ({
    clipId: c.id,
    title: c.title,
    creatorName: c.creator_name,
    broadcasterName: c.broadcaster_name,
    viewCount: Number(c.view_count || 0),
    createdAt: c.created_at,
    url: c.url,
    // The broadcast language of the stream the clip came from — the only
    // publication-region signal Twitch exposes at category level.
    language: c.language || "",
  }));
}

/**
 * Currently-live streams for the category — a lightweight "how much buzz is
 * happening right now" signal (total live viewers, number of live channels).
 */
async function fetchLiveStreams(gameId, clientId, token, maxResults = 20) {
  const body = await getJson(
    `${API_BASE}/streams?game_id=${encodeURIComponent(gameId)}&first=${maxResults}`,
    authHeaders(clientId, token)
  );
  return (body.data || []).map((s) => ({
    userName: s.user_name,
    title: s.title,
    viewerCount: Number(s.viewer_count || 0),
    startedAt: s.started_at,
    language: s.language || "",
    url: `https://www.twitch.tv/${s.user_login}`,
  }));
}

module.exports = { getAppAccessToken, resolveGameId, fetchTopClips, fetchLiveStreams };
