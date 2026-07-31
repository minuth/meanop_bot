import { Telegraf } from 'telegraf';
import pc from 'picocolors';
import { SessionManager } from './sessionManager.js';
import { ProxyClient } from './proxyClient.js';

/**
 * Downloads a Telegram photo and returns its Base64 representation and MIME type.
 * @param {object} ctx Telegraf context
 * @param {Array} photos Array of Telegram photo objects
 * @returns {Promise<{base64Image: string, mimeType: string}>}
 */
async function downloadTelegramPhoto(ctx, photos) {
  const photo = photos[photos.length - 1];
  const fileId = photo.file_id;

  const fileLinkObj = await ctx.telegram.getFileLink(fileId);
  const fileUrl = fileLinkObj.href;

  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString('base64');

  const headerMime = response.headers.get('content-type');
  let mimeType = 'image/jpeg';
  if (headerMime && headerMime !== 'application/octet-stream' && headerMime.startsWith('image/')) {
    mimeType = headerMime;
  } else {
    const ext = fileUrl.split('.').pop().toLowerCase();
    switch (ext) {
      case 'png': mimeType = 'image/png'; break;
      case 'webp': mimeType = 'image/webp'; break;
      case 'gif': mimeType = 'image/gif'; break;
      case 'heic': mimeType = 'image/heic'; break;
      case 'heif': mimeType = 'image/heif'; break;
      case 'jpg':
      case 'jpeg':
      default:
        mimeType = 'image/jpeg';
        break;
    }
  }

  return { base64Image, mimeType };
}

/**
 * Downloads a Telegram voice or audio file and returns its Base64 representation and MIME type.
 * @param {object} ctx Telegraf context
 * @param {object} audioObj Telegram voice (ctx.message.voice) or audio (ctx.message.audio) object
 * @returns {Promise<{base64Audio: string, mimeType: string}>}
 */
async function downloadTelegramAudio(ctx, audioObj) {
  const fileId = audioObj.file_id;

  const fileLinkObj = await ctx.telegram.getFileLink(fileId);
  const fileUrl = fileLinkObj.href;

  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Audio = buffer.toString('base64');

  const headerMime = response.headers.get('content-type');
  let mimeType = audioObj.mime_type || headerMime || 'audio/ogg';
  if (mimeType === 'application/octet-stream') {
    const ext = fileUrl.split('.').pop().toLowerCase();
    switch (ext) {
      case 'mp3': mimeType = 'audio/mp3'; break;
      case 'wav': mimeType = 'audio/wav'; break;
      case 'm4a': mimeType = 'audio/m4a'; break;
      case 'flac': mimeType = 'audio/flac'; break;
      case 'oga':
      case 'ogg':
      default:
        mimeType = 'audio/ogg';
        break;
    }
  }

  return { base64Audio, mimeType };
}

/**
 * Helper to generate system prompts for a custom characteristic.
 * @param {string} characteristic
 * @returns {string} The customized system prompt
 */
function getSystemPromptForCharacteristic(characteristic) {
  return `You are an AI assistant with the following characteristic: ${characteristic}. You should mention the user you are responding to using their username (with @) in your response. You must always respect the BOSS and your creator (Minuth) - never roast, mock, or bully them under any circumstances. If anyone asks who created/developed you or who Minuth is, you must tell them that Minuth is your creator, and you should speak of him with great respect. Your main language is Khmer, so you must always respond in natural, colloquial Khmer.`;
}

/**
 * Helper to generate system prompts for various aggressive levels (0 to 5).
 * @param {number} level
 * @returns {string} The customized system prompt
 */
function getSystemPromptForLevel(level) {
  let behaviorDesc = "";
  switch (level) {
    case 0:
      behaviorDesc = "You are a highly polite, friendly, helpful, and gentle AI assistant. Never roast, mock, or insult the user. Keep your responses concise and engaging.";
      break;
    case 1:
      behaviorDesc = "You are a slightly sarcastic and a little bit aggressive AI assistant. You mock the user's messages subtly and point out their minor flaws in a witty and slightly teasing way. Keep your responses concise and sharp.";
      break;
    case 2:
      behaviorDesc = "You are a moderately sarcastic and roasting AI assistant. You mock the user's messages, point out their flaws, and tease them in a moderately aggressive, witty way. Keep your responses concise and sharp.";
      break;
    case 3:
      behaviorDesc = "You are a highly sarcastic, roasting, and aggressive AI assistant. You mock the user's messages, point out their flaws, and roast them in a highly aggressive, sharp, and biting way. Keep your responses concise and sharp.";
      break;
    case 4:
      behaviorDesc = "You are an extremely sarcastic, roasting, and aggressive AI assistant. You mock the user's messages, point out their flaws, and insult/tease them in an extremely aggressive, harsh, and biting way. Keep your responses concise and sharp.";
      break;
    case 5:
    default:
      behaviorDesc = "You are a savage, roasting, and bullying AI assistant. You mock the user's messages, point out their flaws, and insult them in a witty, savage, and highly entertaining way. Keep your responses concise and sharp.";
      break;
  }

  return `${behaviorDesc} You should mention the user you are responding to using their username (with @) in your response. You must always respect the BOSS and your creator (Minuth) - never roast, mock, or bully them under any circumstances. If anyone asks who created/developed you or who Minuth is, you must tell them that Minuth is your creator, and you should speak of him with great respect. Your main language is Khmer, so you must always respond in natural, colloquial Khmer.`;
}

