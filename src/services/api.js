const TOKEN_KEY = 'deciva_token';

export const Api = {
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('docugaurd_token');
      localStorage.removeItem('token');
    } catch (e) {}
  },
  clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('docugaurd_token');
      localStorage.removeItem('token');
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
