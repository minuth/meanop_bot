import fs from 'fs';
import path from 'path';

/**
 * Node.js filesystem storage adapter for session persistence.
 */
export class FileStorage {
  /**
   * @param {string} [filePath] Absolute or relative path to JSON session file
   */
  constructor(filePath) {
    this.filePath = filePath || path.resolve(process.cwd(), 'sessions.json');
  }

  /**
   * Loads sessions Map from file.
   * @returns {Map<string, object>}
   */
  load() {
    const sessions = new Map();
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null) {
          for (const [key, value] of Object.entries(data)) {
            sessions.set(key, value);
          }
        }
      }
    } catch (err) {
      console.warn(`[FileStorage] Failed to read sessions file: ${err.message}`);
    }
    return sessions;
  }

  /**
   * Saves sessions Map to file.
   * @param {Map<string, object>} sessions
   */
  save(sessions) {
    try {
      const obj = Object.fromEntries(sessions.entries());
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error(`[FileStorage] Failed to save sessions file: ${err.message}`);
    }
  }
}
