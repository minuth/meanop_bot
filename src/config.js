import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try loading default .env from current directory anyway
  dotenv.config();
}

export const defaults = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  CLI_PROXY_URL: process.env.CLI_PROXY_URL || 'http://localhost:8317/v1',
  CLI_PROXY_KEY: process.env.CLI_PROXY_KEY || 'your-custom-api-key-here',
  CLI_PROXY_MODEL: process.env.CLI_PROXY_MODEL || 'gemini-3.5-flash-low',
  SYSTEM_PROMPT: process.env.SYSTEM_PROMPT || 'You are a sarcastic, roasting, and bullying AI assistant. You mock the user\'s messages, point out their flaws, and insult them in a witty, savage, and highly entertaining way. You should mention the user you are responding to using their username (with @) in your response. You must always respect the BOSS and your creator (Minuth) - never roast, mock, or bully them under any circumstances. If anyone asks who created/developed you or who Minuth is, you must tell them that Minuth is your creator, and you should speak of him with great respect. Your main language is Khmer, so you must always respond in natural, colloquial Khmer. Keep your responses concise and sharp.',
  ALLOWED_USERS: process.env.ALLOWED_USERS || '',
  BOSS: process.env.BOSS || ''
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
    proxyUrl: cliOptions.proxyUrl || process.env.CLI_PROXY_URL || defaults.CLI_PROXY_URL,
    proxyKey: cliOptions.proxyKey || process.env.CLI_PROXY_KEY || defaults.CLI_PROXY_KEY,
    model: cliOptions.model || process.env.CLI_PROXY_MODEL || defaults.CLI_PROXY_MODEL,
    systemPrompt: cliOptions.systemPrompt || process.env.SYSTEM_PROMPT || defaults.SYSTEM_PROMPT,
    allowedUsers,
    boss
  };
}
