import { getValidAuth, CONFIG } from './antigravity.js';
import pc from 'picocolors';

/**
 * Text-to-Speech (TTS) Service supporting Gemini 3.1 Flash TTS and Google Speech Synthesis fallback.
 */

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
 * Attempt to generate speech using native Gemini 3.1 Flash TTS API if GEMINI_API_KEY is available.
 * @param {string} text
 * @param {string} [refreshToken]
 * @returns {Promise<Buffer|null>}
 */
async function generateGeminiFlashTTS(text, refreshToken) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. Try Gemini API key via generativelanguage.googleapis.com if API key is provided
  if (apiKey) {
    try {
      const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck'
                }
              }
            }
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const audioPart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
        if (audioPart && audioPart.inlineData?.data) {
          console.log(`${pc.green('[TTS]')}${pc.cyan('[Gemini 3.1 Flash]')}: Native audio generated via GEMINI_API_KEY`);
          const rawBuf = Buffer.from(audioPart.inlineData.data, 'base64');
          const mime = audioPart.inlineData.mimeType || '';

          // Gemini API returns headerless PCM audio. Wrap raw PCM bytes in RIFF WAV container.
          if (mime.includes('pcm') || !mime.includes('mp3')) {
            const rateMatch = mime.match(/rate=(\d+)/);
            const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
            return pcmToWav(rawBuf, sampleRate);
          }
          return rawBuf;
        }
      } else {
        const errText = await res.text();
        console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini API Key Error]')}: ${res.status} - ${errText.slice(0, 150)}`);
      }
    } catch (err) {
      console.warn(`${pc.yellow('[TTS]')}${pc.red('[Gemini API Key Exception]')}: ${err.message}`);
    }
  }

  // 2. Try Antigravity OAuth token if provided
  if (refreshToken) {
    try {
      const { accessToken, projectId } = await getValidAuth(refreshToken);
      const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.6-flash-low';
      const url = `${CONFIG.BASE_URL}${CONFIG.GENERATE_CONTENT_PATH}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': CONFIG.USER_AGENT
        },
        body: JSON.stringify({
          project: projectId,
          model: model,
          request: {
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: {
              responseModalities: ['AUDIO']
            }
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const candidate = (data?.response || data)?.candidates?.[0];
        const audioPart = candidate?.content?.parts?.find(p => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
        if (audioPart && audioPart.inlineData?.data) {
          console.log(`${pc.green('[TTS]')}${pc.cyan('[Antigravity Cloud Code]')}: Native audio generated`);
          const rawBuf = Buffer.from(audioPart.inlineData.data, 'base64');
          const mime = audioPart.inlineData.mimeType || '';

          if (mime.includes('pcm') || !mime.includes('mp3')) {
            const rateMatch = mime.match(/rate=(\d+)/);
            const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
            return pcmToWav(rawBuf, sampleRate);
          }
          return rawBuf;
        }
      }
    } catch (err) {
      console.warn(`${pc.yellow('[TTS]')}${pc.red('[Antigravity OAuth Error]')}: ${err.message}`);
    }
  }

  return null;
}

/**
 * Generate Text-To-Speech audio buffer for Gemini response.
 * Uses Gemini 3.1 Flash TTS API if GEMINI_API_KEY/OAuth audio is active, or Google Speech synthesis as fallback.
 * @param {string} text
 * @param {string} [langOverride]
 * @param {string} [refreshToken]
 * @returns {Promise<Buffer>} Audio Buffer
 */
export async function generateTTS(text, langOverride, refreshToken) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    throw new Error('No speakable text found in AI response.');
  }

  // 1. Try native Gemini Flash TTS
  const geminiAudio = await generateGeminiFlashTTS(cleaned, refreshToken);
  if (geminiAudio) {
    return geminiAudio;
  }

  // 2. Synthesize audio voice note
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
