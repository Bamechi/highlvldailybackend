---
title: "HIGH - LVL DAILY Rundown — Setup Guide v1.0"
author: "Prepared for B. Amechi · High Lvl Media · September 16, 2026"
---

# Bottom line

Three surfaces, one database. The Producer Desk (`/desk`) is where the rundown is built. The Stage (`/stage?k=…`) is the branded 1920x1080 view you share in Restream. The Telegram bot drops links into the backlog and takes plain-English commands. Every change made anywhere reaches the Stage in under a second once you press Publish (or send `/publish`).

Site shown on air: **19keys.com/daily** (ticker, standby screen, ad cards, agenda header).

# 1. Supabase (the database) — 10 minutes

1. Go to supabase.com, create a free project named `high-lvl-daily`. Choose the US West region.
2. Open **SQL Editor → New query**, paste the whole contents of `supabase/schema.sql`, press **Run**.
3. Open **Project Settings → API**. Copy three values: Project URL, `anon` public key, `service_role` secret key.
4. Open `assets/config.js` in the repo and paste the Project URL and the anon key. The anon key is safe in the browser: it can only read.

# 2. GitHub → Vercel — 10 minutes

1. Push the `hld` folder to a new GitHub repo (`high-lvl-daily-rundown`).
2. In Vercel, **Add New → Project**, import the repo. Framework preset: **Other**. No build command. Deploy.
3. In **Settings → Environment Variables**, add every line from `.env.example`:

| Variable | Value |
|---|---|
| SUPABASE_URL | Project URL from step 1 |
| SUPABASE_SERVICE_ROLE_KEY | service_role key from step 1 |
| DESK_PASSWORD | `vanta` (both `vanta` and `VANTA` unlock; the check is case-insensitive) |
| SESSION_SECRET | any long random string (signs the login cookie) |
| STAGE_KEY | any long random string (the Stage URL is `/stage?k=STAGE_KEY`) |
| TELEGRAM_BOT_TOKEN | from BotFather (section 4) |
| TELEGRAM_WEBHOOK_SECRET | any random string |
| TELEGRAM_ALLOWED_IDS | leave empty on the first deploy |
| ANTHROPIC_API_KEY | from console.anthropic.com (powers free-text Telegram commands) |
| CLAUDE_MODEL | `claude-sonnet-5` |
| PUBLIC_BASE_URL | `https://19keys.com/daily` or your rundown subdomain |

4. **Settings → Domains**: attach the domain or subdomain for the tool. Redeploy.
5. Open the site. Unlock with VANTA. You land on `/desk`.

Where the tool lives versus where the audience goes: `19keys.com/daily` is the public follow-up page. The rundown tool should sit on its own subdomain (for example `rundown.19keys.com` or `desk.19keys.com`) so the public page and the private tool never collide.

# 3. Restream

1. Open Restream Studio, **Add Scene → Media → Screen**, pick the browser tab showing `/stage?k=STAGE_KEY`, or use **Add a browser source** with that URL.
2. Double-click the Stage for fullscreen. The Stage scales itself to any window size and hides the cursor.
3. Keep the Desk open on a second screen or your phone. Arrow keys drive the Stage, **A** shows the agenda, **S** goes to standby.

# 4. Telegram — 15 minutes

1. In Telegram open **@BotFather**, send `/newbot`. Name: `HIGH - LVL Daily Producer`. Username: `highlvldaily_bot` (or similar). Copy the token into Vercel as `TELEGRAM_BOT_TOKEN`.
2. Send `/setprivacy`, choose the bot, choose **Disable**. Without this the bot only sees messages that @mention it inside a group.
3. Redeploy on Vercel so the token is live.
4. Register the webhook by opening this URL once in a browser (fill in your values):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-domain>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&drop_pending_updates=true
```

   It must return `{"ok":true,"result":true}`.

5. Create a group **HIGH - LVL Daily Producers**. Add 19Keys and the bot.
6. You and Keys each send `/id`. The bot replies with your numeric Telegram IDs.
7. In Vercel set `TELEGRAM_ALLOWED_IDS` to both IDs, comma-separated (`12345678,87654321`). Redeploy. Everyone else is now ignored silently.
8. Back in BotFather, `/setjoingroups` → **Disable**, so the bot cannot be added anywhere else.
9. Test: paste an X link in the group. It returns a card with **Queue it / Opinion frame / Trash** buttons and appears in the Desk backlog.

## Telegram commands

| Command | Effect |
|---|---|
| any link | reads it and drops it in the backlog (add a note on the next line = talking points) |
| plain English | "move 3 to the top", "build the agenda", "delete B2", "make 4 an opinion" |
| /list | rundown and backlog with numbers |
| /queue B2 · /unqueue 4 · /delete 3 | move and remove |
| /publish | push the rundown to the Stage |
| /next · /prev · /go 5 | drive the Stage |
| /agenda · /standby | Stage modes |
| /ticker text · /ticker reset | custom ticker line |

Deletes always ask for a tap to confirm. Free-text commands cost one Claude call each; slash commands are free.

# 5. How the show runs

1. Before the show: links arrive through Telegram all day. On the Desk, queue the ones you want, drag them into order, drop segment cards and ad breaks with the quick-card buttons, press **Publish**.
2. Show open: Stage on standby shows the wordmark and 19keys.com/daily. Press → to start.
3. During the show: → and ← move through items. Typo fix: click the headline, edit, **Publish changes**. The Stage swaps cleanly.
4. Ad break: the ad card shows the Supermind plate, a countdown, and the next topic. The Desk "Ad secs" field sets the length.
5. Opinion items get the red frame automatically when the frame is set to Opinion.

# 6. Local preview without a backend

`python3 scripts/build-demo.py && python3 -m http.server 4141` then open `http://localhost:4141/demo.html`. Data stays in the browser.

# 7. Security notes

- VANTA is the convenience gate. The real locks are `STAGE_KEY`, the signed cookie, and the Telegram ID allowlist. Rotate `STAGE_KEY` in Vercel if the Stage URL ever leaks.
- All writes go through Vercel functions with the service key. The browser's anon key can only read.
- Only public X and Instagram posts can be read. Private or deleted posts fall back to a plain card with the link's hostname.
