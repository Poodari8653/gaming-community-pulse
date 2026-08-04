#!/usr/bin/env python3
"""Builds the single-file dashboard.html by embedding analysis.json + a
trimmed master_dataset sample directly as inline JSON."""
import json
import csv

with open("data/processed/analysis.json", encoding="utf-8") as f:
    analysis = json.load(f)

records = []
with open("data/processed/master_dataset.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        records.append({
            "platform": r["platform"], "data_type": r["data_type"], "game": r["game"],
            "source": r["source"], "content_type": r["content_type"], "timestamp": r["timestamp"],
            "text": r["text"], "score": int(r["score"]) if r["score"] else 0,
            "sentiment_label": r["sentiment_label"],
            "sentiment_score": float(r["sentiment_score"]) if r["sentiment_score"] else 0,
        })

ANALYSIS_JSON = json.dumps(analysis)
RECORDS_JSON = json.dumps(records)

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gaming Community Pulse — Prototype Dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0f1117;
    --panel: #171a24;
    --panel-border: #262b3a;
    --text: #e8eaf0;
    --muted: #9aa1b4;
    --accent: #6c8cff;
    --pos: #3ecf8e;
    --neg: #ff6b6b;
    --neu: #f5c451;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5;
  }
  header {
    padding: 28px 32px 20px; border-bottom: 1px solid var(--panel-border);
    background: linear-gradient(180deg, #171a24, #0f1117);
  }
  header h1 { margin: 0 0 6px; font-size: 24px; font-weight: 700; }
  header p.sub { margin: 0; color: var(--muted); font-size: 14px; max-width: 900px; }
  .banner {
    margin-top: 14px; padding: 10px 14px; border-radius: var(--radius);
    background: #1d2333; border: 1px solid #2c3550; font-size: 13px; color: var(--muted);
  }
  .banner b { color: var(--text); }
  .legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
  main { max-width: 1280px; margin: 0 auto; padding: 24px 32px 60px; }
  .controls {
    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px;
  }
  .chip {
    padding: 7px 14px; border-radius: 999px; border: 1px solid var(--panel-border);
    background: var(--panel); color: var(--muted); font-size: 13px; cursor: pointer;
    transition: all .15s;
  }
  .chip:hover { border-color: var(--accent); color: var(--text); }
  .chip.active { background: var(--accent); color: #0b0d13; border-color: var(--accent); font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px; margin-bottom: 24px; }
  .kpi { background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius); padding: 16px 18px; }
  .kpi .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .kpi .value.pos { color: var(--pos); } .kpi .value.neg { color: var(--neg); }
  .grid2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; margin-bottom: 18px; }
  .grid2b { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
  @media (max-width: 900px) { .grid2, .grid2b { grid-template-columns: 1fr; } }
  .panel {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius);
    padding: 18px 20px;
  }
  .panel h2 { margin: 0 0 4px; font-size: 15px; font-weight: 700; }
  .panel p.desc { margin: 0 0 14px; color: var(--muted); font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--panel-border); }
  th { color: var(--muted); font-weight: 600; font-size: 11.5px; text-transform: uppercase; letter-spacing: .03em; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .tag.positive { background: rgba(62,207,142,.15); color: var(--pos); }
  .tag.negative { background: rgba(255,107,107,.15); color: var(--neg); }
  .tag.neutral { background: rgba(245,196,81,.15); color: var(--neu); }
  .platform-tag { font-size: 11px; color: var(--muted); border: 1px solid var(--panel-border); border-radius: 6px; padding: 1px 6px; }
  .post-card {
    padding: 10px 0; border-bottom: 1px solid var(--panel-border); font-size: 13.5px;
  }
  .post-card:last-child { border-bottom: none; }
  .post-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 11.5px; color: var(--muted); }
  .search-row { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  input[type=text], select {
    background: #10131c; border: 1px solid var(--panel-border); color: var(--text);
    padding: 8px 10px; border-radius: 8px; font-size: 13px;
  }
  .scroll-table { max-height: 360px; overflow-y: auto; }
  footer { color: var(--muted); font-size: 12px; padding: 20px 32px 40px; border-top: 1px solid var(--panel-border); }
  a { color: var(--accent); }
</style>
</head>
<body>

<header>
  <h1>Gaming Community Pulse — Prototype Dashboard</h1>
  <p class="sub">Social listening prototype covering public discussion of PUBG, Once Human, Marvel Rivals, Where Winds Meet, and World of Warcraft across Reddit, Discord, and YouTube.</p>
  <div class="banner">
    <span class="legend-dot" style="background:#6c8cff"></span><b>YouTube data is real</b> — collected live from public video comment sections on 2026-07-30.
    &nbsp;&nbsp;
    <span class="legend-dot" style="background:#9aa1b4"></span><b>Reddit and Discord data is illustrative/synthetic</b> — modeled on realistic public discourse patterns because Reddit is not reachable and Discord requires server-specific access this prototype doesn't have. See methodology doc for details and how to switch to live feeds.
  </div>
</header>

<main>
  <div class="controls" id="gameFilter"></div>

  <div class="kpis" id="kpiRow"></div>

  <div class="grid2">
    <div class="panel">
      <h2>Weekly discussion volume (8-week window)</h2>
      <p class="desc">Reddit + Discord post/message volume by week — spikes indicate a trailer drop, patch, or announcement.</p>
      <canvas id="volumeChart" height="140"></canvas>
    </div>
    <div class="panel">
      <h2>Sentiment mix</h2>
      <p class="desc">Share of positive / neutral / negative discussion, all platforms combined.</p>
      <canvas id="sentimentChart" height="140"></canvas>
    </div>
  </div>

  <div class="grid2b">
    <div class="panel">
      <h2>Engagement by game</h2>
      <p class="desc">Total upvotes / likes / reactions across all collected records.</p>
      <canvas id="engagementChart" height="160"></canvas>
    </div>
    <div class="panel">
      <h2>Recurring themes</h2>
      <p class="desc">Most common discussion themes and their average sentiment (Reddit + Discord sample).</p>
      <div class="scroll-table"><table id="themeTable"><thead><tr><th>Theme</th><th>Mentions</th><th>Sentiment</th></tr></thead><tbody></tbody></table></div>
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2>Top posts &amp; comments</h2>
      <p class="desc">Highest-engagement content in the current selection.</p>
      <div id="topPosts"></div>
    </div>
    <div class="panel">
      <h2>Recurring questions</h2>
      <p class="desc">Community questions worth a FAQ, patch note, or creator briefing.</p>
      <div id="questionsList"></div>
    </div>
  </div>

  <div class="panel">
    <h2>Browse raw sample data</h2>
    <p class="desc">Search across all collected records (real YouTube + illustrative Reddit/Discord samples).</p>
    <div class="search-row">
      <input type="text" id="searchBox" placeholder="Search text..." style="flex:1; min-width:220px;">
      <select id="platformFilter">
        <option value="">All platforms</option>
        <option value="Reddit">Reddit</option>
        <option value="Discord">Discord</option>
        <option value="YouTube">YouTube</option>
      </select>
      <select id="sentimentFilter">
        <option value="">All sentiment</option>
        <option value="positive">Positive</option>
        <option value="neutral">Neutral</option>
        <option value="negative">Negative</option>
      </select>
    </div>
    <div class="scroll-table">
      <table id="dataTable">
        <thead><tr><th>Game</th><th>Platform</th><th>Type</th><th>Text</th><th>Score</th><th>Sentiment</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</main>

<footer>
  Prototype built for research/placement purposes. YouTube comment data is real public data collected 2026-07-30; Reddit and Discord data is clearly-labeled illustrative sample data. See methodology &amp; limitations document for full data collection notes and how to extend this into a live feed.
</footer>

<script>
const ANALYSIS = __ANALYSIS_JSON__;
const RECORDS = __RECORDS_JSON__;
const GAMES = ANALYSIS.games;
let currentGame = "All";

const COLORS = ["#6c8cff", "#3ecf8e", "#f5c451", "#ff6b6b", "#b98cff"];
const gameColor = {};
GAMES.forEach((g,i) => gameColor[g] = COLORS[i % COLORS.length]);

function fmtNum(n){ return n.toLocaleString(); }

function buildFilterChips(){
  const el = document.getElementById("gameFilter");
  const all = ["All", ...GAMES];
  el.innerHTML = all.map(g => `<div class="chip ${g===currentGame?'active':''}" data-game="${g}">${g}</div>`).join("");
  el.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      currentGame = chip.dataset.game;
      renderAll();
    });
  });
}

