# Zentia AI - Full Deployment & Sales Documentation

Welcome to the complete Zentia AI package. This document explains everything about the product, how to deploy it, how the AI architecture works, and how your buyers can use it.

## 1. Product Overview
Zentia AI is a self-hosted, multi-tenant "AI Sales Development Representative" (SDR) platform. It allows users to deploy autonomous Telegram bots that qualify leads, handle objections, and book meetings.

### Core Value Proposition (For Your Buyers)
*   **Scale Outbound:** Replaces manual human texting with AI that operates 24/7.
*   **Multi-Bot Architecture:** One account can manage dozens of different bots for different marketing campaigns.
*   **RAG (Retrieval-Augmented Generation):** Upload PDFs to teach the bot about the product.
*   **Native CRM Sync:** Push "Meeting Booked" events to HubSpot/Salesforce via Webhooks.

---

## 2. Technical Architecture
*   **Backend:** Node.js (Express), Telegraf (Telegram API).
*   **Database:** Supabase (PostgreSQL with Row Level Security).
*   **AI Engine:** OpenRouter (Gemini 2.5 Flash / Pro, Gemini 3.0). OpenAI (Whisper) for voice transcription.
*   **Frontend:** Vanilla JS / HTML / CSS (Single Page Application). No heavy build steps (React/Vue), meaning it loads instantly and is extremely easy to modify.
*   **Payments:** Stripe Checkout / Webhooks.

---

## 3. How to Deploy (Step-by-Step)

### A. Database (Supabase) Setup
1. Create a free account at [Supabase.com](https://supabase.com).
2. Create a new Project.
3. Go to the **SQL Editor** in the left menu.
4. Open the `supabase_schema.sql` file (included in this bundle), copy its contents, and run it. This creates the tables.
5. Open the `supabase_rls.sql` file, copy, and run it. This secures the database.
6. Go to **Project Settings -> API**. Copy the `Project URL` and `service_role` secret. 
   *(Crucial: You must use the `service_role` key, NOT the `anon` key, because the backend relies on server-side privileges to sync background bot activities).*

### B. Environment Variables (`.env`)
Create a `.env` file in the root directory and fill it out:

```env
# Supabase
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJh..."

# AI Providers
OPENROUTER_API_KEY="sk-or-v1-..."
OPENAI_API_KEY="sk-proj-..." # Only needed if you want voice messages transcribed

# Stripe (Optional, for charging your users)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_PRO="price_1..."
STRIPE_PRICE_ID_ENTERPRISE="price_1..."

# Domain
DOMAIN_URL="https://zentia.ai"
```

### C. Server Deployment
We recommend **Render.com**, **Railway.app**, or a standard VPS (DigitalOcean / Hetzner).

**If using a VPS (Ubuntu):**
1. Install Node.js: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
2. Install PM2: `npm install -g pm2`
3. Clone your code.
4. Run `npm install`
5. Run `pm2 start index.js --name zentia`
6. Run `pm2 save`

**Domain & SSL (Nginx):**
Point your domain to the VPS IP, install Nginx, and use Certbot (`sudo certbot --nginx`) to get a free HTTPS certificate. Proxy pass port 80/443 to `localhost:3000`.

---

## 4. How the User Experience Works (The Flow)

1.  **Registration:** User creates an account.
2.  **Bot Creation:** User talks to `@BotFather` on Telegram, gets a token, and pastes it into Zentia.
3.  **Prompt Wizard:** User writes "I sell real estate". The AI expands this into a strict system prompt forbidding formatting and enforcing the goal.
4.  **Knowledge Base:** User uploads a PDF brochure.
5.  **Launch:** The bot comes online instantly.
6.  **The Chat:** A customer messages the Telegram bot. The bot uses Gemini 2.5 and the PDF context to answer. 
7.  **The Goal:** Once the customer says "Sure, let's meet", the bot triggers the `[MEETING_BOOKED]` flag internally.
8.  **The Result:** Zentia intercepts the flag, adds the user to the "Live Inbox", fires a Webhook to Zapier (syncing to HubSpot), and sends a Telegram notification to the bot owner.

---

## 5. Monetization & Stripe

Zentia is pre-wired for SaaS billing.
*   **Free Plan:** 1 Agent limit.
*   **Pro Plan:** 10 Agents limit, custom OpenRouter keys, Webhooks.
*   Users click "Upgrade", pay via Stripe Checkout. Stripe pings your `/api/stripe/webhook` endpoint, which updates their `user_metadata.plan` to `'pro'` in Supabase.
*   See `STRIPE_SETUP.md` for exact configuration steps.

---

## 6. Maintenance & Best Practices
*   **Logs:** Use `pm2 logs zentia` to monitor bot activity.
*   **Rate Limits:** The server uses `express-rate-limit`. Do not remove it, or users might spam your OpenRouter key.
*   **Custom API Keys:** Pro users can provide their own OpenRouter keys in Settings. When they do, the server uses *their* key, meaning their AI token costs do not drain your balance.

You are now ready to sell and operate Zentia AI.
