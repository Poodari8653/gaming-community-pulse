// ---------------------------------------------------------------------------
// Publication-region classification — the answer to Questionary §3.
//
// The client's framing matters and is respected here: classify the region a
// post or video was PUBLISHED IN, not the geography of individual commenters.
// We never attempt to locate a commenter — that would be personal data the
// placement's data-source rules exclude, and the platforms do not expose it.
//
// SIGNALS, IN PRECEDENCE ORDER
// Each is a property of the publisher or the content, not of an individual:
//
//   1. channel_country    YouTube channels.list → snippet.country. The country
//                         the channel itself declares. Strongest signal.
//   2. guild_locale       Discord guilds → preferred_locale. The server's own
//                         declared locale.
//   3. content_language   YouTube videos.list → defaultAudioLanguage /
//                         defaultLanguage; Twitch clips & streams → language.
//                         The language the content was published in.
//   4. source_config      A region declared in our own config for a source
//                         (e.g. a subreddit we know is a regional community).
//   5. text_language      The language the text itself is written in, detected
//                         by the semantic layer. Weakest — a Spanish comment on
//                         a US channel tells you about the commenter, not the
//                         publication — so it is used only to break ties on
//                         category-level Twitch data where nothing better exists,
//                         and it is reported at low confidence.
//
// Anything with no usable signal is "Undetermined" and is shown as such rather
// than being silently bucketed into a default region.
//
// RS operates between Eastern and Western markets, so the buckets are the ones
// their campaign planning actually uses.
// ---------------------------------------------------------------------------

const REGIONS = ["Americas", "EMEA", "APAC", "Undetermined"];

// ISO 3166-1 alpha-2 → region bucket. Covers the markets RS works in; anything
// unlisted falls through to language inference rather than a wrong guess.
const COUNTRY_REGION = {
  US: "Americas", CA: "Americas", MX: "Americas", BR: "Americas", AR: "Americas",
  CL: "Americas", CO: "Americas", PE: "Americas",
  GB: "EMEA", IE: "EMEA", FR: "EMEA", DE: "EMEA", ES: "EMEA", IT: "EMEA",
  NL: "EMEA", BE: "EMEA", SE: "EMEA", NO: "EMEA", DK: "EMEA", FI: "EMEA",
  PL: "EMEA", PT: "EMEA", CZ: "EMEA", AT: "EMEA", CH: "EMEA", RU: "EMEA",
  UA: "EMEA", TR: "EMEA", AE: "EMEA", SA: "EMEA", IL: "EMEA", ZA: "EMEA",
  EG: "EMEA", NG: "EMEA", GR: "EMEA", RO: "EMEA", HU: "EMEA",
  CN: "APAC", HK: "APAC", TW: "APAC", JP: "APAC", KR: "APAC", SG: "APAC",
  MY: "APAC", TH: "APAC", VN: "APAC", ID: "APAC", PH: "APAC", IN: "APAC",
  AU: "APAC", NZ: "APAC", PK: "APAC", BD: "APAC",
};

// ISO 639-1 language → region bucket. Only unambiguous mappings are listed:
// English, Spanish and Portuguese are spoken across buckets, so they are
// handled by the regional-variant table below instead.
const LANGUAGE_REGION = {
  zh: "APAC", ja: "APAC", ko: "APAC", th: "APAC", vi: "APAC", id: "APAC",
  ms: "APAC", hi: "APAC", ta: "APAC", tl: "APAC", bn: "APAC",
  de: "EMEA", fr: "EMEA", it: "EMEA", nl: "EMEA", pl: "EMEA", ru: "EMEA",
  uk: "EMEA", tr: "EMEA", ar: "EMEA", sv: "EMEA", no: "EMEA", da: "EMEA",
  fi: "EMEA", cs: "EMEA", el: "EMEA", ro: "EMEA", hu: "EMEA", he: "EMEA",
};

