/**
 * API client - fetch() wrapper for backend calls.
 */
const Api = {
  baseUrl: '',

  async getFlips() {
    try {
      const res = await fetch(this.baseUrl + '/api/flips');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] getFlips error:', err);
      return { success: false, flips: [], lastUpdate: 0 };
    }
  },

  async getAhFlips(mode = 'both') {
    try {
      const res = await fetch(this.baseUrl + '/api/flips/ah?mode=' + encodeURIComponent(mode));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] getAhFlips error:', err);
      return { success: false, flips: [], lastUpdate: 0 };
    }
  },

  async getCraftFlips() {
    try {
      const res = await fetch(this.baseUrl + '/api/flips/craft');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] getCraftFlips error:', err);
      return { success: false, flips: [], lastUpdate: 0 };
    }
  },

  async getAhCraftFlips() {
    try {
      const res = await fetch(this.baseUrl + '/api/flips/ah-craft');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] getAhCraftFlips error:', err);
      return { success: false, flips: [], lastUpdate: 0 };
    }
  },

  async getStatus() {
    try {
      const res = await fetch(this.baseUrl + '/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] getStatus error:', err);
      return { success: false, lastUpdate: 0, productCount: 0, flipCount: 0 };
    }
  },

  async searchAuctions(params) {
    try {
      const qs = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') qs.set(key, val);
      }
      const res = await fetch(this.baseUrl + '/api/auctions/search?' + qs.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] searchAuctions error:', err);
      return { success: false, totalResults: 0, auctions: [] };
    }
  },

  async searchItems(query) {
    try {
      const res = await fetch(this.baseUrl + '/api/items/search?q=' + encodeURIComponent(query));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('[API] searchItems error:', err);
      return { success: false, items: [] };
    }
  },
};
