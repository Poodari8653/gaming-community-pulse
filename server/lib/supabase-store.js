const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function toRecord(row, includeCollectedAt = false) {
  const publishedAt = row.published_at || row.timestamp || null;
  const textContent = row.text_content || row.text || null;
  const sentiment = row.sentiment || row.sentiment_label || null;
  const engagement =
    row.engagement ?? row.engagement_index ?? null;

  const record = {
    record_key: [
      row.platform || "",
      row.game || "",
      row.source || "",
      publishedAt || "",
      row.author || "",
      row.url || "",
      textContent || "",
    ].join("|"),

    platform: row.platform || null,
    game: row.game || null,
    source: row.source || null,
    content_type: row.content_type || null,
    author: row.author || null,
    published_at: publishedAt,
    text_content: textContent,
    engagement,
    sentiment,
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

async function upsertRecords(records) {
  if (!isConfigured()) {
    return {
      saved: false,
      count: 0,
      error: "Supabase environment variables are not configured",
    };
  }

  const url =
    `${SUPABASE_URL}/rest/v1/community_records` +
    `?on_conflict=record_key`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(records),
    });

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Supabase record save failed:",
        response.status,
        errorText
      );

      return {
        saved: false,
        count: 0,
        error: `${response.status}: ${errorText}`,
      };
    }

    return {
      saved: true,
      count: records.length,
    };
  } catch (error) {
    console.error("Supabase request failed:", error.message);

    return {
      saved: false,
      count: 0,
      error: error.message,
    };
  }
}

async function saveRawRecords(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { saved: false, count: 0 };
  }

  const records = rows
    .filter(
      (row) =>
        !row.is_sample &&
        row.data_type !== "sample"
    )
    .map((row) => toRecord(row, true));

  if (records.length === 0) {
    return { saved: false, count: 0 };
  }

  const result = await upsertRecords(records);

  if (result.saved) {
    console.log(
      `Supabase raw records saved: ${result.count}`
    );
  }

  return result;
}

async function saveEnrichedRecords(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { saved: false, count: 0 };
  }

  const records = rows
    .filter(
      (row) =>
        !row.is_sample &&
        row.data_type !== "sample"
    )
    .map((row) => toRecord(row));

  if (records.length === 0) {
    return { saved: false, count: 0 };
  }

  const result = await upsertRecords(records);

  if (result.saved) {
    console.log(
      `Supabase enriched records saved: ${result.count}`
    );
  }

  return result;
}

module.exports = {
  saveRawRecords,
  saveEnrichedRecords,
};