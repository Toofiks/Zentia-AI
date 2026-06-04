<div align="center">
  <br>
  <h1>🚀 Zentia AI: The Open-Source AI Business OS</h1>
  <p>
    <b>Autonomous AI SDRs, Intelligent CRM, and Financial Orchestration — Built for the Open Web.</b>
  </p>
  
  <a href="https://github.com/Toofiks/Zentia-AI/stargazers"><img src="https://img.shields.io/github/stars/Toofiks/Zentia-AI?style=for-the-badge&color=yellow" alt="Stars"></a>
  <a href="https://github.com/Toofiks/Zentia-AI/network/members"><img src="https://img.shields.io/github/forks/Toofiks/Zentia-AI?style=for-the-badge&color=blue" alt="Forks"></a>
  <a href="https://github.com/Toofiks/Zentia-AI/issues"><img src="https://img.shields.io/github/issues/Toofiks/Zentia-AI?style=for-the-badge&color=green" alt="Issues"></a>
  <a href="https://github.com/Toofiks/Zentia-AI/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-red.svg?style=for-the-badge" alt="License"></a>
</div>

<br>

Zentia is an open-source, AI-native business orchestration platform that democratizes access to intelligent CRM and financial automation. It provides a modular, self-hosted alternative to proprietary SaaS, integrating Stripe and LLMs (Google Gemini, OpenAI, OpenRouter) directly into core business logic.

As AI shifts from a "feature" to "infrastructure," Zentia serves as a critical framework for developers building the next generation of automated enterprises, ensuring transparency and data sovereignty for the OSS ecosystem.

## ✨ Why Zentia?

Most "AI Sales" tools are closed-source, expensive, and opaque with customer data. Zentia shifts the paradigm:
- **Data Sovereignty:** You host the DB (Supabase/PostgreSQL). Your customer data stays yours.
- **Model Agnostic:** Plug in Gemini, OpenAI, or any model via OpenRouter.
- **Native Monetization:** Stripe is deeply integrated for instant AI-driven subscriptions.
- **Autonomous Agents:** Agents capable of understanding text, vision, and voice context via Telegram, built to qualify leads and orchestrate bookings without human intervention.

## 🛠 Tech Stack

- **Core:** Node.js (Express)
- **AI/LLM:** `@google/generative-ai` (Gemini), `openai`, OpenRouter
- **Bot Interface:** `telegraf` (Telegram)
- **Database:** Supabase (PostgreSQL & Auth)
- **Payments:** `stripe`
- **Frontend:** Vanilla JS / HTML5 / CSS3 (Glassmorphism UI)

## 📦 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Toofiks/Zentia-AI.git
cd Zentia-AI
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory. *Ensure you never commit this file.*
```env
# AI Models
OPENROUTER_API_KEY=your_key
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key

# Supabase (Database & Auth)
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key

# Stripe (Monetization)
STRIPE_SECRET_KEY=your_key
STRIPE_WEBHOOK_SECRET=your_key
STRIPE_PRICE_ID_STARTER=...
```

### 4. Run the Engine
```bash
npm start
```

## 🤝 Contributing

We believe the future of enterprise software is Open Source. Whether you're fixing a bug, adding a new LLM provider, or writing documentation, your help is welcome!

Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting Pull Requests.

## 🛡️ License

Zentia is proudly open-source and dual-licensed. 
The public community version is licensed under the **GNU AGPLv3**. 
See the `LICENSE` file for more details. 

> *Note: AGPLv3 guarantees that any improvements made to Zentia and offered as a network service must also be made open-source. This protects the community from predatory commercial enclosure.*

---
<div align="center">
  <b>Built by the Open Source AI Community.</b>
</div>
