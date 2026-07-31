import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pc from 'picocolors';

// Load .env configuration
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;

async function main() {
  console.log(pc.cyan('\n--- Telegram Webhook Setup ---'));

  if (!token) {
    console.error(pc.red('❌ Error: TELEGRAM_BOT_TOKEN is missing in .env file.'));
    process.exit(1);
  }

  if (!webhookUrl) {
    console.error(pc.red('❌ Error: WEBHOOK_URL is missing in .env file.'));
    console.log(`Please set ${pc.yellow('WEBHOOK_URL=https://your-worker.<subdomain>.workers.dev')} in your ${pc.green('.env')} file.\n`);
    process.exit(1);
  }

  console.log(`Target Webhook URL: ${pc.green(webhookUrl)}`);
  console.log(`${pc.blue('🔄 Registering webhook with Telegram API...')}`);

  try {
    const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });

    const data = await res.json();
    if (data.ok) {
      console.log(pc.green(`\n✅ Telegram Webhook registered successfully!`));
      console.log(`Description: ${pc.gray(data.description || 'OK')}\n`);
    } else {
      console.error(pc.red(`\n❌ Failed to register webhook: ${data.description}`));
      process.exit(1);
    }
  } catch (err) {
    console.error(pc.red(`\n❌ Network Error: ${err.message}`));
    process.exit(1);
  }
}

main();
