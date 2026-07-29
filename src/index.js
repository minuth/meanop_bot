import { Command } from 'commander';
import { resolveConfig, defaults } from './config.js';
import { createBot } from './bot.js';
import pc from 'picocolors';

const program = new Command();

program
  .name('meanop-bot')
  .description('A Node.js CLI Telegram chatbot that integrates with CLI Proxy API.')
  .version('1.0.0')
  .option('-t, --token <token>', 'Telegram Bot Token (or set TELEGRAM_BOT_TOKEN in .env)')
  .option('-p, --proxy-url <url>', `CLI Proxy API URL (default: "${defaults.CLI_PROXY_URL}")`)
  .option('-k, --proxy-key <key>', `CLI Proxy API Key (default: "${defaults.CLI_PROXY_KEY}")`)
  .option('-m, --model <model>', `AI Model to use (default: "${defaults.CLI_PROXY_MODEL}")`)
  .option('-s, --system-prompt <prompt>', 'Custom system prompt instructions for the AI')
  .option('-a, --allowed-users <usernames>', 'Comma-separated list of allowed Telegram usernames/IDs (private mode)')
  .option('-b, --boss <username>', 'Username of the user that the bot obeys and respects (Boss)');

program.parse(process.argv);

const options = program.opts();
const config = resolveConfig(options);

// Helper to mask secrets in console logs
function maskSecret(secret) {
  if (!secret) return 'Not set';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

async function main() {
  console.log(pc.cyan('\n============================================='));
  console.log(pc.cyan('      🤖 CLI Telegram Proxy Chatbot 🤖'));
  console.log(pc.cyan('=============================================\n'));

  // Validation
  if (!config.telegramToken) {
    console.error(pc.red('❌ Error: Telegram Bot Token is missing.'));
    console.log(`Please set ${pc.yellow('TELEGRAM_BOT_TOKEN')} in your ${pc.green('.env')} file or pass it via:`);
    console.log(pc.yellow('  node src/index.js --token <YOUR_TOKEN>\n'));
    program.help();
    process.exit(1);
  }

  const usersList = config.allowedUsers.length > 0
    ? config.allowedUsers.map(u => isNaN(u) ? `@${u}` : u).join(', ')
    : 'None (Public Access Mode)';

  console.log(`${pc.blue('⚙️  Configuration:')}`);
  console.log(`• Telegram Token: ${pc.yellow(maskSecret(config.telegramToken))}`);
  console.log(`• Proxy API URL:  ${pc.green(config.proxyUrl)}`);
  console.log(`• Proxy API Key:  ${pc.yellow(maskSecret(config.proxyKey))}`);
  console.log(`• Active Model:   ${pc.cyan(config.model)}`);
  console.log(`• Allowed Users:  ${pc.magenta(usersList)}`);
  if (config.boss) {
    console.log(`• Bot Boss:       ${pc.magenta(`@${config.boss}`)}`);
  }
  console.log(`• System Prompt:  ${pc.gray(config.systemPrompt)}\n`);

  try {
    console.log(`${pc.blue('🔄 Initializing bot connection...')}`);
    const bot = createBot(config);

    // Launch bot
    await bot.launch();
    
    console.log(`${pc.green('🚀 Bot successfully launched and listening for updates!')}`);
    console.log(pc.gray('Press Ctrl+C to stop the bot daemon.\n'));

    // Graceful stop handlers
    const stopBot = async (signal) => {
      console.log(`\n${pc.yellow(`Received ${signal}. Stopping bot...`)}`);
      bot.stop(signal);
      console.log(pc.green('Bot stopped gracefully. Goodbye! 👋'));
      process.exit(0);
    };

    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));

  } catch (err) {
    console.error(pc.red('\n❌ Critical: Failed to start the chatbot service:'));
    console.error(pc.red(err.message));
    process.exit(1);
  }
}

main();
