# Zentia AI - Autonomous Sales Agents for Telegram

Zentia AI is a high-performance platform for deploying and managing autonomous AI sales agents on Telegram. It automates top-of-funnel outreach, lead qualification, and meeting bookings.

## 🚀 Key Features
- **Instant Deployment:** Connect any Telegram bot token in seconds.
- **Multimodal AI:** Supports text, voice, and vision models (Gemini Flash & Pro).
- **Interactive Inbox:** Real-time chat management with lead status tracking.
- **Advanced Knowledge Base:** Upload PDFs/TXT to train your agents on your product.
- **CRM Integrations:** Native support for Webhooks and Google Sheets.
- **White-label Branding:** Remove "Powered by Zentia" on Enterprise plans.

## 🛠 Tech Stack
- **Frontend:** Vanilla JS, CSS3 (Modern Glassmorphism), HTML5.
- **Backend:** Node.js (Express).
- **Database:** Supabase (PostgreSQL & Auth).
- **AI Engine:** OpenRouter & Google Gemini API.
- **Payments:** Stripe Subscriptions.

## 📦 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/zentia-ai/zentia-bot.git
    cd zentia-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup Environment Variables:**
    Create a `.env` file in the root directory and add:
    ```env
    # AI API Keys
    OPENROUTER_API_KEY=your_key
    OPENAI_API_KEY=your_key (optional for voice)
    
    # Supabase (Admin)
    SUPABASE_URL=your_url
    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
    
    # Payments (Optional)
    STRIPE_SECRET_KEY=your_key
    STRIPE_WEBHOOK_SECRET=your_key
    STRIPE_PRICE_ID_STARTER=...
    STRIPE_PRICE_ID_PRO=...
    STRIPE_PRICE_ID_ENTERPRISE=...
    ```

4.  **Run the project:**
    ```bash
    npm start
    ```

## 📂 Project Architecture
- `index.js`: Main server entry point and bot orchestration.
- `script.js`: Frontend logic and Supabase integration.
- `index.html`: Main dashboard UI.
- `run_tests.js`: Comprehensive test suite.

## 🌐 Deployment
This project is ready to be deployed on platforms like **Railway**, **Render**, or **Vercel** (with a persistent server for bot polling).

## ⚖️ License
Distributed under the ISC License. See `LICENSE` for more information.

© 2026 Zentia AI Inc.