// Thin wrapper around the Discord REST API (bot token auth).
// Docs: https://discord.com/developers/docs/resources/channel#get-channel
//       https://discord.com/developers/docs/resources/channel#get-channel-messages
//
// Requires: the bot must already be a member of the server the channel
// belongs to, with "View Channels" + "Read Message History" permissions,
// and "Message Content Intent" enabled in the Developer Portal — otherwise
// message content comes back empty even if the call itself succeeds.

const BASE = "https://discord.com/api/v10";

async function discordGet(path, botToken) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.message || `Discord API request failed (${res.status})`;
    throw new Error(`${msg} (code ${body?.code ?? res.status})`);
  }
  return body;
}

/**
 * Fetches basic channel info (name, guild it belongs to) for display/links,
 * plus the guild's declared `preferred_locale` — the server's own stated
 * locale, used as a publication-region signal (see lib/region.js). The guild
 * lookup is best-effort: a bot without Guilds access still gets channel info.
 */
async function fetchChannelInfo(channelId, botToken) {
  const ch = await discordGet(`/channels/${channelId}`, botToken);
  let guildLocale = "";
  let guildName = "";
  if (ch.guild_id) {
    try {
      const guild = await discordGet(`/guilds/${ch.guild_id}`, botToken);
      guildLocale = guild.preferred_locale || "";
      guildName = guild.name || "";
    } catch (_) {
      // Not fatal — the channel's messages are still usable without a locale.
    }
  }
  return { name: ch.name, guildId: ch.guild_id, guildLocale, guildName };
}

/**
 * Fetches up to `limit` (max 100) of the most recent messages in a channel,
 * newest first, with real timestamps and per-message reaction counts (used
 * as the engagement "score", since Discord has no like button — reactions
 * are the closest equivalent).
 */
async function fetchChannelMessages(channelId, botToken, limit = 100) {
  const messages = await discordGet(`/channels/${channelId}/messages?limit=${limit}`, botToken);
  return (messages || [])
    .filter((m) => m.content && m.content.trim().length > 0) // skip embeds/attachments-only messages
    .map((m) => {
      const reactionCount = (m.reactions || []).reduce((sum, r) => sum + (r.count || 0), 0);
      return {
        messageId: m.id,
        author: m.author?.username || "unknown",
        text: m.content,
        timestamp: m.timestamp,
        score: reactionCount,
      };
    });
}

module.exports = { fetchChannelInfo, fetchChannelMessages };
