import http from 'http';
import { Command } from 'commander';
import { resolveConfig, defaults } from './config.js';
import { createBot } from './bot.js';
import pc from 'picocolors';

const program = new Command();

program
  .name('meanop-bot')
  .description('A Node.js CLI Telegram chatbot supporting Long-Polling and Webhook modes.')
  .version('1.0.0')
  .option('-t, --token <token>', 'Telegram Bot Token (or set TELEGRAM_BOT_TOKEN in .env)')
  .option('-r, --refresh-token <token>', 'Antigravity OAuth Refresh Token (or set ANTIGRAVITY_REFRESH_TOKEN in .env)')
  .option('--mode <mode>', 'Running mode: "polling" or "webhook" (default: "polling")')
  .option('-w, --webhook-url <url>', 'Public URL for Telegram Webhook (required if mode=webhook)')
  .option('-p, --port <port>', `HTTP Server Port for Webhook mode (default: ${defaults.PORT})`)
  .option('-m, --model <model>', `AI Model to use (default: "${defaults.MODEL}")`)
  .option('-s, --system-prompt <prompt>', 'Custom system prompt instructions for the AI')
  .option('-a, --allowed-users <usernames>', 'Comma-separated list of allowed Telegram usernames/IDs (private mode)')
  .option('-b, --boss <username>', 'Username of the user that the bot obeys and respects (Boss)');

program.parse(process.argv);

const options = program.opts();
const config = resolveConfig(options);

function maskSecret(secret) {
  if (!secret) return 'Not set';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

async function main() {
  console.log(pc.cyan('\n============================================='));
  console.log(pc.cyan('      🤖 Standalone AI Telegram Bot 🤖'));
  console.log(pc.cyan('=============================================\n'));

  if (!config.telegramToken) {
    console.error(pc.red('❌ Error: Telegram Bot Token is missing.'));
    console.log(`Please set ${pc.yellow('TELEGRAM_BOT_TOKEN')} in your ${pc.green('.env')} file or pass it via:`);
    console.log(pc.yellow('  node src/index.js --token <YOUR_TOKEN>\n'));
    program.help();
    process.exit(1);
  }

  if (!config.boss) {
    console.error(pc.red('❌ Error: BOSS username is required.'));
    console.log(`Please set ${pc.yellow('BOSS')} in your ${pc.green('.env')} file or pass it via:`);
    console.log(pc.yellow('  node src/index.js --boss <YOUR_USERNAME>\n'));
    program.help();
    process.exit(1);
  }

  if (!config.refreshToken) {
    console.warn(pc.yellow('⚠️  Warning: ANTIGRAVITY_REFRESH_TOKEN is not set.'));
    console.log(`Please set ${pc.yellow('ANTIGRAVITY_REFRESH_TOKEN')} in ${pc.green('.env')} or ${pc.green('auths/antigravity.json')}.\n`);
  }

  const usersList = config.allowedUsers.length > 0
    ? config.allowedUsers.map(u => isNaN(u) ? `@${u}` : u).join(', ')
    : 'None (Public Access Mode)';

  console.log(`${pc.blue('⚙️  Configuration:')}`);
  console.log(`• Telegram Token:   ${pc.yellow(maskSecret(config.telegramToken))}`);
  console.log(`• Refresh Token:    ${pc.green(maskSecret(config.refreshToken))}`);
  console.log(`• Running Mode:     ${pc.green(config.mode.toUpperCase())}`);
  console.log(`• Active Model:     ${pc.cyan(config.model)}`);
  console.log(`• Allowed Users:    ${pc.magenta(usersList)}`);
  if (config.boss) {
    console.log(`• Bot Boss:         ${pc.magenta(`@${config.boss}`)}`);
  }
  console.log(`• System Prompt:    ${pc.gray(config.systemPrompt)}\n`);

  try {
    const bot = createBot(config);

    if (config.mode === 'webhook') {
      if (!config.webhookUrl) {
        console.error(pc.red('❌ Error: Webhook URL is required in webhook mode.'));
        console.log(`Please set ${pc.yellow('WEBHOOK_URL')} in ${pc.green('.env')} or pass via ${pc.yellow('--webhook-url <url>')}\n`);
        process.exit(1);
      }

      console.log(`${pc.blue(`🔄 Initializing Webhook listener on port ${config.port}...`)}`);
      
      const webhookCallback = await bot.createWebhook({
        domain: config.webhookUrl,
        path: config.webhookPath
      });

      const server = http.createServer(webhookCallback);
      server.listen(config.port, () => {
        console.log(`${pc.green(`🚀 Webhook server listening on http://localhost:${config.port}${config.webhookPath}`)}`);
        console.log(`${pc.cyan(`🔗 Registered Telegram Webhook Domain: ${config.webhookUrl}`)}\n`);
      });

      const stopBot = async (signal) => {
        console.log(`\n${pc.yellow(`Received ${signal}. Stopping webhook server...`)}`);
        server.close();
        console.log(pc.green('Bot stopped gracefully. Goodbye! 👋'));
        process.exit(0);
      };

      process.once('SIGINT', () => stopBot('SIGINT'));
      process.once('SIGTERM', () => stopBot('SIGTERM'));

    } else {
      console.log(`${pc.blue('🔄 Initializing bot connection (Long-Polling)...')}`);
      await bot.launch();
      console.log(`${pc.green('🚀 Bot successfully launched and listening for updates!')}`);
      console.log(pc.gray('Press Ctrl+C to stop the bot daemon.\n'));

      const stopBot = async (signal) => {
        console.log(`\n${pc.yellow(`Received ${signal}. Stopping bot...`)}`);
        bot.stop(signal);
        console.log(pc.green('Bot stopped gracefully. Goodbye! 👋'));
        process.exit(0);
      };

      process.once('SIGINT', () => stopBot('SIGINT'));
      process.once('SIGTERM', () => stopBot('SIGTERM'));
    }

  } catch (err) {
    console.error(pc.red('\n❌ Critical: Failed to start the chatbot service:'));
    console.error(pc.red(err.message));
    process.exit(1);
  }
}

main();
