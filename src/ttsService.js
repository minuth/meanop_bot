import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

/**
 * Text-to-Speech (TTS) Service supporting Gemini Live API WebSocket and Google Speech Synthesis fallback.
 */

function logLiveApiDebug(entryText) {
  try {
    const dir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const logPath = path.join(dir, 'live_api_debug.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `\n=== [${timestamp}] ===\n${entryText}\n`);
    console.log(`${pc.gray(`[${new Date().toLocaleTimeString()}]`)} ${pc.blue('📝 [Debug Log Saved]:')} scratch/live_api_debug.txt`);
  } catch (_) {}
}

/**
 * Convert raw headerless 16-bit PCM audio buffer into a valid WAV file buffer.
 * @param {Buffer} pcmBuffer
 * @param {number} sampleRate Default 24000 Hz
 * @param {number} numChannels Default 1 (mono)
 * @param {number} bitDepth Default 16 bit
 * @returns {Buffer}
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
  const header = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Clean markdown and code formatting from text for Speech Synthesis.
 * @param {string} text
 * @returns {string}
 */
export function cleanTextForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/[*_~#>-]/g, '') // Markdown symbols
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect language from text (Khmer vs English/default).
 * @param {string} text
 * @returns {string} Language code ('km' or 'en')
 */
export function detectLanguage(text) {
  return /[\u1780-\u17FF]/.test(text) ? 'km' : 'en';
}

/**
 * Synthesize a single chunk of text over Gemini Live API WebSocket.
 * @param {string} chunkText
 * @param {string} apiKey
 * @param {string} [systemInstruction]
 * @returns {Promise<Buffer|null>} Raw PCM buffer for chunk
 */
async function generateGeminiLiveAudioChunkOnce(chunkText, apiKey, systemInstruction) {
  if (typeof WebSocket === 'undefined') return null;

  return new Promise((resolve) => {
    let resolved = false;
    let ws = null;

    const safeResolve = (val) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve(val);
      }
    };

    const timeoutId = setTimeout(() => {
      if (ws) { try { ws.close(); } catch (_) {} }
      safeResolve(null);
    }, 20000);

    try {
      const rawModel = process.env.GEMINI_LIVE_MODEL || 'models/gemini-3.1-flash-live-preview';
      const model = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      ws = new WebSocket(wsUrl);
      const pcmBuffers = [];
      let sentContent = false;

      const sendContent = () => {
        if (sentContent) return;
        sentContent = true;
        const promptText = `Please read the following text verbatim as speech:\n\n"${chunkText}"`;

        ws.send(JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [{ text: promptText }]
              }
            ],
            turnComplete: true
          }
        }));
      };

      ws.addEventListener('open', () => {
        const defaultTTSInstruction = 'You are a dedicated Text-To-Speech (TTS) synthesis engine. Your sole task is to read out the exact input text verbatim in natural, expressive audio. Do not answer questions, do not add conversational introductory/closing remarks, and do not modify the text.';

        const setupPayload = {
          model: model,
          systemInstruction: {
            parts: [{ text: systemInstruction || defaultTTSInstruction }]
          },
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' }
              }
            }
          }
        };

        ws.send(JSON.stringify({ setup: setupPayload }));
      });

      ws.addEventListener('message', async (event) => {
        try {
          let str;
          if (typeof event.data === 'string') {
            str = event.data;
          } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
            str = await event.data.text();
          } else {
            str = Buffer.from(event.data).toString('utf8');
          }

          const msg = JSON.parse(str);

          if (msg.setupComplete) {
            sendContent();
            return;
          }

          if (msg.serverContent) {
            const turn = msg.serverContent.modelTurn;
            if (turn && turn.parts) {
              for (const p of turn.parts) {
                if (p.inlineData && p.inlineData.data) {
                  pcmBuffers.push(Buffer.from(p.inlineData.data, 'base64'));
                }
              }
            }
            if (msg.serverContent.turnComplete || msg.serverContent.generationComplete) {
              if (pcmBuffers.length > 0) {
                safeResolve(Buffer.concat(pcmBuffers));
              } else {
                safeResolve(null);
              }
              try { ws.close(); } catch (_) {}
            }
          }
        } catch (err) {
          console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini Live API Frame Error]')}: ${err.message}`);
        }
      });

      ws.addEventListener('error', (err) => {
        console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini Live API WebSocket Error]')}: ${err.message || 'Connection failed'}`);
        safeResolve(null);
      });

      ws.addEventListener('close', () => {
        if (pcmBuffers.length > 0) {
          safeResolve(Buffer.concat(pcmBuffers));
        } else {
          safeResolve(null);
        }
      });
    } catch (err) {
      console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini Live API Exception]')}: ${err.message}`);
      safeResolve(null);
    }
  });
}

/**
 * Synthesize a single chunk of text with 1 retry.
 * @param {string} chunkText
 * @param {string} apiKey
 * @param {string} [systemInstruction]
 * @returns {Promise<Buffer|null>}
 */