// Regional variants resolve the ambiguous languages when the tag carries one.
const LANGUAGE_VARIANT_REGION = {
  "en-us": "Americas", "en-ca": "Americas", "es-mx": "Americas", "es-419": "Americas",
  "pt-br": "Americas",
  "en-gb": "EMEA", "en-ie": "EMEA", "es-es": "EMEA", "pt-pt": "EMEA",
  "en-au": "APAC", "en-nz": "APAC", "en-sg": "APAC", "en-in": "APAC",
  "zh-cn": "APAC", "zh-tw": "APAC", "zh-hk": "APAC",
};

function normaliseTag(tag) {
  return (tag || "").trim().toLowerCase().replace(/_/g, "-");
}

function fromCountry(code) {
  if (!code) return null;
  return COUNTRY_REGION[String(code).trim().toUpperCase()] || null;
}

function fromLanguage(tag) {
  const t = normaliseTag(tag);
  if (!t) return null;
  if (LANGUAGE_VARIANT_REGION[t]) return LANGUAGE_VARIANT_REGION[t];
  const base = t.split("-")[0];
  return LANGUAGE_REGION[base] || null;
}

/**
 * Classifies a record's publication region from whatever signals it carries.
 *
 * `signals` accepts any subset of:
 *   { channelCountry, guildLocale, contentLanguage, configRegion, textLanguage }
 *
 * Returns { region, source, confidence } — source names the signal that
 * decided it, so any figure on the dashboard is auditable back to a field.
 */
function classifyRegion(signals = {}) {
  const { channelCountry, guildLocale, contentLanguage, configRegion, textLanguage } = signals;

  const byChannel = fromCountry(channelCountry);
  if (byChannel) return { region: byChannel, source: "channel_country", confidence: 0.95 };

  if (configRegion && REGIONS.includes(configRegion)) {
    return { region: configRegion, source: "source_config", confidence: 0.9 };
  }

  const byGuild = fromLanguage(guildLocale);
  if (byGuild) return { region: byGuild, source: "guild_locale", confidence: 0.8 };

  const byContent = fromLanguage(contentLanguage);
  if (byContent) return { region: byContent, source: "content_language", confidence: 0.7 };

  const byText = fromLanguage(textLanguage);
  if (byText) return { region: byText, source: "text_language", confidence: 0.4 };

  return { region: "Undetermined", source: "none", confidence: 0 };
}

/**
 * Machine-readable methodology, served alongside the engagement one so the
 * dashboard can explain on screen how a region was decided.
 */
const METHODOLOGY = {
  name: "Publication Region",
  scope: "The region the content was PUBLISHED in. Individual commenters are never geolocated — that is personal data outside this project's data-source rules, and the platforms do not expose it.",
  buckets: REGIONS,
  signals: [
    { priority: 1, name: "channel_country", api_field: "YouTube channels.list → snippet.country", confidence: 0.95, note: "The country the publishing channel itself declares." },
    { priority: 2, name: "source_config", api_field: "server/config/*.json → region", confidence: 0.9, note: "A region we have declared for a source we know is regional (e.g. a language-specific subreddit)." },
    { priority: 3, name: "guild_locale", api_field: "Discord guilds → preferred_locale", confidence: 0.8, note: "The Discord server's own declared locale." },
    { priority: 4, name: "content_language", api_field: "YouTube videos.list → defaultAudioLanguage / defaultLanguage; Twitch clips & streams → language", confidence: 0.7, note: "The language the content was published in." },
    { priority: 5, name: "text_language", api_field: "detected by the semantic scoring layer", confidence: 0.4, note: "Weakest signal — describes the commenter's language, not the publisher's. Used only where nothing better exists, and always reported at low confidence." },
  ],
  limitations: [
    "Global publisher channels (@PUBG, @WorldofWarcraft) declare a single country, so their whole catalogue lands in one bucket. Regional sub-channels would need to be tracked separately to get a genuine regional split for those titles.",
    "Twitch category-level data has no publisher country at all — it is classified by stream language, which is a proxy.",
    "'Undetermined' is shown honestly rather than defaulted to a region. Expect a meaningful share of records there until more regional sources are configured.",
  ],
};

module.exports = { classifyRegion, REGIONS, METHODOLOGY };
