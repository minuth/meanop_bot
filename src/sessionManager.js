import fs from 'fs';
import path from 'path';

/**
 * Manages chat sessions on disk & memory, tracking conversation history and session-specific overrides.
 */
export class SessionManager {
  /**
   * @param {object} [options]
   * @param {number} [options.maxHistoryLength=20] Max number of messages to keep in history per chat
   * @param {string} [options.dbPath] Custom path to sessions db file
   * @param {number} [options.retentionDays=30] Number of days to retain inactive sessions
   */
  constructor(options = {}) {
    this.sessions = new Map();
    this.maxHistoryLength = options.maxHistoryLength || 20;
    this.dbPath = options.dbPath || path.resolve(process.cwd(), 'sessions.json');
    this.retentionDays = options.retentionDays || 30;

    // Load existing sessions and run initial pruning
    this.loadSessions();
    this.pruneSessions();
  }

  /**
   * Loads sessions from local JSON file into memory.
   */
  loadSessions() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        this.sessions = new Map(Object.entries(parsed));
        console.log(`[SessionManager] Loaded ${this.sessions.size} active chat sessions from disk (${this.dbPath}).`);
      }
    } catch (err) {
      console.error(`[SessionManager] Failed to load sessions from ${this.dbPath}:`, err);
      this.sessions = new Map();
    }
  }

  /**
   * Saves sessions from memory to local JSON file.
   */
  saveSessions() {
    try {
      const obj = Object.fromEntries(this.sessions);
      fs.writeFileSync(this.dbPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error(`[SessionManager] Failed to save sessions to ${this.dbPath}:`, err);
    }
  }

  /**
   * Prunes sessions that have been inactive for more than retentionDays.
   */
  pruneSessions() {
    const now = Date.now();
    const maxAgeMs = this.retentionDays * 24 * 60 * 60 * 1000;
    let prunedCount = 0;

    for (const [chatId, session] of this.sessions.entries()) {
      const age = now - (session.updatedAt || 0);
      if (age > maxAgeMs) {
        this.sessions.delete(chatId);
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      console.log(`[SessionManager] Pruned ${prunedCount} inactive sessions older than ${this.retentionDays} days.`);
      this.saveSessions();
    }
  }

  /**
   * Resolves or initializes a session for a given chat ID.
   * @param {string|number} chatId Unique identifier for the Telegram chat
   * @returns {object} The chat session object
   */
  getSession(chatId) {
    const key = String(chatId);
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        history: [],
        model: null, // No override by default
        systemPrompt: null, // No custom system prompt by default
        aggressiveLevel: 1, // Default aggressive level is 1
        updatedAt: Date.now() // Track initialization/last activity timestamp
      });
    }
    return this.sessions.get(key);
  }

  /**
   * Updates the session activity timestamp and triggers save.
   * @param {string|number} chatId
   */
  updateSessionActivity(chatId) {
    const session = this.getSession(chatId);
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  /**
   * Gets the conversation history for a given chat.
   * @param {string|number} chatId
   * @returns {Array<{role: string, content: string}>}
   */
  getHistory(chatId) {
    return this.getSession(chatId).history;
  }

  /**
   * Appends a message to the chat history and enforces length limits.
   * @param {string|number} chatId
   * @param {'user'|'assistant'} role Role of the sender
   * @param {string} content Content of the message
   */
  addMessage(chatId, role, content) {
    const session = this.getSession(chatId);
    session.history.push({ role, content });

    // Keep history trimmed to maxHistoryLength
    if (session.history.length > this.maxHistoryLength) {
      session.history = session.history.slice(session.history.length - this.maxHistoryLength);
    }
    
    this.updateSessionActivity(chatId);
  }

  /**
   * Retrieves the model override for a given chat.
   * @param {string|number} chatId
   * @returns {string|null} The custom model name or null
   */
  getCustomModel(chatId) {
    return this.getSession(chatId).model;
  }

  /**
   * Sets a model override for a given chat.
   * @param {string|number} chatId
   * @param {string|null} model The custom model name, or null to clear override
   */
  setCustomModel(chatId, model) {
    const session = this.getSession(chatId);
    session.model = model;
    this.updateSessionActivity(chatId);
  }

  /**
   * Retrieves the custom system prompt override for a given chat.
   * @param {string|number} chatId
   * @returns {string|null} The custom system prompt or null
   */
  getCustomSystemPrompt(chatId) {
    return this.getSession(chatId).systemPrompt;
  }

  /**
   * Sets the custom system prompt override for a given chat.
   * @param {string|number} chatId
   * @param {string|null} prompt The custom system prompt, or null to clear
   */
  setCustomSystemPrompt(chatId, prompt) {
    const session = this.getSession(chatId);
    session.systemPrompt = prompt;
    this.updateSessionActivity(chatId);
  }

  /**
   * Retrieves the aggressive level for a given chat.
   * @param {string|number} chatId
   * @returns {number} The aggressive level
   */
  getAggressiveLevel(chatId) {
    return this.getSession(chatId).aggressiveLevel;
  }

  /**
   * Sets the aggressive level for a given chat.
   * @param {string|number} chatId
   * @param {number} level The aggressive level (0 to 5)
   */
  setAggressiveLevel(chatId, level) {
    const session = this.getSession(chatId);
    session.aggressiveLevel = level;
    this.updateSessionActivity(chatId);
  }

  /**
   * Resets the history and configuration for a given chat.
   * @param {string|number} chatId
   */
  clearSession(chatId) {
    const key = String(chatId);
    if (this.sessions.has(key)) {
      this.sessions.set(key, {
        history: [],
        model: null,
        systemPrompt: null,
        aggressiveLevel: 1,
        updatedAt: Date.now()
      });
      this.saveSessions();
    }
  }
}