async function generateGeminiLiveAudioChunk(chunkText, apiKey, systemInstruction) {
  let pcm = await generateGeminiLiveAudioChunkOnce(chunkText, apiKey, systemInstruction);
  if (!pcm) {
    // Retry once on failure
    await new Promise((r) => setTimeout(r, 400));
    pcm = await generateGeminiLiveAudioChunkOnce(chunkText, apiKey, systemInstruction);
  }
  return pcm;
}

/**
 * Splits text strictly on full sentence boundaries (Khmer '។', '.', '!', '?', '\n') to avoid cutting proper nouns or mid-sentence phrases.
 * @param {string} text
 * @param {number} maxChunkLength Default 300
 * @returns {string[]}
 */
export function splitTextIntoSentences(text, maxChunkLength = 300) {
  if (!text) return [];
  const rawSentences = text.split(/(?<=[។\.\!\?\n])\s*/);
  const chunks = [];
  let currentChunk = '';

  for (const rawSentence of rawSentences) {
    const trimmed = rawSentence.trim();
    if (!trimmed) continue;

    if ((currentChunk + ' ' + trimmed).length <= maxChunkLength) {
      currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = trimmed;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Generate speech using Gemini Live API WebSocket, splitting long text into manageable sentence chunks.
 * @param {string} text
 * @param {string} apiKey
 * @param {string} [systemInstruction]
 * @returns {Promise<Buffer|null>}
 */
async function generateGeminiLiveAudio(text, apiKey, systemInstruction) {
  if (typeof WebSocket === 'undefined' || !text) return null;

  // Cap voice synthesis input length to 1200 characters for optimal audio size and speed
  const truncatedText = text.length > 1200 ? text.slice(0, 1200) + '...' : text;
  const chunks = splitTextIntoSentences(truncatedText, 280);

  // logLiveApiDebug(`FULL SUBMITTED TEXT (${text.length} chars):\n"${text}"\n\nCHUNKS SUBMITTED TO LIVE API (${chunks.length}):\n${chunks.map((c, i) => `[Chunk ${i + 1}]: "${c.trim()}"`).join('\n')}`);

  // Synthesize chunks sequentially to prevent WebSocket API concurrency rate limiting
  const allPcm = [];
  for (let i = 0; i < chunks.length; i++) {
    const trimmed = chunks[i].trim();
    if (!trimmed) continue;
    const chunkPcm = await generateGeminiLiveAudioChunk(trimmed, apiKey, systemInstruction);
    if (chunkPcm) {
      allPcm.push(chunkPcm);
    } else {
      console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini Live API Chunk Warning]')}: Chunk ${i + 1}/${chunks.length} failed to generate PCM audio`);
    }
  }

  if (allPcm.length > 0) {
    const fullPcm = Buffer.concat(allPcm);
    console.log(`${pc.green('[TTS]')}${pc.cyan('[Gemini Live API WebSocket]')}: Native audio generated (${fullPcm.length} bytes across ${allPcm.length}/${chunks.length} chunk(s))`);
    return pcmToWav(fullPcm, 24000);
  }

  return null;
}

/**
 * Generate Text-To-Speech audio buffer for Gemini response.
 * Primary: Gemini Live API WebSocket (parallel chunked native audio).
 * Fallback: Google Speech Synthesis.
 * @param {string} text
 * @param {string} [langOverride]
 * @param {string} [refreshToken]
 * @param {string} [systemInstruction]
 * @returns {Promise<Buffer>} Audio Buffer
 */
export async function generateTTS(text, langOverride, refreshToken, systemInstruction) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    throw new Error('No speakable text found in AI response.');
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. Try Gemini Live API WebSocket if API Key is available
  if (apiKey) {
    const liveAudio = await generateGeminiLiveAudio(cleaned, apiKey, systemInstruction);
    if (liveAudio) {
      return liveAudio;
    }
    console.warn(`${pc.yellow('[TTS]')}${pc.red('[Live API Fallback Triggered]')}: Gemini Live API returned no audio, falling back to Google Speech Synthesis...`);
  } else {
    console.warn(`${pc.yellow('[TTS]')}${pc.red('[No API Key Provided]')}: GEMINI_API_KEY missing, using Google Speech Synthesis fallback...`);
  }

  // 2. Synthesize audio voice note (Google Translate TTS fallback)
  const lang = langOverride || detectLanguage(cleaned);
  console.log(`${pc.green('[TTS]')}${pc.cyan('[Voice Generator]')}: Synthesizing audio voice note (${lang.toUpperCase()})...`);
  const chunks = cleaned.match(/.{1,180}(?=\s|[\.\,\!\?\u17D4]|$)|.{1,180}/g) || [cleaned];
  const buffers = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmed)}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      throw new Error(`TTS service error (${res.status})`);
    }

    const arrayBuf = await res.arrayBuffer();
    buffers.push(Buffer.from(arrayBuf));
  }

  return Buffer.concat(buffers);
}
