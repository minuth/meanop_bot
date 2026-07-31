import { FileStorage } from './storage/fileStorage.js';
import { MemoryStorage } from './storage/memoryStorage.js';

/**
 * Manages chat sessions on disk & memory, tracking conversation history and session-specific overrides.
 */
export class SessionManager {
  /**
   * @param {object} [options]
   * @param {number} [options.maxHistoryLength=20] Max number of messages to keep in history per chat
   * @param {object} [options.storage] Pluggable storage adapter
   * @param {string} [options.dbPath] Custom path to sessions db file
   * @param {number} [options.retentionDays=30] Number of days to retain inactive sessions
   */
  constructor(options = {}) {
    this.maxHistoryLength = options.maxHistoryLength || 20;
    this.retentionDays = options.retentionDays || 30;

    if (options.storage) {
      this.storage = options.storage;
    } else {
      try {
        this.storage = new FileStorage(options.dbPath);
      } catch {
        this.storage = new MemoryStorage();
      }
    }

    this.sessions = new Map();
    this.loadSessions();
    this.pruneSessions();
  }

  /**
   * Loads sessions from storage into memory.
   */
  loadSessions() {
    try {
      this.sessions = this.storage.load();
      console.log(`[SessionManager] Loaded ${this.sessions.size} active chat sessions.`);
    } catch (err) {
      console.error(`[SessionManager] Failed to load sessions:`, err.message);
      this.sessions = new Map();
    }
  }

  /**
   * Saves sessions from memory to storage.
   */
  saveSessions() {
    try {
      this.storage.save(this.sessions);
    } catch (err) {
      console.error(`[SessionManager] Failed to save sessions:`, err.message);
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
        model: null,
        systemPrompt: null,
        aggressiveLevel: 1,
        updatedAt: Date.now()
      });
      this.saveSessions();
    }
    return this.sessions.get(key);
  }

  /**
   * Adds a message to a session's history and persists to storage.
   * @param {string|number} chatId
   * @param {string} role 'user' or 'assistant'
   * @param {string} content Message text
   */
  addMessage(chatId, role, content) {
    const session = this.getSession(chatId);
    session.history.push({ role, content });

    if (session.history.length > this.maxHistoryLength) {
      session.history = session.history.slice(-this.maxHistoryLength);
    }

    session.updatedAt = Date.now();
    this.saveSessions();
  }

  /**
   * Gets conversation history for a chat.
   * @param {string|number} chatId
   * @returns {Array<{role: string, content: string}>}
   */
  getHistory(chatId) {
    const session = this.getSession(chatId);
    return session.history || [];
  }

  /**
   * Clears session history & resets settings for a chat.
   * @param {string|number} chatId
   */
  clearSession(chatId) {
    const key = String(chatId);
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
      this.saveSessions();
    }
  }

  setCustomModel(chatId, model) {
    const session = this.getSession(chatId);
    session.model = model;
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  getCustomModel(chatId) {
    const session = this.getSession(chatId);
    return session.model;
  }

  clearCustomModel(chatId) {
    const session = this.getSession(chatId);
    session.model = null;
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  setCustomSystemPrompt(chatId, prompt) {
    const session = this.getSession(chatId);
    session.systemPrompt = prompt;
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  getCustomSystemPrompt(chatId) {
    const session = this.getSession(chatId);
    return session.systemPrompt;
  }

  clearCustomSystemPrompt(chatId) {
    const session = this.getSession(chatId);
    session.systemPrompt = null;
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  setAggressiveLevel(chatId, level) {
    const session = this.getSession(chatId);
    session.aggressiveLevel = Math.max(0, Math.min(5, Number(level) || 0));
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  getAggressiveLevel(chatId) {
    const session = this.getSession(chatId);
    return session.aggressiveLevel !== undefined ? session.aggressiveLevel : 1;
  }
}
