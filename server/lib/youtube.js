// Thin wrapper around the YouTube Data API v3.
// Docs: https://developers.google.com/youtube/v3/docs/channels/list
//       https://developers.google.com/youtube/v3/docs/playlistItems/list
//       https://developers.google.com/youtube/v3/docs/videos/list
//       https://developers.google.com/youtube/v3/docs/commentThreads/list
//
// Quota note: channels.list, playlistItems.list, videos.list, and
// commentThreads.list each cost ~1 unit per call (default daily quota is
// 10,000 units). search.list (100 units/call) is deliberately NOT used —
// we get a channel's recent uploads via its "uploads" playlist instead,
// which is far cheaper and gives the same result for this use case.

const BASE = "https://www.googleapis.com/youtube/v3";

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || `YouTube API request failed (${res.status})`);
  }
  return body;
}

/**
 * Resolves a channel handle (e.g. "PUBG", with or without the leading "@")
 * to its uploads playlist ID and publisher metadata. Tries the modern @handle
 * lookup first, then falls back to the legacy username lookup for older
 * channels.
 *
 * `snippet.country` is the channel's own declared country and is the strongest
 * available publication-region signal (see lib/region.js) — it costs nothing
 * extra here because `snippet` rides along on the same 1-unit call.
 */
async function resolveChannel(handle, apiKey) {
  const clean = handle.replace(/^@/, "");

  let body = await getJson(
    `${BASE}/channels?part=contentDetails,snippet&forHandle=${encodeURIComponent(clean)}&key=${apiKey}`
  );
  if (!body.items || !body.items.length) {
    body = await getJson(
      `${BASE}/channels?part=contentDetails,snippet&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`
    );
  }
  const item = body.items && body.items[0];
  if (!item) throw new Error(`Could not resolve channel handle "@${clean}"`);

  return {
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    country: item.snippet?.country || "",
    channelTitle: item.snippet?.title || clean,
  };
}

/** Back-compat wrapper for callers that only need the playlist ID. */
async function resolveUploadsPlaylistId(handle, apiKey) {
  return (await resolveChannel(handle, apiKey)).uploadsPlaylistId;
}

/**
 * Returns the most recent N videos from a channel's uploads playlist,
 * each with its real publish date — this is what lets discussion volume
 * spread across genuine weeks instead of being pinned to a single fetch date.
 */
async function fetchRecentVideos(playlistId, apiKey, maxResults = 10) {
  const body = await getJson(
    `${BASE}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}` +
      `&maxResults=${maxResults}&key=${apiKey}`
  );
  const videoIds = (body.items || []).map((it) => it.contentDetails.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Batch stats lookup — one call for all video IDs (comma-separated), 1 quota unit total.
  const statsBody = await getJson(
    `${BASE}/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${apiKey}`
  );
  return (statsBody.items || []).map((item) => ({
    videoId: item.id,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    viewCount: Number(item.statistics.viewCount || 0),
    likeCount: Number(item.statistics.likeCount || 0),
    commentCount: Number(item.statistics.commentCount || 0),
    // Publication-language signal for region classification. Falls back from
    // the spoken audio language to the metadata language; either is a property
    // of the upload, not of any viewer.
    language: item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage || "",
  }));
}

/**
 * Fetches comments for a single video. `order` is either:
 *   - "time"     → most-recent-first, so timestamps spread across real weeks
 *                  (this is what feeds the weekly volume chart / range slider).
 *   - "relevance"→ YouTube's own "top comments" ranking, which weights likes
 *                  and engagement — this is what surfaces the most-liked /
 *                  most-viral comments, which "time" order can miss entirely
 *                  if a viral comment is old.
 * maxResults costs the same 1 quota unit regardless of value (up to 100), so
 * requesting more per call is free — only the number of calls costs quota.
 */
async function fetchComments(videoId, apiKey, maxResults = 25, order = "time") {
  try {
    const body = await getJson(
      `${BASE}/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}` +
        `&maxResults=${maxResults}&order=${order}&textFormat=plainText&key=${apiKey}`
    );
    return (body.items || []).map((item) => {
      const top = item.snippet.topLevelComment.snippet;
      return {
        commentId: item.snippet.topLevelComment.id,
        author: top.authorDisplayName,
        text: top.textOriginal || top.textDisplay,
        publishedAt: top.publishedAt,
        likeCount: Number(top.likeCount || 0),
        replyCount: Number(item.snippet.totalReplyCount || 0),
      };
    });
  } catch (err) {
    // Comments disabled on a video shouldn't take down the whole game's data.
    return [];
  }
}

/**
 * Fetches both "time" and "relevance" order for a video and merges them into
 * one deduplicated list — gives genuine weekly spread AND makes sure the
 * truly most-liked/viral comments are captured even if they're not recent.
 */
async function fetchCommentsMerged(videoId, apiKey, maxResultsEach = 25) {
  const [recent, top] = await Promise.all([
    fetchComments(videoId, apiKey, maxResultsEach, "time"),
    fetchComments(videoId, apiKey, maxResultsEach, "relevance"),
  ]);
  const byId = new Map();
  for (const c of [...recent, ...top]) {
    byId.set(c.commentId, c);
  }
  return Array.from(byId.values());
}

module.exports = { resolveChannel, resolveUploadsPlaylistId, fetchRecentVideos, fetchComments, fetchCommentsMerged };
