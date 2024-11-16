class TranscriptStorage {
  static CACHE_KEY = 'youtube_transcripts_cache';
  static MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours
  static MAX_CACHE_SIZE = 50; // Maximum number of transcripts to cache

  static async getFromCache(videoId) {
    try {
      const cache = await this.getCache();
      const cachedData = cache[videoId];

      if (!cachedData) {
        return null;
      }

      // Check if cache is expired
      if (Date.now() - cachedData.timestamp > this.MAX_CACHE_AGE) {
        await this.removeFromCache(videoId);
        return null;
      }

      return cachedData.data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  }

  static async saveToCache(videoId, transcriptData) {
    try {
      const cache = await this.getCache();
      
      // Add new data with timestamp
      cache[videoId] = {
        timestamp: Date.now(),
        data: transcriptData
      };

      // Remove oldest entries if cache is too large
      const entries = Object.entries(cache);
      if (entries.length > this.MAX_CACHE_SIZE) {
        const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const entriesToRemove = sortedEntries.slice(0, entries.length - this.MAX_CACHE_SIZE);
        entriesToRemove.forEach(([key]) => delete cache[key]);
      }

      await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
      return true;
    } catch (error) {
      console.error('Error saving to cache:', error);
      return false;
    }
  }

  static async removeFromCache(videoId) {
    try {
      const cache = await this.getCache();
      delete cache[videoId];
      await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
      return true;
    } catch (error) {
      console.error('Error removing from cache:', error);
      return false;
    }
  }

  static async getCache() {
    try {
      const result = await chrome.storage.local.get(this.CACHE_KEY);
      return result[this.CACHE_KEY] || {};
    } catch (error) {
      console.error('Error getting cache:', error);
      return {};
    }
  }

  static async clearCache() {
    try {
      await chrome.storage.local.remove(this.CACHE_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }
}
