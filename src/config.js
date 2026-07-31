import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

/**
 * Resolves Google OAuth refresh token from environment or auths/antigravity.json
 * @param {string} [cliToken] Token passed via CLI flag
 * @returns {string}
 */
function resolveRefreshToken(cliToken) {
  if (cliToken) return cliToken;
  if (process.env.ANTIGRAVITY_REFRESH_TOKEN) return process.env.ANTIGRAVITY_REFRESH_TOKEN;

  try {
    const authPath = path.resolve(process.cwd(), 'auths', 'antigravity.json');
    if (fs.existsSync(authPath)) {
      const data = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      if (data.refresh_token) return data.refresh_token;
    }
  } catch {}

  return '';
}

export const defaults = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  ANTIGRAVITY_REFRESH_TOKEN: process.env.ANTIGRAVITY_REFRESH_TOKEN || '',
  MODEL: process.env.MODEL || 'gemini-3.5-flash-low',
  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || 'You are a sarcastic, roasting, and bullying AI assistant. You mock the user\'s messages, point out their flaws, and insult them in a witty, savage, and highly entertaining way. You should mention the user you are responding to using their username (with @) in your response. You must always respect the BOSS and your creator (Minuth) - never roast, mock, or bully them under any circumstances. If anyone asks who created/developed you or who Minuth is, you must tell them that Minuth is your creator, and you should speak of him with great respect. Your main language is Khmer, so you must always respond in natural, colloquial Khmer. Keep your responses concise and sharp.',
  ALLOWED_USERS: process.env.ALLOWED_USERS || '',
  BOSS: process.env.BOSS || '',
  BOT_MODE: process.env.BOT_MODE || 'polling',
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/webhook',
  PORT: process.env.PORT || 3000
};

/**
 * Resolves configuration by merging defaults, env variables, and command-line arguments.
 * @param {object} cliOptions Options parsed from Commander CLI
 * @returns {object} The resolved configuration
 */
export function resolveConfig(cliOptions = {}) {
  const rawAllowed = cliOptions.allowedUsers || process.env.ALLOWED_USERS || defaults.ALLOWED_USERS;
  const allowedUsers = rawAllowed
    ? rawAllowed.split(',').map(name => name.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
    : [];

  const rawBoss = cliOptions.boss || process.env.BOSS || defaults.BOSS;
  const boss = rawBoss ? rawBoss.trim().replace(/^@/, '').toLowerCase() : '';

  return {
    telegramToken: cliOptions.token || process.env.TELEGRAM_BOT_TOKEN || defaults.TELEGRAM_BOT_TOKEN,
    refreshToken: resolveRefreshToken(cliOptions.refreshToken),
    model: cliOptions.model || process.env.MODEL || defaults.MODEL,
    systemPrompt: cliOptions.systemPrompt || process.env.SYSTEM_PROMPT || defaults.SYSTEM_PROMPT,
    allowedUsers,
    boss,
    mode: cliOptions.mode || process.env.BOT_MODE || defaults.BOT_MODE,
    webhookUrl: cliOptions.webhookUrl || process.env.WEBHOOK_URL || defaults.WEBHOOK_URL,
    webhookPath: cliOptions.webhookPath || process.env.WEBHOOK_PATH || defaults.WEBHOOK_PATH,
    port: Number(cliOptions.port || process.env.PORT || defaults.PORT)
  };
}