function selectedRecords(){
  if (currentGame === "All") return RECORDS;
  return RECORDS.filter(r => r.game === currentGame);
}

function renderKPIs(){
  const recs = selectedRecords();
  const n = recs.length;
  const avgSent = n ? recs.reduce((a,r)=>a+r.sentiment_score,0)/n : 0;
  const totalEng = recs.reduce((a,r)=>a+r.score,0);
  const realCount = recs.filter(r=>r.data_type==="real").length;
  const kpis = [
    {label:"Records in view", value: fmtNum(n)},
    {label:"Avg. sentiment", value: (avgSent>=0?"+":"")+avgSent.toFixed(2), cls: avgSent>0.05?"pos":(avgSent<-0.05?"neg":"")},
    {label:"Total engagement", value: fmtNum(totalEng)},
    {label:"Real (YouTube) records", value: fmtNum(realCount)},
  ];
  document.getElementById("kpiRow").innerHTML = kpis.map(k => `
    <div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls||''}">${k.value}</div></div>
  `).join("");
}

let volumeChartInst, sentimentChartInst, engagementChartInst;

function renderVolumeChart(){
  const ctx = document.getElementById("volumeChart");
  const gamesToShow = currentGame === "All" ? GAMES : [currentGame];
  const labels = ANALYSIS.weekly_volume[GAMES[0]].map(w => w.week);
  const datasets = gamesToShow.map(g => ({
    label: g,
    data: ANALYSIS.weekly_volume[g].map(w => w.count),
    borderColor: gameColor[g],
    backgroundColor: gameColor[g]+"33",
    tension: .3,
    fill: false,
  }));
  if (volumeChartInst) volumeChartInst.destroy();
  volumeChartInst = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#9aa1b4" } } },
      scales: {
        x: { ticks: { color: "#9aa1b4" }, grid: { color: "#262b3a" } },
        y: { ticks: { color: "#9aa1b4" }, grid: { color: "#262b3a" }, beginAtZero: true }
      }
    }
  });
}