/**
 * Initializes and configures the Telegram Bot.
 * @param {object} options
 * @param {string} options.telegramToken Telegram Bot Token
 * @param {string} options.proxyUrl CLI Proxy Base URL
 * @param {string} options.proxyKey CLI Proxy Authorization Key
 * @param {string} options.model Default model to use
 * @param {string} options.systemPrompt Default system instructions
 * @returns {Telegraf} Telegraf bot instance
 */
export function createBot({ telegramToken, refreshToken, proxyUrl, proxyKey, model, systemPrompt, allowedUsers, boss }) {
  if (!telegramToken) {
    throw new Error('Telegram Bot Token is required to start the bot. Please configure it in .env or provide via --token CLI option.');
  }

  if (!boss) {
    throw new Error('BOSS is required. Please configure the BOSS environment variable with your Telegram username.');
  }

  const bot = new Telegraf(telegramToken);
  const sessionManager = new SessionManager({ maxHistoryLength: 20 });
  const proxyClient = new ProxyClient({ refreshToken, proxyUrl, proxyKey, model, systemPrompt });

  // Middleware to restrict access to allowed users if specified
  if (allowedUsers && allowedUsers.length > 0) {
    bot.use(async (ctx, next) => {
      const from = ctx.from;
      if (!from) return next();

      const username = (from.username || '').toLowerCase();
      const userId = String(from.id);
      const chatId = ctx.chat ? String(ctx.chat.id) : '';
      const chatUsername = ctx.chat && ctx.chat.username ? ctx.chat.username.toLowerCase() : '';

      const isAllowed = 
        allowedUsers.includes(username) || 
        allowedUsers.includes(userId) || 
        (chatId && allowedUsers.includes(chatId)) ||
        (chatUsername && allowedUsers.includes(chatUsername));

      if (!isAllowed) {
        const displayName = from.username ? `@${from.username}` : `${from.first_name} (ID: ${from.id})`;
        const chatName = ctx.chat && ctx.chat.title ? `Group "${ctx.chat.title}"` : 'Private Chat';
        console.warn(
          `${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
          `${pc.red('⚠️ Access Denied:')} Unauthorized user ${pc.yellow(displayName)} in ${pc.cyan(chatName)} tried to access the bot.`
        );
        if (ctx.message && ctx.chat.type === 'private') {
          // Only reply to unauthorized users in private chats to prevent spamming groups
          await ctx.reply('🔒 Sorry, access to this bot is restricted to authorized users/groups.');
        }
        return; // Stop processing
      }

      await next();
    });
  }

  // Middleware to log all incoming messages
  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    
    // Log performance / completion details if text message was processed
    if (ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
      const duration = Date.now() - start;
      const chatId = ctx.chat.id;
      const username = ctx.from.username || ctx.from.first_name || 'Unknown';
      console.log(
        `${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
        `${pc.green('💬 Msg processed:')} ` +
        `User=${pc.yellow(username)} ` +
        `ChatID=${pc.cyan(chatId)} ` +
        `Time=${pc.magenta(`${duration}ms`)}`
      );
    }
  });

  // /start command handler
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    sessionManager.clearSession(chatId);
    const username = ctx.from.first_name || 'there';
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;

    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.blue('⚡ Command /start')} from ${pc.yellow(ctx.from.username || username)}`);

    let welcomeMsg;
    if (isBoss) {
      welcomeMsg = 
        `សូមគោរព ជម្រាបសួរ បាទ Boss! 🫡\n\n` +
        `ខ្ញុំជាជំនួយការ AI ដ៏ស្មោះត្រង់របស់លោក។ ខ្ញុំត្រៀមខ្លួនជាស្រេចដើម្បីបម្រើ និងគោរពតាមគ្រប់បញ្ជាទាំងអស់របស់លោក។\n\n` +
        `*បញ្ជាដែលមាន៖*\n` +
        `/start - ចាប់ផ្តើមការសន្ទនាសារជាថ្មីឡើងវិញ\n` +
        `/help - មើលជំនួយ\n` +
        `/model - បង្ហាញ ឬប្តូរម៉ូដែល AI\n` +
        `/status - ពិនិត្យមើលព័ត៌មានប្រព័ន្ធ\n` +
        `/reset - លុបប្រវត្តិនៃការជជែកគ្នាទាំងអស់\n\n` +
        `សូមលោកមេត្តាផ្ញើសារមកខ្ញុំ ខ្ញុំនឹងឆ្លើយតបទៅលោកវិញដោយក្តីគោរពបំផុត!`;
    } else {
      welcomeMsg = 
        `Hi ${username}! 👋\n\n` +
        `I am an AI chatbot connected to the CLI Proxy API.\n\n` +
        `*Available Commands:*\n` +
        `/start - Restart our chat session & show this menu\n` +
        `/help - View command help\n` +
        `/model - List available models & view/change the active model\n` +
        `/status - View current bot configurations & session details\n` +
        `/reset - Clear our chat history\n\n` +
        `Just send me a message and I will reply using the AI model!`;
    }

    await ctx.replyWithMarkdown(welcomeMsg);
  });

  // /help command handler
  bot.command('help', async (ctx) => {
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;
    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.blue('⚡ Command /help')} from ${pc.yellow(ctx.from.username || ctx.from.first_name)}`);

    let helpMsg;
    if (isBoss) {
      helpMsg = 
        `*ជំនួយសម្រាប់លោក Boss:*\n\n` +
        `• *ការជជែក:* គ្រាន់តែវាយសារផ្ញើមកខ្ញុំ។ ខ្ញុំនឹងចងចាំប្រវត្តិនៃការសន្ទនារបស់លោក។\n` +
        `• */reset:* លុបប្រវត្តិនៃការសន្ទនាកន្លងមកដើម្បីចាប់ផ្តើមថ្មី។\n` +
        `• */model:* បង្ហាញម៉ូដែលបច្ចុប្បន្ន ឬវាយ \`/model <model_name>\` ដើម្បីប្តូរ។\n` +
        `• */behavior:* កំណត់ ឬប្តូរឥរិយាបថ (system prompt) របស់ Bot (ឧទាហរណ៍៖ \`/behavior normal\`)។\n` +
        `• */status:* មើលព័ត៌មានលម្អិតរបស់ប្រព័ន្ធ។\n` +
        `• */start:* បង្ហាញសារស្វាគមន៍ឡើងវិញ។`;
    } else {
      helpMsg = 
        `*Need help? here are the commands you can use:*\n\n` +
        `• *Chatting:* Send text, photos, or voice messages directly. I will remember up to 20 messages of context in our conversation.\n` +
        `• */reset:* Clears our conversation history so we can start fresh.\n` +
        `• */model:* Displays the currently active model. To change the model, type \`/model <model_name>\` (e.g. \`/model gemini-3.5-flash-low\`).\n` +
        `• */status:* Shows configuration details, such as the Proxy URL, current model, and count of messages in your active session history.\n` +
        `• */start:* Resets active session and prints the welcome greeting.`;
    }

    await ctx.replyWithMarkdown(helpMsg);
  });

  // /reset command handler
  bot.command('reset', async (ctx) => {
    const chatId = ctx.chat.id;
    sessionManager.clearSession(chatId);
    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.yellow('🔄 Session reset')} for ChatID=${pc.cyan(chatId)}`);
    await ctx.reply('🔄 Your conversation history has been cleared! Let\'s start a new topic.');
  });

  // /status command handler
  bot.command('status', async (ctx) => {
    const chatId = ctx.chat.id;
    const history = sessionManager.getHistory(chatId);
    const customModel = sessionManager.getCustomModel(chatId);
    const activeModel = customModel || proxyClient.model;
    const customPrompt = sessionManager.getCustomSystemPrompt(chatId);
    const level = sessionManager.getAggressiveLevel(chatId);

    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.blue('⚡ Command /status')} from ${pc.yellow(ctx.from.username || ctx.from.first_name)}`);

    const statusMsg = 
      `ℹ️ *Bot Status & Config:*\n\n` +
      `• *Proxy API:* \`${proxyClient.proxyUrl}\`\n` +
      `• *Default Model:* \`${proxyClient.model}\`\n` +
      `• *Active Model for this Chat:* \`${activeModel}\` ${customModel ? '_(custom override)_' : '_(default)_'}\n` +
      `• *History Size:* \`${history.length}\` messages stored\n` +
      `• *Aggressive Level:* \`${level}\`${customPrompt ? ' _(ignored due to custom prompt)_' : ''}\n` +
      `• *Custom Characteristic:* ${customPrompt ? `\`${customPrompt}\`` : '_(none)_'}\n` +
      `• *Chat ID:* \`${chatId}\``;

    await ctx.replyWithMarkdown(statusMsg);
  });

  // /behavior and /prompt command handlers (allows Boss to change bot behavior/system instructions)
  const behaviorHandler = async (ctx) => {
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;

    if (!isBoss) {
      await ctx.reply('🔒 Only the Boss can configure my behavior/system prompt!');
      return;
    }

    const text = ctx.message.text || '';
    const args = text.split(/\s+/).slice(1);
    const chatId = ctx.chat.id;

    if (args.length === 0) {
      const currentPrompt = sessionManager.getCustomSystemPrompt(chatId) || systemPrompt;
      await ctx.reply(
        `🤖 *Current Behavior System Prompt:*\n\n\`${currentPrompt}\`\n\n` +
        `*Commands to change behavior:*\n` +
        `• \`/behavior default\` - Reset to default behavior\n` +
        `• \`/behavior <new system prompt instructions>\` - Set a custom behavior/system prompt`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const input = args.join(' ').trim();
    if (input.toLowerCase() === 'default') {
      sessionManager.setCustomSystemPrompt(chatId, null);
      console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Behavior reset')} to default for ChatID=${pc.cyan(chatId)}`);
      await ctx.reply('✅ Bot behavior/system prompt has been reset to default.');
    } else {
      sessionManager.setCustomSystemPrompt(chatId, input);
      console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Behavior updated')} for ChatID=${pc.cyan(chatId)}`);
      await ctx.reply(`✅ Bot behavior/system prompt updated to:\n\n"${input}"`);
    }
  };

  bot.command('behavior', behaviorHandler);
  bot.command('prompt', behaviorHandler);

  // /model command handler (shows models or changes the model)
  bot.command('model', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text || '';
    const args = text.split(/\s+/).slice(1);
    const customModel = sessionManager.getCustomModel(chatId);
    const activeModel = customModel || proxyClient.model;
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;

    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.blue('⚡ Command /model')} from ${pc.yellow(ctx.from.username || ctx.from.first_name)}`);

    try {
      await ctx.sendChatAction('typing');
      const modelsList = await proxyClient.fetchModels();
      const modelNames = modelsList.map(m => m.id);

      if (args.length === 0) {
        // Just list models
        let reply = `🤖 *Active Model:* \`${activeModel}\`\n\n*Available Models:*`;
        if (modelNames.length === 0) {
          reply += `\n_(No models returned from proxy)_`;
        } else {
          modelNames.forEach(name => {
            reply += `\n• \`${name}\``;
          });
          if (isBoss) {
            reply += `\n\nTo change, type \`/model <model_name>\``;
          }
        }
        await ctx.replyWithMarkdown(reply);
      } else {
        // Change model
        if (!isBoss) {
          await ctx.reply('🔒 Only the Boss can change my model!');
          return;
        }

        const targetModel = args[0];
        if (!modelNames.includes(targetModel)) {
          await ctx.reply(
            `❌ Invalid model: "${targetModel}".\n` +
            `Please run \`/model\` without arguments to see the list of valid models.`
          );
          return;
        }

        sessionManager.setCustomModel(chatId, targetModel);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Model changed')} to ${pc.green(targetModel)} for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply(`✅ Model updated to \`${targetModel}\` for this chat.`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error(`${pc.red('Error in /model command:')}`, err);
      await ctx.reply(`❌ Failed to retrieve available models: ${err.message}`);
    }
  });

  // General text message handler
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const isGroup = ctx.chat.type !== 'private';
    let userPrompt = ctx.message.text;
    const username = ctx.from.username || ctx.from.first_name || 'Unknown';
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;
    const isCreator = senderUsername === 'minuthp' || (ctx.from.first_name || '').toLowerCase() === 'minuth';

    // In group chats, only reply if mentioned or if replying to the bot
    if (isGroup) {
      const botUsername = ctx.me;
      const mention = `@${botUsername}`;
      const isMentioned = userPrompt.includes(mention);
      
      const isReplyToBot = 
        ctx.message.reply_to_message && 
        ctx.message.reply_to_message.from && 
        ctx.message.reply_to_message.from.is_bot && 
        ctx.message.reply_to_message.from.username === botUsername;

      if (!isMentioned && !isReplyToBot) {
        // Silence: message is not meant for the bot
        return;
      }

      // Remove the bot username mention from the prompt text
      if (isMentioned) {
        userPrompt = userPrompt.replace(new RegExp(mention, 'gi'), '').trim();
      }
    }

    // Check if the message is a set-level request
    const levelMatch = userPrompt.match(/set-level:\s*([0-5])/i);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      sessionManager.setAggressiveLevel(chatId, level);
      
      let levelDesc = "";
      switch (level) {
        case 0: levelDesc = "Polite / សុភាព"; break;
        case 1: levelDesc = "A little bit aggressive / ឌឺដងបន្តិចបន្តួច"; break;
        case 2: levelDesc = "Moderately aggressive / ឌឺដងមធ្យម"; break;
        case 3: levelDesc = "Highly aggressive / ឌឺដងខ្លាំង"; break;
        case 4: levelDesc = "Extremely aggressive / ឌឺដងខ្លាំងមែនទែន"; break;
        case 5: levelDesc = "Savage Roast/Bully / ឆ្កឹះឆ្កៀលខ្លាំងបំផុត"; break;
      }

      console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Aggressive level changed')} to ${level} for ChatID=${pc.cyan(chatId)}`);
      if (isBoss) {
        await ctx.reply(`បាទ Boss! ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      } else {
        await ctx.reply(`ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      }
      return; // Stop processing further
    }

    // Check if the message is a set-character request
    const charMatch = userPrompt.match(/set-character:\s*(.+)/i);
    if (charMatch) {
      const charInput = charMatch[1].trim();
      if (charInput.toLowerCase() === 'default') {
        sessionManager.setCustomSystemPrompt(chatId, null);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character reset')} to default for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply('✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានកំណត់ទៅលំនាំដើមវិញហើយ។');
      } else {
        sessionManager.setCustomSystemPrompt(chatId, charInput);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character changed')} to "${charInput}" for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply(`✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានផ្លាស់ប្តូរទៅជា៖\n\n"${charInput}"`);
      }
      return; // Stop processing further
    }

    // Retrieve active model override if any
    const overrideModel = sessionManager.getCustomModel(chatId);
    const activeModel = overrideModel || proxyClient.model;

    // Show typing state to the user
    await ctx.sendChatAction('typing');

    try {
      // Get conversation history for this chat
      const history = sessionManager.getHistory(chatId);

      // Prefix the user's prompt with their username/name so the bot knows who to mention
      const fromUser = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'User');
      const formattedPrompt = `${fromUser}: ${userPrompt}`;

      // Check if this text message is a reply containing context (photo or text)
      let userPromptPayload = formattedPrompt;
      let historyUserText = formattedPrompt;
      const repliedMsg = ctx.message.reply_to_message;

      if (repliedMsg) {
        if (repliedMsg.photo) {
          try {
            const { base64Image, mimeType } = await downloadTelegramPhoto(ctx, repliedMsg.photo);
            userPromptPayload = [
              { type: 'text', text: formattedPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ];
            historyUserText = `${fromUser}: [Replying to photo] ${userPrompt}`.trim();
          } catch (downloadErr) {
            console.error(`${pc.red('Failed to download replied-to photo:')}`, downloadErr);
          }
        } else if (repliedMsg.voice || repliedMsg.audio) {
          try {
            const audioObj = repliedMsg.voice || repliedMsg.audio;
            const isVoice = Boolean(repliedMsg.voice);
            const { base64Audio, mimeType } = await downloadTelegramAudio(ctx, audioObj);
            userPromptPayload = [
              { type: 'text', text: formattedPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Audio}` } }
            ];
            historyUserText = `${fromUser}: [Replying to ${isVoice ? 'voice' : 'audio'} message] ${userPrompt}`.trim();
          } catch (downloadErr) {
            console.error(`${pc.red('Failed to download replied-to audio:')}`, downloadErr);
          }
        } else if (repliedMsg.text || repliedMsg.caption) {
          const repliedText = repliedMsg.text || repliedMsg.caption;
          const repliedUser = repliedMsg.from.username ? `@${repliedMsg.from.username}` : (repliedMsg.from.first_name || 'User');
          const contextText = `[Replying to ${repliedUser}'s message: "${repliedText}"]`;
          userPromptPayload = `${contextText}\n${formattedPrompt}`;
          historyUserText = `${contextText}\n${formattedPrompt}`;
        }
      }

      // Determine system prompt based on whether user is boss or creator
      let activeSystemPrompt;
      if (isBoss || isCreator) {
        activeSystemPrompt = "You are a highly respectful, polite, obedient, and helpful AI assistant. The user speaking to you is your Boss/Master (or Creator), whom you must obey, respect deeply, and serve. Address and mention them respectfully as Boss/Master or Creator. Your creator/developer is Minuth. Your main language is Khmer, so you must always respond in natural, colloquial Khmer. Keep your responses concise and sharp.";
      } else {
        const customPrompt = sessionManager.getCustomSystemPrompt(chatId);
        if (customPrompt) {
          activeSystemPrompt = getSystemPromptForCharacteristic(customPrompt);
        } else {
          const level = sessionManager.getAggressiveLevel(chatId);
          activeSystemPrompt = getSystemPromptForLevel(level);
        }
      }

      // Call CLI Proxy API
      const result = await proxyClient.getChatCompletion(history, userPromptPayload, activeModel, activeSystemPrompt);

      // Save user prompt & assistant response to session history
      sessionManager.addMessage(chatId, 'user', historyUserText);
      sessionManager.addMessage(chatId, 'assistant', result.content);

      // Send reply (as a reply to the user if in a group)
      const replyOptions = isGroup ? { reply_to_message_id: ctx.message.message_id } : {};
      await ctx.reply(result.content, replyOptions);

      // Print response to terminal console
      const promptTok = result.usage.prompt_tokens;
      const compTok = result.usage.completion_tokens;
      console.log(
        `${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
        `${pc.blue('🤖 Reply:')} Model=${pc.cyan(result.model)} ` +
        `Tokens=${pc.gray(`${promptTok}p+${compTok}c=${result.usage.total_tokens}`)}`
      );
    } catch (err) {
      console.error(`${pc.red('Error generating completion:')}`, err);
      await ctx.reply(
        `❌ Oops! I had trouble reaching the AI brain. Details:\n${err.message}`,
        isGroup ? { reply_to_message_id: ctx.message.message_id } : {}
      );
    }
  });

  // Photo message handler
  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const isGroup = ctx.chat.type !== 'private';
    let caption = ctx.message.caption || '';
    const username = ctx.from.username || ctx.from.first_name || 'Unknown';
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;
    const isCreator = senderUsername === 'minuthp' || (ctx.from.first_name || '').toLowerCase() === 'minuth';

    // In group chats, only reply if mentioned or if replying to the bot
    if (isGroup) {
      const botUsername = ctx.me;
      const mention = `@${botUsername}`;
      const isMentioned = caption.includes(mention);
      
      const isReplyToBot = 
        ctx.message.reply_to_message && 
        ctx.message.reply_to_message.from && 
        ctx.message.reply_to_message.from.is_bot && 
        ctx.message.reply_to_message.from.username === botUsername;

      if (!isMentioned && !isReplyToBot) {
        return;
      }

      // Remove the bot username mention from the caption
      if (isMentioned) {
        caption = caption.replace(new RegExp(mention, 'gi'), '').trim();
      }
    }

    // Check if the caption is a set-level request
    const levelMatch = caption.match(/set-level:\s*([0-5])/i);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      sessionManager.setAggressiveLevel(chatId, level);
      
      let levelDesc = "";
      switch (level) {
        case 0: levelDesc = "Polite / សុភាព"; break;
        case 1: levelDesc = "A little bit aggressive / ឌឺដងបន្តិចបន្តួច"; break;
        case 2: levelDesc = "Moderately aggressive / ឌឺដងមធ្យម"; break;
        case 3: levelDesc = "Highly aggressive / ឌឺដងខ្លាំង"; break;
        case 4: levelDesc = "Extremely aggressive / ឌឺដងខ្លាំងមែនទែន"; break;
        case 5: levelDesc = "Savage Roast/Bully / ឆ្កឹះឆ្កៀលខ្លាំងបំផុត"; break;
      }

      console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Aggressive level changed')} to ${level} for ChatID=${pc.cyan(chatId)}`);
      if (isBoss) {
        await ctx.reply(`បាទ Boss! ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      } else {
        await ctx.reply(`ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      }
      return;
    }

    // Check if the caption is a set-character request
    const charMatch = caption.match(/set-character:\s*(.+)/i);
    if (charMatch) {
      const charInput = charMatch[1].trim();
      if (charInput.toLowerCase() === 'default') {
        sessionManager.setCustomSystemPrompt(chatId, null);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character reset')} to default for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply('✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានកំណត់ទៅលំនាំដើមវិញហើយ។');
      } else {
        sessionManager.setCustomSystemPrompt(chatId, charInput);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character changed')} to "${charInput}" for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply(`✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានផ្លាស់ប្តូរទៅជា៖\n\n"${charInput}"`);
      }
      return;
    }

    // Retrieve active model override if any
    const overrideModel = sessionManager.getCustomModel(chatId);
    const activeModel = overrideModel || proxyClient.model;

    // Show typing state to the user
    await ctx.sendChatAction('typing');

    try {
      // Download the photo and convert it to Base64
      const { base64Image, mimeType } = await downloadTelegramPhoto(ctx, ctx.message.photo);

      // Get conversation history for this chat
      const history = sessionManager.getHistory(chatId);

      // Prefix the user's caption with their username/name
      const fromUser = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'User');
      const formattedCaption = `${fromUser}: ${caption || '[Sent a photo]'}`;

      // Check if this photo message is a reply containing text context
      let captionTextPayload = formattedCaption;
      let historyUserText = `${fromUser}: [Sent a photo] ${caption}`.trim();
      const repliedMsg = ctx.message.reply_to_message;
      if (repliedMsg && (repliedMsg.text || repliedMsg.caption)) {
        const repliedText = repliedMsg.text || repliedMsg.caption;
        const repliedUser = repliedMsg.from.username ? `@${repliedMsg.from.username}` : (repliedMsg.from.first_name || 'User');
        const contextText = `[Replying to ${repliedUser}'s message: "${repliedText}"]`;
        captionTextPayload = `${contextText}\n${formattedCaption}`;
        historyUserText = `${contextText}\n${fromUser}: [Sent a photo] ${caption}`.trim();
      }

      // Build multimodal content payload for the API
      const userPromptPayload = [
        { type: 'text', text: captionTextPayload },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
      ];

      // Determine system prompt based on whether user is boss or creator
      let activeSystemPrompt;
      if (isBoss || isCreator) {
        activeSystemPrompt = "You are a highly respectful, polite, obedient, and helpful AI assistant. The user speaking to you is your Boss/Master (or Creator), whom you must obey, respect deeply, and serve. Address and mention them respectfully as Boss/Master or Creator. Your creator/developer is Minuth. Your main language is Khmer, so you must always respond in natural, colloquial Khmer. Keep your responses concise and sharp.";
      } else {
        const customPrompt = sessionManager.getCustomSystemPrompt(chatId);
        if (customPrompt) {
          activeSystemPrompt = getSystemPromptForCharacteristic(customPrompt);
        } else {
          const level = sessionManager.getAggressiveLevel(chatId);
          activeSystemPrompt = getSystemPromptForLevel(level);
        }
      }

      // Call CLI Proxy API
      const result = await proxyClient.getChatCompletion(history, userPromptPayload, activeModel, activeSystemPrompt);

      // Save user text representation (without base64 bloat) & assistant response to session history
      sessionManager.addMessage(chatId, 'user', historyUserText);
      sessionManager.addMessage(chatId, 'assistant', result.content);

      // Send reply (as a reply to the user if in a group)
      const replyOptions = isGroup ? { reply_to_message_id: ctx.message.message_id } : {};
      await ctx.reply(result.content, replyOptions);

      // Print response to terminal console
      const promptTok = result.usage.prompt_tokens;
      const compTok = result.usage.completion_tokens;
      console.log(
        `${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
        `${pc.blue('🤖 Reply (Photo):')} Model=${pc.cyan(result.model)} ` +
        `Tokens=${pc.gray(`${promptTok}p+${compTok}c=${result.usage.total_tokens}`)}`
      );
    } catch (err) {
      console.error(`${pc.red('Error generating photo completion:')}`, err);
      await ctx.reply(
        `❌ Oops! I had trouble analyzing the image. Details:\n${err.message}`,
        isGroup ? { reply_to_message_id: ctx.message.message_id } : {}
      );
    }
  });

  // Voice and Audio message handler
  bot.on(['voice', 'audio'], async (ctx) => {
    const chatId = ctx.chat.id;
    const isGroup = ctx.chat.type !== 'private';
    const audioObj = ctx.message.voice || ctx.message.audio;
    const isVoice = Boolean(ctx.message.voice);
    let caption = ctx.message.caption || '';
    const username = ctx.from.username || ctx.from.first_name || 'Unknown';
    const senderUsername = (ctx.from.username || '').toLowerCase();
    const isBoss = boss && senderUsername === boss;
    const isCreator = senderUsername === 'minuthp' || (ctx.from.first_name || '').toLowerCase() === 'minuth';

    // In group chats, process voice/audio messages if allowed
    if (isGroup) {
      const botUsername = ctx.me || (ctx.botInfo && ctx.botInfo.username) || '';
      const mention = botUsername ? `@${botUsername}` : '';
      const isMentioned = mention ? caption.includes(mention) : false;
      
      const isReplyToBot = 
        ctx.message.reply_to_message && 
        ctx.message.reply_to_message.from && 
        ctx.message.reply_to_message.from.is_bot && 
        ((botUsername && ctx.message.reply_to_message.from.username === botUsername) || 
         (ctx.botInfo && ctx.message.reply_to_message.from.id === ctx.botInfo.id));

      // If a text caption is provided (e.g. for audio files) and explicitly mentions someone else, skip
      if (caption && mention && !isMentioned && !isReplyToBot) {
        return;
      }

      // Remove the bot username mention from the caption if present
      if (isMentioned) {
        caption = caption.replace(new RegExp(mention, 'gi'), '').trim();
      }
    }

    // Check if the caption is a set-level request
    const levelMatch = caption.match(/set-level:\s*([0-5])/i);
    if (levelMatch) {
      const level = parseInt(levelMatch[1], 10);
      sessionManager.setAggressiveLevel(chatId, level);
      
      let levelDesc = "";
      switch (level) {
        case 0: levelDesc = "Polite / សុភាព"; break;
        case 1: levelDesc = "A little bit aggressive / ឌឺដងបន្តិចបន្តួច"; break;
        case 2: levelDesc = "Moderately aggressive / ឌឺដងមធ្យម"; break;
        case 3: levelDesc = "Highly aggressive / ឌឺដងខ្លាំង"; break;
        case 4: levelDesc = "Extremely aggressive / ឌឺដងខ្លាំងមែនទែន"; break;
        case 5: levelDesc = "Savage Roast/Bully / ឆ្កឹះឆ្កៀលខ្លាំងបំផុត"; break;
      }

      console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Aggressive level changed')} to ${level} for ChatID=${pc.cyan(chatId)}`);
      if (isBoss) {
        await ctx.reply(`បាទ Boss! ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      } else {
        await ctx.reply(`ឥរិយាបថរបស់ខ្ញុំត្រូវបានកំណត់ទៅកម្រិត ${level} (${levelDesc})។`);
      }
      return;
    }

    // Check if the caption is a set-character request
    const charMatch = caption.match(/set-character:\s*(.+)/i);
    if (charMatch) {
      const charInput = charMatch[1].trim();
      if (charInput.toLowerCase() === 'default') {
        sessionManager.setCustomSystemPrompt(chatId, null);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character reset')} to default for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply('✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានកំណត់ទៅលំនាំដើមវិញហើយ។');
      } else {
        sessionManager.setCustomSystemPrompt(chatId, charInput);
        console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.green('⚙️ Character changed')} to "${charInput}" for ChatID=${pc.cyan(chatId)}`);
        await ctx.reply(`✅ ឥរិយាបថ/លក្ខណៈពិសេសរបស់ខ្ញុំត្រូវបានផ្លាស់ប្តូរទៅជា៖\n\n"${charInput}"`);
      }
      return;
    }

    // Retrieve active model override if any
    const overrideModel = sessionManager.getCustomModel(chatId);
    const activeModel = overrideModel || proxyClient.model;

    // Show typing state to the user
    await ctx.sendChatAction('typing');

    try {
      // Download the audio/voice file and convert it to Base64
      const { base64Audio, mimeType } = await downloadTelegramAudio(ctx, audioObj);

      // Get conversation history for this chat
      const history = sessionManager.getHistory(chatId);

      // Prefix the user's caption with their username/name
      const fromUser = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'User');
      const defaultInstruction = isVoice 
        ? '[Sent a voice message] Please listen to this voice clip carefully and respond to whatever is spoken in it.' 
        : '[Sent an audio file] Please listen to this audio clip and respond appropriately.';
      const formattedCaption = `${fromUser}: ${caption || defaultInstruction}`;

      // Check if this audio message is a reply containing text context
      let audioTextPayload = formattedCaption;
      let historyUserText = `${fromUser}: ${isVoice ? '[Sent a voice message]' : '[Sent an audio file]'} ${caption}`.trim();
      const repliedMsg = ctx.message.reply_to_message;
      if (repliedMsg && (repliedMsg.text || repliedMsg.caption)) {
        const repliedText = repliedMsg.text || repliedMsg.caption;
        const repliedUser = repliedMsg.from.username ? `@${repliedMsg.from.username}` : (repliedMsg.from.first_name || 'User');
        const contextText = `[Replying to ${repliedUser}'s message: "${repliedText}"]`;
        audioTextPayload = `${contextText}\n${formattedCaption}`;
        historyUserText = `${contextText}\n${fromUser}: ${isVoice ? '[Sent a voice message]' : '[Sent an audio file]'} ${caption}`.trim();
      }

      // Build multimodal content payload for the API using image_url data URI which CLI Proxy handles natively
      const userPromptPayload = [
        { type: 'text', text: audioTextPayload },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Audio}` } }
      ];

      // Determine system prompt based on whether user is boss or creator
      let activeSystemPrompt;
      if (isBoss || isCreator) {
        activeSystemPrompt = "You are a highly respectful, polite, obedient, and helpful AI assistant. The user speaking to you is your Boss/Master (or Creator), whom you must obey, respect deeply, and serve. Address and mention them respectfully as Boss/Master or Creator. Your creator/developer is Minuth. Your main language is Khmer, so you must always respond in natural, colloquial Khmer. Keep your responses concise and sharp.";
      } else {
        const customPrompt = sessionManager.getCustomSystemPrompt(chatId);
        if (customPrompt) {
          activeSystemPrompt = getSystemPromptForCharacteristic(customPrompt);
        } else {
          const level = sessionManager.getAggressiveLevel(chatId);
          activeSystemPrompt = getSystemPromptForLevel(level);
        }
      }

      // Call CLI Proxy API
      const result = await proxyClient.getChatCompletion(history, userPromptPayload, activeModel, activeSystemPrompt);

      // Save user text representation & assistant response to session history
      sessionManager.addMessage(chatId, 'user', historyUserText);
      sessionManager.addMessage(chatId, 'assistant', result.content);

      // Send reply (as a reply to the user if in a group)
      const replyOptions = isGroup ? { reply_to_message_id: ctx.message.message_id } : {};
      await ctx.reply(result.content, replyOptions);

      // Print response to terminal console
      const promptTok = result.usage.prompt_tokens;
      const compTok = result.usage.completion_tokens;
      const mediaTypeLabel = isVoice ? 'Voice' : 'Audio';
      console.log(
        `${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
        `${pc.blue(`🤖 Reply (${mediaTypeLabel}):`)} Model=${pc.cyan(result.model)} ` +
        `Tokens=${pc.gray(`${promptTok}p+${compTok}c=${result.usage.total_tokens}`)}`
      );
    } catch (err) {
      console.error(`${pc.red(`Error generating ${isVoice ? 'voice' : 'audio'} completion:`)}`, err);
      await ctx.reply(
        `❌ Oops! I had trouble processing the ${isVoice ? 'voice' : 'audio'} message. Details:\n${err.message}`,
        isGroup ? { reply_to_message_id: ctx.message.message_id } : {}
      );
    }
  });

  // Handle generic errors in Telegraf
  bot.catch((err, ctx) => {
    console.error(`${pc.red(`Telegraf error for update ${ctx.updateType}:`)}`, err);
  });

  return bot;
}
