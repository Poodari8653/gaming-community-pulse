# Deploying to Render

I've prepped everything I can from here: the project is now a local git repo
with an initial commit, `.env` and `node_modules` are excluded, and there's a
`render.yaml` that tells Render exactly how to build and run the server.

Two things I deliberately left for you to do by hand, on your own machine:
pushing to GitHub (needs your GitHub login) and entering your API keys into
Render's dashboard (I don't handle credentials or create accounts on your
behalf). It's about 5 minutes.

## 1. Push the code to GitHub

If you don't already have a GitHub repo for this project:

1. Go to [github.com/new](https://github.com/new), create a repo (e.g.
   `gaming-community-pulse`), **don't** initialize it with a README.
2. In a terminal, on your own machine:

```bash
cd ~/Desktop/RS2
git remote add origin https://github.com/<your-username>/gaming-community-pulse.git
git branch -M main
git push -u origin main
```

## 2. Create a Render account and new Web Service

1. Go to [render.com](https://render.com) and sign up (free tier is fine).
2. Click **New +** → **Blueprint**, and point it at your GitHub repo.
   Render will read `render.yaml` automatically and pre-fill the service
   (name `gaming-community-pulse`, root dir `server`, build/start commands).
   - If you'd rather set it up manually instead of via Blueprint: **New +**
     → **Web Service** → select the repo → set **Root Directory** to
     `server`, **Build Command** to `npm install`, **Start Command** to
     `npm start`.

## 3. Add your environment variables

Render will prompt for the two variables marked `sync: false` in
`render.yaml`. In the service's **Environment** tab, add:

| Key | Value |
|---|---|
| `YOUTUBE_API_KEY` | your key from `server/.env` locally |
| `DISCORD_BOT_TOKEN` | your bot token from `server/.env` locally |
| `TWITCH_CLIENT_ID` | your Client ID from `server/.env` locally |
| `TWITCH_CLIENT_SECRET` | your Client Secret from `server/.env` locally |

Don't set `PORT` — Render assigns it automatically and `server.js` already
reads `process.env.PORT`.

One more thing worth doing while you're in there: since the Discord bot
token and Twitch Client ID/Secret were pasted in this chat, it's good
hygiene to regenerate them before or after deploying — Discord in the
[Developer Portal](https://discord.com/developers/applications) (Bot →
Reset Token), Twitch in the [developer console](https://dev.twitch.tv/console)
(open the app → New Secret) — and use the fresh values here instead of the
originals.

## 4. Deploy

Click **Create Web Service** (or **Apply** if using the Blueprint). Render
will install dependencies and start the server. First deploy takes a couple
minutes. You'll get a public URL like
`https://gaming-community-pulse.onrender.com`.

**Note on the free tier:** it spins down after 15 minutes of inactivity, so
the first request after idle time takes ~30-50 seconds to wake back up.
Fine for a demo/presentation link; if you need it always-on, upgrade the
service to a paid instance type later.

## 5. Verify it's live

Open the Render URL and confirm:
- The dashboard loads and the data-source banner shows YouTube (and Discord,
  if configured) as live.
- `https://<your-app>.onrender.com/api/health` returns
  `youtubeApiKeyConfigured: true` (and `discordBotTokenConfigured: true` if
  you added that key too).

## Future pushes

Any time you want to update the deployed version, just commit and push from
your machine — Render auto-deploys on every push to `main`:

```bash
git add -A
git commit -m "describe your change"
git push
```
