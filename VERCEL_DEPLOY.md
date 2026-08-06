# Deploying Gaming Community Pulse to Vercel

The repository has been configured for one-click deployment to Vercel with Node.js serverless function support for the live API endpoints (`/api/analysis`, `/api/health`) and automatic static serving of the Live Dashboard (`/`).

---

## 1. Code Pushed to GitHub

The code, along with Vercel configuration files (`vercel.json`, `package.json`, `api/index.js`), has been pushed to your GitHub repository:

- **Repository**: [https://github.com/Poodari8653/gaming-community-pulse](https://github.com/Poodari8653/gaming-community-pulse)
- **Branches**: `main` & `dev`

---

## 2. Deploying via Vercel Web Dashboard (Recommended)

1. Go to **[vercel.com/new](https://vercel.com/new)** and sign in (or sign up with GitHub).
2. Under **Import Git Repository**, select your repository: **`Poodari8653/gaming-community-pulse`**.
3. In the project setup screen:
   - **Framework Preset**: Leave as **Other** (Vercel automatically picks up `vercel.json`).
   - **Root Directory**: `./` (default).
4. Expand **Environment Variables** and add:
   - `YOUTUBE_API_KEY`: *(Your YouTube Data API v3 key)*
   - `DISCORD_BOT_TOKEN`: *(Optional - your Discord Bot token)*
5. Click **Deploy**.

Vercel will build your serverless functions and give you a live URL (e.g., `https://gaming-community-pulse-xxx.vercel.app`).

---

## 3. Deploying via Vercel CLI (Alternative)

If you prefer to deploy from the command line:

1. **Log in to Vercel CLI**:
   ```bash
   npx vercel login
   ```
2. **Deploy to production**:
   ```bash
   npx vercel --prod
   ```
3. **Set Environment Variables**:
   ```bash
   npx vercel env add YOUTUBE_API_KEY
   ```

---

## 4. Automatic Re-deployments

Any future push to your `main` branch will automatically trigger a new Vercel deployment:

```bash
git add .
git commit -m "Update application feature"
git push origin main
```