function renderSentimentChart(){
  const ctx = document.getElementById("sentimentChart");
  const gamesToShow = currentGame === "All" ? GAMES : [currentGame];
  const pos = gamesToShow.map(g => ANALYSIS.sentiment_distribution[g].positive);
  const neu = gamesToShow.map(g => ANALYSIS.sentiment_distribution[g].neutral);
  const neg = gamesToShow.map(g => ANALYSIS.sentiment_distribution[g].negative);
  if (sentimentChartInst) sentimentChartInst.destroy();
  sentimentChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: gamesToShow,
      datasets: [
        { label: "Positive", data: pos, backgroundColor: "#3ecf8e" },
        { label: "Neutral", data: neu, backgroundColor: "#f5c451" },
        { label: "Negative", data: neg, backgroundColor: "#ff6b6b" },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#9aa1b4" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#9aa1b4" }, grid: { display:false } },
        y: { stacked: true, ticks: { color: "#9aa1b4" }, grid: { color: "#262b3a" } }
      }
    }
  });
}

function renderEngagementChart(){
  const ctx = document.getElementById("engagementChart");
  if (engagementChartInst) engagementChartInst.destroy();
  engagementChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels: GAMES,
      datasets: [{
        label: "Total engagement score",
        data: GAMES.map(g => ANALYSIS.by_game[g].total_engagement_score),
        backgroundColor: GAMES.map(g => gameColor[g]),
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9aa1b4" }, grid: { color: "#262b3a" } },
        y: { ticks: { color: "#9aa1b4" }, grid: { display:false } }
      }
    }
  });
}

