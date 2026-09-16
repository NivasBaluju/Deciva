const TOKEN_KEY = 'deciva_token';

// In-memory token override for non-cookie programmatic callers / test harnesses.
// In standard browser execution, authentication is governed 100% via httpOnly
// cookies via credentials: 'include' (GAP-01).
let _inMemoryToken = null;

export const Api = {
  getToken() {
    return _inMemoryToken;
  },
  setToken(token) {
    _inMemoryToken = token || null;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('token');
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  },
  clearToken() {
    _inMemoryToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('token');
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  },

  async request(method, url, body, isForm = false, timeoutMs = 30000) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm && body) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Request timed out. Please check your network or try again.');
      }
      throw fetchErr;
    }
    clearTimeout(timer);

    if (!res.ok) {
      let errorMessage = `Request failed (${res.status} ${res.statusText || ''})`.trim();
      let errorData = null;
      try {
        const text = await res.text();
        try {
          errorData = JSON.parse(text);
          if (errorData && (errorData.error || errorData.message)) {
            errorMessage = errorData.error || errorData.message;
          }
        } catch {
          if (text && text.trim().length > 0 && text.trim().length < 400) {
            errorMessage = text.trim();
          }
        }
      } catch {
      }

      const err = new Error(errorMessage);
      err.status = res.status;
      err.data = errorData;
      throw err;
    }

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.blob();
    }
    return data;
  },

  get(url) {
    return this.request('GET', url);
  },
  post(url, body) {
    return this.request('POST', url, body || {});
  },
  patch(url, body) {
    return this.request('PATCH', url, body || {});
  },
  del(url) {
    return this.request('DELETE', url);
  },
  upload(url, formData) {
    return this.request('POST', url, formData, true);
  }
};

export default Api;
