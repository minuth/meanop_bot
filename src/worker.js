import { createBot } from './bot.js';
import { MemoryStorage } from './storage/memoryStorage.js';

let botInstance = null;

function getBot(env) {
  if (!botInstance) {
    botInstance = createBot({
      telegramToken: env.TELEGRAM_BOT_TOKEN,
      refreshToken: env.ANTIGRAVITY_REFRESH_TOKEN,
      model: env.MODEL || 'gemini-3.5-flash-low',
      systemPrompt: env.SYSTEM_PROMPT,
      allowedUsers: env.ALLOWED_USERS || '',
      boss: env.BOSS || '',
      storage: new MemoryStorage()
    });
  }
  return botInstance;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        const bot = getBot(env);
        await bot.handleUpdate(update);
        return new Response("OK", { status: 200 });
      } catch (err) {
        return new Response(`Error handling update: ${err.message}`, { status: 500 });
      }
    }
    return new Response("MeaNop AI Bot Serverless Worker Active", { status: 200 });
  }
};