function renderThemeTable(){
  const tbody = document.querySelector("#themeTable tbody");
  let themes = [];
  const gamesToShow = currentGame === "All" ? GAMES : [currentGame];
  gamesToShow.forEach(g => { themes = themes.concat(ANALYSIS.top_themes[g].map(t => ({...t, game:g}))); });
  themes.sort((a,b) => b.count - a.count);
  themes = themes.slice(0, 10);
  tbody.innerHTML = themes.map(t => {
    const cls = t.avg_sentiment>0.05?"positive":(t.avg_sentiment<-0.05?"negative":"neutral");
    return `<tr><td>${t.theme} <span class="platform-tag">${t.game}</span></td><td>${t.count}</td><td><span class="tag ${cls}">${t.avg_sentiment>=0?'+':''}${t.avg_sentiment.toFixed(2)}</span></td></tr>`;
  }).join("");
}

function renderTopPosts(){
  const el = document.getElementById("topPosts");
  let posts = [];
  const gamesToShow = currentGame === "All" ? GAMES : [currentGame];
  gamesToShow.forEach(g => { posts = posts.concat(ANALYSIS.top_posts[g].map(p => ({...p, game:g}))); });
  posts.sort((a,b) => b.score - a.score);
  posts = posts.slice(0, 8);
  el.innerHTML = posts.map(p => `
    <div class="post-card">
      <div>${p.text}</div>
      <div class="post-meta">
        <span class="platform-tag">${p.platform}</span>
        <span class="platform-tag">${p.game}</span>
        <span class="tag ${p.sentiment_label}">${p.sentiment_label}</span>
        <span>👍 ${fmtNum(p.score)}</span>
      </div>
    </div>
  `).join("");
}

function renderQuestions(){
  const el = document.getElementById("questionsList");
  let qs = [];
  const gamesToShow = currentGame === "All" ? GAMES : [currentGame];
  gamesToShow.forEach(g => {
    const gq = (ANALYSIS.recurring_questions && ANALYSIS.recurring_questions[g]) || [];
    qs = qs.concat(gq.map(q => ({...q, game:g})));
  });
  qs.sort((a,b) => b.score - a.score);
  qs = qs.slice(0, 8);
  if (qs.length === 0){
    el.innerHTML = `<p style="color:var(--muted); font-size:13px;">No recurring questions surfaced in this selection.</p>`;
    return;
  }
  el.innerHTML = qs.map(q => `
    <div class="post-card">
      <div>${q.text}</div>
      <div class="post-meta">
        <span class="platform-tag">${q.platform}</span>
        <span class="platform-tag">${q.game}</span>
        <span>👍 ${fmtNum(q.score)}</span>
      </div>
    </div>
  `).join("");
}

function renderDataTable(){
  const tbody = document.querySelector("#dataTable tbody");
  const search = document.getElementById("searchBox").value.toLowerCase();
  const platform = document.getElementById("platformFilter").value;
  const sentiment = document.getElementById("sentimentFilter").value;
  let recs = selectedRecords();
  if (search) recs = recs.filter(r => r.text.toLowerCase().includes(search));
  if (platform) recs = recs.filter(r => r.platform === platform);
  if (sentiment) recs = recs.filter(r => r.sentiment_label === sentiment);
  recs = recs.slice(0, 150);
  tbody.innerHTML = recs.map(r => `
    <tr>
      <td>${r.game}</td>
      <td><span class="platform-tag">${r.platform}${r.data_type==='real'?' ✓':''}</span></td>
      <td>${r.content_type}</td>
      <td style="max-width:420px;">${r.text}</td>
      <td>${fmtNum(r.score)}</td>
      <td><span class="tag ${r.sentiment_label}">${r.sentiment_label}</span></td>
    </tr>
  `).join("");
}

function renderAll(){
  buildFilterChips();
  renderKPIs();
  renderVolumeChart();
  renderSentimentChart();
  renderEngagementChart();
  renderThemeTable();
  renderTopPosts();
  renderQuestions();
  renderDataTable();
}

document.getElementById("searchBox").addEventListener("input", renderDataTable);
document.getElementById("platformFilter").addEventListener("change", renderDataTable);
document.getElementById("sentimentFilter").addEventListener("change", renderDataTable);

renderAll();
</script>

</body>
</html>
"""

HTML = HTML.replace("__ANALYSIS_JSON__", ANALYSIS_JSON).replace("__RECORDS_JSON__", RECORDS_JSON)

with open("dashboard.html", "w", encoding="utf-8") as f:
    f.write(HTML)

print("Wrote dashboard.html", len(HTML), "bytes")
