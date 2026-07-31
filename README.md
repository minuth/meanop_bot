# 🤖 MeaNop Bot - Standalone AI Telegram Chatbot

`meanop-bot` is a lightweight, self-contained AI Telegram chatbot with an embedded Google Antigravity AI engine. It supports direct HTTPS communication with Google Cloud Code AI endpoints (no separate proxy server required) and offers dual execution drivers for **Local CLI/VPS** and **Cloudflare Worker** serverless edge deployments.

---

## ✨ Features

- **Embedded Google Antigravity Engine**: Direct AI payload translation & OAuth token management without external HTTP proxy dependencies.
- **Multimodal Message Support**: Process text, photos, audio clips, and voice messages seamlessly.
- **Dynamic Roasting & System Prompts**: Custom aggressive levels (0–5), custom system characteristics, and Boss override protection.
- **Dual Execution Driver**:
  - **Long-Polling Daemon**: For local development or continuous VPS execution.
  - **Node.js Webhook Server**: Runs a lightweight HTTP server receiving webhook updates.
  - **Cloudflare Worker**: Edge-native serverless deployment via `POST /webhook` updates.
- **Pluggable Session Storage**: File storage (`sessions.json`) for Node.js and in-memory storage for Cloudflare Workers.

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher
- **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather)
- **Google Antigravity OAuth Refresh Token**: Google OAuth refresh token (`1//...`) for AI API authentication.

---

## 🚀 Local Setup & Development

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
```

### 2. Configure Environment & Authenticate

Copy the example environment file:

```bash
cp .env.example .env
```

To obtain your `ANTIGRAVITY_REFRESH_TOKEN` via Google OAuth login, run:

```bash
npm run login
```

This opens your browser to sign in with Google and automatically saves the credentials to `auths/antigravity.json` and `.env`.

Set `TELEGRAM_BOT_TOKEN` in your `.env` file from `@BotFather`.

---

## ⚙️ Environment Variables Reference

| Variable | Description | Default / Example | Required |
| :--- | :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Bot token provided by [@BotFather](https://t.me/BotFather) | `123456789:ABC...` | **Yes** |
| `ANTIGRAVITY_REFRESH_TOKEN` | Google OAuth refresh token for Antigravity AI engine | `1//04...` | **Yes** |
| `MODEL` | Default AI model to use | `gemini-3.5-flash-low` | No |
| `SYSTEM_PROMPT` | System prompt instructions for the AI | Custom prompt text | No |
| `ALLOWED_USERS` | Comma-separated list of allowed Telegram usernames or IDs. Leave empty for public access. | `minuth,john_doe,12345678` | No |
| `BOSS` | Username of the creator/master who can fully manage and command the bot. | `minuth` | **Yes** |
| `BOT_MODE` | Execution driver mode for local Node.js (`polling` or `webhook`) | `polling` | No |
| `WEBHOOK_URL` | Target public URL for Telegram webhook registration | `https://your-domain.com/webhook` | No |
| `WEBHOOK_PATH` | Endpoint path for webhook listener | `/webhook` | No |
| `PORT` | Local HTTP server port for webhook mode | `3000` | No |

---

### 3. Running Locally

#### Mode A: Long-Polling (Default for Local / VPS)

Start the bot in continuous long-polling mode:

```bash
npm start
# or explicitly:
node src/index.js --mode polling
```

#### Mode B: Node.js Webhook Server

Start a local HTTP server listening for Telegram webhook POST updates:

```bash
node src/index.js --mode webhook --webhook-url https://your-domain.com/webhook --port 3000
```

---

## ☁️ Deploying to Cloudflare Workers

You can deploy `meanop-bot` to Cloudflare Workers for zero-maintenance, serverless execution.

### Step 1: Login to Cloudflare Wrangler

```bash
npx wrangler login
```

### Step 2: Set Cloudflare Secrets

Set your 2 required secret tokens using `wrangler secret put`:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ANTIGRAVITY_REFRESH_TOKEN
```

*(Optional: Set non-sensitive defaults like `MODEL`, `ALLOWED_USERS`, or `BOSS` in `wrangler.json` under `"vars"`)*.

### Step 3: Deploy Worker

Deploy your worker to Cloudflare:

```bash
npx wrangler deploy
```

Once deployed, Wrangler will output your worker URL (e.g., `https://meanop-bot.<your-subdomain>.workers.dev`).

### Step 4: Register Webhook with Telegram

Ensure your `.env` file contains your `TELEGRAM_BOT_TOKEN` and set `WEBHOOK_URL` to your deployed Worker URL:
```env
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
WEBHOOK_URL=https://meanop-bot.<your-subdomain>.workers.dev
```

Then run the webhook setup script:

```bash
npm run set-webhook
```

---

### 🔄 Updating Worker Variables & Secrets

Whenever you modify configuration settings in your project:

- **Updating `wrangler.json` (`vars` block)**:
  Re-deploy the worker to apply changes:
  ```bash
  npx wrangler deploy
  ```

- **Updating Secret Tokens (`TELEGRAM_BOT_TOKEN` or `ANTIGRAVITY_REFRESH_TOKEN`)**:
  Update secrets directly without a full redeploy:
  ```bash
  npx wrangler secret put <KEY_NAME>
  ```

---

## 🎮 Bot Commands

| Command | Description |
| :--- | :--- |
| `/start` | Restart active chat session & display welcome menu |
| `/help` | View help guide & list of commands |
| `/model` | View or change active AI model (`/model gemini-3.5-flash-low`) |
| `/status` | View session status, message count, and active configuration |
| `/reset` | Clear chat session history |
| `/behavior` | *(Boss only)* Change bot aggressive level or set custom system characteristic |

---

## 🛠 Project Structure

```
├── wrangler.json          # Cloudflare Worker configuration manifest
├── src/
│   ├── index.js           # CLI entry point (Long-Polling & Webhook modes)
│   ├── worker.js          # Cloudflare Worker serverless fetch handler
│   ├── bot.js             # Core Telegraf bot setup & command handlers
│   ├── antigravity.js     # Embedded Google Antigravity OAuth & translator
│   ├── proxyClient.js     # Direct AI client interface
│   ├── sessionManager.js  # Pluggable session manager
│   ├── config.js          # Environment & CLI configuration resolver
│   └── storage/
│       ├── fileStorage.js   # Disk storage adapter (sessions.json)
│       └── memoryStorage.js # Ephemeral in-memory storage adapter
└── README.md
```

---

## 📄 License

MIT
