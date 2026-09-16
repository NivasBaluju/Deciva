const Api = (() => {
  const TOKEN_KEY = 'deciva_token';

  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t) {
    sessionStorage.setItem(TOKEN_KEY, t);
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function request(method, url, body, isForm = false, timeoutMs = 30000) {
    const headers = {};
    const token = getToken();
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

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.blob();
    }

    if (!res.ok) {
      const message = (data && data.error) || 'Request failed';
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    getToken, setToken, clearToken,
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body || {}),
    del: (url) => request('DELETE', url),
    upload: (url, formData) => request('POST', url, formData, true)
  };
})();
