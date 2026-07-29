/**
 * Client for communicating with the CLI Proxy API.
 */
export class ProxyClient {
  /**
   * @param {object} config
   * @param {string} config.proxyUrl Base URL of the CLI Proxy (e.g., http://localhost:8317/v1)
   * @param {string} config.proxyKey API Key for proxy authentication
   * @param {string} config.model Default AI model to use
   * @param {string} config.systemPrompt Default system instructions
   */
  constructor({ proxyUrl, proxyKey, model, systemPrompt }) {
    this.proxyUrl = proxyUrl.replace(/\/$/, ''); // Remove trailing slash if any
    this.proxyKey = proxyKey;
    this.model = model;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Gets headers required for Proxy API calls.
   * @returns {object}
   */
  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.proxyKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetches the list of available models from the proxy.
   * @returns {Promise<Array<object>>} List of model objects
   */
  async fetchModels() {
    const url = `${this.proxyUrl}/models`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this._getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (err) {
      throw new Error(`Failed to fetch models from proxy: ${err.message}`);
    }
  }

  /**
   * Sends a chat prompt along with history to the proxy API completions endpoint.
   * @param {Array<{role: string, content: string}>} history Chat history messages
   * @param {string} userPrompt The latest prompt from the user
   * @param {string} [overrideModel] Optional model to override the default
   * @param {string} [systemPromptOverride] Optional system prompt override
   * @returns {Promise<{content: string, usage: object, model: string}>}
   */
  async getChatCompletion(history, userPrompt, overrideModel = null, systemPromptOverride = null) {
    const url = `${this.proxyUrl}/chat/completions`;
    const selectedModel = overrideModel || this.model;

    // Build the messages array with system prompt first
    const messages = [];
    const activeSystemPrompt = systemPromptOverride !== null ? systemPromptOverride : this.systemPrompt;
    if (activeSystemPrompt) {
      messages.push({
        role: 'system',
        content: activeSystemPrompt
      });
    }

    // Append chat history
    messages.push(...history);

    // Append current user message
    messages.push({
      role: 'user',
      content: userPrompt
    });

    const body = {
      model: selectedModel,
      messages: messages
    };

    if (selectedModel.toLowerCase().includes('gemini')) {
      body.tools = [
        {
          google_search: {}
        }
      ];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error('Proxy returned empty choices in response.');
      }

      const assistantMessage = result.choices[0].message;
      const content = assistantMessage ? assistantMessage.content : '';
      
      return {
        content: content,
        usage: result.usage || { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 },
        model: result.model || selectedModel
      };
    } catch (err) {
      throw new Error(`CLI Proxy API request failed: ${err.message}`);
    }
  }
}
