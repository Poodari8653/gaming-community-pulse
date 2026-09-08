const { createClient } = require("@supabase/supabase-js");

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY
      )
    : null;

function toRecord(row, includeCollectedAt = false) {
  const record = {
    record_key: `${row.platform || ""}|${row.game || ""}|${row.source || ""}|${row.published_at || ""}|${row.author || ""}|${row.url || ""}|${row.text_content || row.text || ""}`,
    platform: row.platform || null,
    game: row.game || null,
    source: row.source || null,
    content_type: row.content_type || null,
    author: row.author || null,
    published_at: row.published_at || null,
    text_content: row.text_content || row.text || null,
    engagement: row.engagement ?? null,
    sentiment: row.sentiment || null,
    sentiment_score: row.sentiment_score ?? null,
    language: row.language || null,
    region: row.region || null,
    url: row.url || null,
    raw_data: row,
    updated_at: new Date().toISOString(),
  };

  if (includeCollectedAt) {
    record.collected_at = new Date().toISOString();
  }

  return record;
}

async function saveRawRecords(rows) {
  if (!supabase || !Array.isArray(rows) || rows.length === 0) {
    return { saved: false, count: 0 };
  }

  const records = rows
    .filter((row) => !row.is_sample && row.data_type !== "sample")
    .map((row) => toRecord(row, true));

  if (records.length === 0) {
    return { saved: false, count: 0 };
  }

  const { error } = await supabase
    .from("community_records")
    .upsert(records, { onConflict: "record_key" });

  if (error) {
    console.error("Supabase raw record save failed:", error.message);
    return { saved: false, count: 0, error: error.message };
  }

  console.log(`Supabase raw records saved: ${records.length}`);
  return { saved: true, count: records.length };
}

async function saveEnrichedRecords(rows) {
  if (!supabase || !Array.isArray(rows) || rows.length === 0) {
    return { saved: false, count: 0 };
  }

  const records = rows
    .filter((row) => !row.is_sample && row.data_type !== "sample")
    .map((row) => toRecord(row));

  if (records.length === 0) {
    return { saved: false, count: 0 };
  }

  const { error } = await supabase
    .from("community_records")
    .upsert(records, { onConflict: "record_key" });

  if (error) {
    console.error("Supabase enriched record save failed:", error.message);
    return { saved: false, count: 0, error: error.message };
  }

  console.log(`Supabase enriched records saved: ${records.length}`);
  return { saved: true, count: records.length };
}

module.exports = {
  saveRawRecords,
  saveEnrichedRecords,
};
