# Setup Runbook — BLG Ad Creative Studio

Plain-English, click-by-click. You do this **once**. After it's done, you never
touch a terminal again — deploys happen automatically and all API keys are
managed inside the app on the Settings page.

There are three accounts to create (all have free tiers): **GitHub**,
**Supabase** (database), **Vercel** (hosting). Then you paste a few keys.

> You don't need to understand the code. Follow the steps in order. Anything in
> `monospace` is something to copy/paste. If a step needs a real developer
> hand (about 15 min total), that's flagged with 🛠️.

---

## 1. GitHub — hold the code

1. Create a free account at https://github.com if you don't have one.
2. Create a new **private** repository called `blg-ad-creative-studio`.
3. 🛠️ Push this project to it (a one-time command):
   ```bash
   cd ~/Projects/blg-ad-creative-studio
   git add -A && git commit -m "Initial foundation"
   git branch -M main
   git remote add origin https://github.com/<you>/blg-ad-creative-studio.git
   git push -u origin main
   ```

## 2. Supabase — the database + login + file storage

1. Sign up at https://supabase.com → **New project**. Name it `blg-ad-studio`.
   Pick a region near you and set a strong database password (save it).
2. When it finishes, open **Project Settings → API** and copy these three values
   (you'll paste them into Vercel in step 4):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(secret — never share)*
3. **Create the tables:** open **SQL Editor → New query**, open the file
   `supabase/migrations/0001_init.sql` from this project, copy its entire
   contents into the editor, and click **Run**. You should see "Success".
4. **Create the file bucket:** go to **Storage → New bucket**, name it
   `assets`, keep it **Private**, and create it. (This holds logos, fonts, and
   generated images.)
5. **Turn on email login:** **Authentication → Providers → Email** should be
   enabled (it is by default).

## 3. A master key for encrypting your API keys

Pick one long random passphrase — this encrypts the provider keys you'll store
in the app. **Save it somewhere safe (a password manager). If it's ever lost,
the stored keys must be re-entered.** Generate one:
```bash
openssl rand -base64 48
```
Copy the output — that's your `SECRETS_MASTER_KEY`.

## 4. Vercel — hosting (auto-deploys from GitHub)

1. Sign up at https://vercel.com with your GitHub account.
2. **Add New → Project** → import `blg-ad-creative-studio`.
3. Before clicking Deploy, open **Environment Variables** and add these 5:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | from step 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 2 |
   | `SECRETS_MASTER_KEY` | from step 3 |
   | `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://blg-ad-studio.vercel.app` |

4. Click **Deploy**. In ~2 minutes you'll have a live URL.
5. From now on, any update I push to GitHub redeploys automatically. **You never
   run a build.**

## 5. Create your login + workspace

1. Open your live URL and **Sign up** with your work email.
2. The first account becomes the **admin** and gets a workspace (org) created
   automatically. Invite teammates later (specialist / manager roles) from
   Settings → Team.

## 6. Provider API keys (paste in the app, not in code)

Go to **Settings → Integrations** in the app and paste each key. The app stores
them **encrypted**; you'll only ever see a masked hint afterward, and there's a
**Test connection** button for each.

| Key | Where to get it | Used for |
|-----|-----------------|----------|
| **Anthropic API key** | https://console.anthropic.com → API Keys | Hooks, copy, image prompts, and the vision text-design step |
| **Image gateway key + base URL** | A gateway that hosts Higgsfield **Soul** — e.g. [WaveSpeed](https://wavespeed.ai) or [Segmind](https://segmind.com). Create an account, get an API key. | Generating the hyper-real ad photos |
| **OpenAI API key** *(optional)* | https://platform.openai.com → API keys | Alternate image model (gpt-image-1) |
| **Google service account JSON** *(for v1 Slides export)* | Google Cloud console → IAM → Service Accounts → create key (JSON) | Auto-building the Google Slides deck |

> The exact image-gateway details (endpoint + which fields) get confirmed when
> you pick the gateway — that's a 10-minute wiring step on my side once you have
> the account.

## 7. Paste your image-prompt expertise

In **Settings → Brand defaults** (or per brand), paste the instructions from
your trained Claude image-prompt project. The tool uses them to write
photography-grade prompts automatically.

---

### What's automatic after setup
- **Deploys:** push to GitHub → live in ~2 min. I handle the pushes.
- **Keys:** rotate anytime in Settings, no redeploy.
- **Backups:** Supabase keeps daily backups on paid tiers.

### If something looks wrong
- App won't load right after deploy → check all 5 Vercel env vars are set, then
  redeploy (Vercel → Deployments → ⋯ → Redeploy).
- "Missing X for this workspace" → add that key in Settings → Integrations.
