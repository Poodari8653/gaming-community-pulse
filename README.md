# Gaming Community Pulse — Prototype

Open this whole folder in VS Code (`File > Open Folder...`) to browse everything together. Structure:

```
.
├── dashboard.html          ← STATIC snapshot dashboard (30 Jul 2026). Double-click to open in a browser.
├── server/                 ← LIVE dashboard — Node/Express server pulling real-time YouTube data
│   ├── README.md              (see this file for setup — takes 2 commands)
│   ├── server.js
│   ├── .env                   (your YouTube API key lives here)
│   ├── config/channels.json   (which YouTube channel is tracked per game)
│   └── public/dashboard-live.html   (has a drag-to-select time-range slider)
├── report/
│   ├── GAMING_COMMUNITY_PULSE_REPORT.md   ← Full report: findings + methodology + recommendations
│   │                                         (open in VS Code, Cmd+Shift+V for rendered preview)
│   ├── findings_summary.docx              ← Same content as Word doc, marketing-audience version
│   ├── methodology_and_limitations.docx   ← Data collection, scope, and limitations detail
│   └── recommendations.docx               ← Recommendations for marketing use
├── slides/
│   └── summary_deck.pptx   ← Slide-deck version for presenting
├── data/
│   ├── raw/                ← Real YouTube comment captures (5 games, JSON) — the original one-time capture
│   └── processed/          ← Combined dataset (CSV) + aggregated analysis (JSON) used by the static dashboard
└── scripts/                ← Python/Node scripts that generated the synthetic data, analysis, static dashboard,
                                docs, and slide deck (kept for reproducibility/transparency)
```

## Quick start

- **Want the live dashboard (real YouTube data, refreshed on demand)?**
  ```bash
  cd server
  npm install
  npm start
  ```
  Then open **http://localhost:3000**. See `server/README.md` for full details (tracked videos, quota, adding Discord).
- **Just want the summary?** Open `report/GAMING_COMMUNITY_PULSE_REPORT.md` in VS Code and preview it.
- **Want the original static snapshot?** Open `dashboard.html` directly in any browser — no server needed, but data is frozen as of 30 Jul 2026.
- **Want the raw numbers?** Look in `data/processed/analysis.json` and `data/processed/master_dataset.csv`.

## Data note

The **live server** (`server/`) fetches real YouTube comments and stats on demand via the YouTube Data API. Reddit and Discord data is still illustrative/synthetic in both the live and static versions — see `server/README.md` section 5 for how to bring Discord live, and the report's Methodology section for why Reddit isn't yet.
