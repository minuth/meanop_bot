import { getValidAuth, openAIToAntigravity, antigravityToOpenAIJSON, fetchAvailableModels, CONFIG } from './antigravity.js';

/**
 * Embedded AI Client for direct communication with Google Antigravity API.
 */
export class ProxyClient {
  /**
   * @param {object} config
   * @param {string} [config.refreshToken] Refresh token for Antigravity OAuth
   * @param {string} [config.proxyUrl] Display URL / label
   * @param {string} config.model Default AI model to use
   * @param {string} config.systemPrompt Default system instructions
   */
  constructor({ refreshToken, proxyUrl, model, systemPrompt }) {
    this.refreshToken = refreshToken;
    this.proxyUrl = proxyUrl || 'Embedded Antigravity API (Direct)';
    this.model = model;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Fetches the list of available models from Google Antigravity API.
   * @returns {Promise<Array<object>>} List of model objects
   */
  async fetchModels() {
    if (!this.refreshToken) return [];
    try {
      const { accessToken } = await getValidAuth(this.refreshToken);
      return await fetchAvailableModels(accessToken);
    } catch (err) {
      throw new Error(`Failed to fetch models: ${err.message}`);
    }
  }

  /**
   * Sends a chat prompt along with history to Google Antigravity API directly.
   * @param {Array<{role: string, content: string}>} history Chat history messages
   * @param {string|Array} userPrompt The latest prompt from the user
   * @param {string} [overrideModel] Optional model to override default
   * @param {string} [systemPromptOverride] Optional system prompt override
   * @returns {Promise<{content: string, usage: object, model: string}>}
   */
  async getChatCompletion(history, userPrompt, overrideModel = null, systemPromptOverride = null) {
    if (!this.refreshToken) {
      throw new Error('Missing ANTIGRAVITY_REFRESH_TOKEN. Please configure it in your .env file or auths/antigravity.json');
    }

    const selectedModel = overrideModel || this.model;
    const activeSystemPrompt = systemPromptOverride !== null ? systemPromptOverride : this.systemPrompt;

    const messages = [];
    if (activeSystemPrompt) {
      messages.push({
        role: 'system',
        content: activeSystemPrompt
      });
    }

    messages.push(...history);
    messages.push({
      role: 'user',
      content: userPrompt
    });

    try {
      const { accessToken, projectId } = await getValidAuth(this.refreshToken);
      const payload = openAIToAntigravity({ model: selectedModel, messages }, projectId);

      if (selectedModel.toLowerCase().includes('gemini')) {
        payload.request.tools = [{ google_search: {} }];
      }

      const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.GENERATE_CONTENT_PATH}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': CONFIG.USER_AGENT
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Antigravity API error (${res.status}): ${errorText}`);
      }

      const rawData = await res.json();
      return antigravityToOpenAIJSON(rawData, selectedModel);
    } catch (err) {
      throw new Error(`AI API request failed: ${err.message}`);
    }
  }
}
