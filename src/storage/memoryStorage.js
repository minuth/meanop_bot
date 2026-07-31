/**
 * Ephemeral in-memory storage adapter for serverless / edge environments.
 */
export class MemoryStorage {
  constructor() {
    this.memoryStore = new Map();
  }

  load() {
    return new Map(this.memoryStore);
  }

  save(sessions) {
    this.memoryStore = new Map(sessions);
  }
}
