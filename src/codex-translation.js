/* Standalone ChatGPT device OAuth. No CLI, shared auth files, or other plugins. */
function createCodexTranslator(deps) {
  const {Z, Services} = deps;
  const issuer = 'https://auth.openai.com';
  // Public OAuth client identifier used by the Codex device authorization protocol.
  const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';
  const endpoint = 'https://chatgpt.com/backend-api/codex/responses';
  const realm = 'Zotero-Obsidian Connector ChatGPT OAuth';
  const origin = 'chrome://zotero-obsidian-connector';
  const timers = deps.timers || Z.getMainWindow();
  const now = deps.now || Date.now;
  let pendingLogin = null, refreshPromise = null, generation = 0;
  const activeRequests = new Set();
  let storageQueue = Promise.resolve();
  // Serialize refresh/login/logout writes so a late network response cannot restore a logout.
  function serializeStorage(operation) {
    const result = storageQueue.then(operation);
    storageQueue = result.catch(() => {});
    return result;
  }
  const store = deps.credentialStore || {
    async entries() { return Services.logins.findLogins(origin, null, realm); },
    async read() {
      const entry = (await this.entries())[0];
      if (!entry) return null;
      try { return JSON.parse(entry.password); }
      catch (_) { throw new Error('Saved ChatGPT login is invalid. Sign out and sign in again.'); }
    },
    async write(value) {
      const w = Z.getMainWindow();
      const login = w.Components.classes['@mozilla.org/login-manager/loginInfo;1']
        .createInstance(w.Components.interfaces.nsILoginInfo);
      login.init(origin, null, realm, 'oauth', JSON.stringify(value), '', '');
      const entries = await this.entries();
      if (entries.length) Services.logins.modifyLogin(entries[0], login);
      else await Services.logins.addLoginAsync(login);
      for (const duplicate of entries.slice(1)) Services.logins.removeLogin(duplicate);
    },
    async clear() { for (const entry of await this.entries()) Services.logins.removeLogin(entry); }
  };
  async function readCredential() {
    try { return await serializeStorage(() => store.read()); }
    catch (_) { throw new Error('Cannot read the connector login from Zotero password storage.'); }
  }
  async function saveCredential(credential, epoch) {
    return serializeStorage(async () => {
      if (epoch !== generation) throw new Error('ChatGPT operation was cancelled.');
      try { await store.write(credential); }
      catch (_) { throw new Error('Cannot save the connector login in Zotero password storage.'); }
    });
  }
  function decodeClaims(token) {
    try {
      const encoded = String(token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const decode = deps.atob || Z.getMainWindow().atob.bind(Z.getMainWindow());
      return JSON.parse(decode(encoded.padEnd(encoded.length + (4 - encoded.length % 4) % 4, '=')));
    } catch (_) { return {}; }
  }
  function credentialFrom(tokens, previous = null) {
    if (typeof tokens?.access_token !== 'string' || !tokens.access_token.trim()) {
      throw new Error('ChatGPT did not return an access token. Start sign-in again.');
    }
    const claims = decodeClaims(tokens.access_token), identity = decodeClaims(tokens.id_token);
    const expires = Number(tokens.expires_in);
    const credential = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || previous?.refreshToken || '',
      accountId: claims['https://api.openai.com/auth']?.chatgpt_account_id ||
        identity['https://api.openai.com/auth']?.chatgpt_account_id || previous?.accountId || '',
      expiresAt: Number(claims.exp) * 1000 || (Number.isFinite(expires) && expires > 0 ? now() + expires * 1000 : now() + 3600000)
    };
    if (!credential.refreshToken) throw new Error('ChatGPT did not return a refresh token. Start sign-in again.');
    return credential;
  }
  const expired = credential => !credential?.accessToken || Number(credential.expiresAt || 0) <= now() + 60000;
  function failure(status, action) {
    const error = new Error('ChatGPT ' + action + ' failed' + (status ? ' (HTTP ' + status + ')' : '') +
      '. Use Tools → Zotero–Obsidian Connector: ChatGPT login… to sign in again.');
    error.status = status;
    return error;
  }
  async function request(url, payload, {form = false, headers = {}, action = 'request', timeout = 30000} = {}) {
    const requestHeaders = {'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...headers};
    let controller, timeoutID;
    try {
      // Native fetch avoids Zotero HTTP debug logging of token exchange bodies.
      if (deps.request) return await deps.request(url, {payload, headers: requestHeaders, form});
      const w = Z.getMainWindow();
      controller = new w.AbortController();
      activeRequests.add(controller);
      timeoutID = timers.setTimeout(() => controller.abort(), timeout);
      const body = form ? Object.entries(payload).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : JSON.stringify(payload);
      const response = await w.fetch(url, {method: 'POST', headers: requestHeaders, body,
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal});
      if (!response.ok) throw {status: response.status};
      return await response.text();
    } catch (error) {
      // Never propagate server text, fetch options, or raw exceptions containing tokens.
      throw failure(Number(error?.status || 0), action);
    } finally {
      if (timeoutID !== undefined) timers.clearTimeout(timeoutID);
      if (controller) activeRequests.delete(controller);
    }
  }
  function json(raw) {
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (_) { throw new Error('ChatGPT returned an invalid response. Please try again.'); }
  }
  async function status() {
    const credential = await readCredential();
    return {installed: true, signedIn: !!credential?.accessToken && (!expired(credential) || !!credential.refreshToken),
      mode: 'connector-oauth', message: credential ? 'The connector has its own ChatGPT login.' : 'Sign in to ChatGPT from the connector Tools menu.'};
  }
  function cancelLogin() {
    if (pendingLogin) { pendingLogin.cancelled = true; pendingLogin.wake?.(); }
  }
  async function login({onCode} = {}) {
    if (pendingLogin) throw new Error('ChatGPT sign-in is already in progress. Finish or cancel the current sign-in.');
    if (typeof onCode !== 'function') throw new Error('Open ChatGPT login from the connector Tools menu.');
    const session = {cancelled: false}, epoch = ++generation;
    pendingLogin = session;
    const check = () => {
      if (session.cancelled || epoch !== generation) throw new Error('ChatGPT sign-in cancelled.');
    };
    try {
      const code = json(await request(issuer + '/api/accounts/deviceauth/usercode', {client_id: clientId}, {action: 'sign-in'}));
      check();
      const userCode = code?.user_code || code?.usercode;
      if (typeof userCode !== 'string' || !userCode || typeof code.device_auth_id !== 'string' || !code.device_auth_id) {
        throw new Error('ChatGPT returned an invalid device code. Start sign-in again.');
      }
      const deadline = now() + 15 * 60 * 1000;
      let interval = Math.max(1000, Math.min(30000, Number(code.interval) * 1000 || 5000));
      await onCode({userCode, verificationURL: issuer + '/codex/device', cancel: cancelLogin});
      check();
      while (now() < deadline) {
        check();
        let grant;
        try {
          grant = json(await request(issuer + '/api/accounts/deviceauth/token', {
            device_auth_id: code.device_auth_id, user_code: userCode
          }, {action: 'sign-in'}));
        } catch (error) {
          if (![403, 404, 429].includes(error.status)) throw error;
          if (error.status === 429) interval = Math.min(30000, interval + 5000);
        }
        check();
        if (grant) {
          if (typeof grant.authorization_code !== 'string' || !grant.authorization_code || typeof grant.code_verifier !== 'string' || !grant.code_verifier) {
            throw new Error('ChatGPT returned an invalid authorization. Start sign-in again.');
          }
          const tokens = json(await request(issuer + '/oauth/token', {
            grant_type: 'authorization_code', client_id: clientId,
            code: grant.authorization_code, code_verifier: grant.code_verifier,
            redirect_uri: issuer + '/deviceauth/callback'
          }, {form: true, action: 'token exchange'}));
          check();
          await saveCredential(credentialFrom(tokens), epoch);
          return await status();
        }
        const delay = Math.min(interval, Math.max(0, deadline - now()));
        if (deps.sleep) await deps.sleep(delay);
        else await new Promise(resolve => {
          const id = timers.setTimeout(() => { session.wake = null; resolve(); }, delay);
          session.wake = () => { timers.clearTimeout(id); session.wake = null; resolve(); };
        });
      }
      throw new Error('ChatGPT sign-in expired after 15 minutes. Start sign-in again.');
    } finally { if (pendingLogin === session) pendingLogin = null; }
  }
  async function refreshCredential() {
    if (refreshPromise) return refreshPromise;
    const epoch = generation;
    const job = (async () => {
      const previous = await readCredential();
      if (!previous?.refreshToken) throw new Error('Sign in to ChatGPT from the connector Tools menu.');
      const tokens = json(await request(issuer + '/oauth/token', {
        client_id: clientId, grant_type: 'refresh_token', refresh_token: previous.refreshToken
      }, {action: 'token refresh'}));
      const credential = credentialFrom(tokens, previous);
      await saveCredential(credential, epoch);
      return credential;
    })();
    refreshPromise = job;
    try { return await job; }
    finally { if (refreshPromise === job) refreshPromise = null; }
  }
  function stop() {
    generation++;
    cancelLogin();
    for (const controller of activeRequests) controller.abort();
  }
  async function logout() {
    stop();
    try { await serializeStorage(() => store.clear()); }
    catch (_) { throw new Error('Cannot remove the connector login from Zotero password storage.'); }
  }
  function extractOutputText(value) {
    if (!value || typeof value !== 'object') return '';
    if (value.type === 'output_text' && typeof value.text === 'string') return value.text;
    for (const items of [value.output, value.content]) {
      if (!Array.isArray(items)) continue;
      const text = items.map(extractOutputText).join('');
      if (text) return text;
    }
    return '';
  }
  function parseResponse(raw) {
    const body = String(raw || '').trim();
    if (!body.includes('data:')) {
      const response = json(body);
      if (response?.error || (response?.status && response.status !== 'completed')) {
        throw new Error('ChatGPT translation was incomplete.');
      }
      const text = extractOutputText(response);
      if (text) return text.trim();
    }
    let text = '', completed = '', finished = false;
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim().startsWith('data:')) continue;
      const data = line.trim().slice(5).trim();
      if (!data || data === '[DONE]') continue;
      const event = json(data);
      if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
        throw new Error('ChatGPT could not complete the translation. Please try again.');
      }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
      if (event.type === 'response.completed') {
        if (event.response?.status && event.response.status !== 'completed') throw new Error('ChatGPT translation was incomplete.');
        completed = extractOutputText(event.response); finished = true;
      }
    }
    const result = (completed || text).trim();
    if (!finished || !result) throw new Error('ChatGPT returned an incomplete translation. Please try again.');
    return result;
  }
  async function translate({abstract, model, systemPrompt}) {
    const source = String(abstract || '').trim();
    if (!source) return '';
    if (source.length > 100000) throw new Error('The abstract is too long to translate safely.');
    const epoch = generation;
    let credential = await readCredential();
    if (!credential) throw new Error('Sign in to ChatGPT from the connector Tools menu.');
    if (expired(credential)) credential = await refreshCredential();
    const payload = {
      model: String(model || '').trim() || 'gpt-5.6-luna', instructions: systemPrompt,
      input: [{type: 'message', role: 'user', content: [{type: 'input_text', text: source}]}],
      store: false, stream: true, tool_choice: 'none'
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (epoch !== generation) throw new Error('ChatGPT operation was cancelled.');
      const headers = {Authorization: 'Bearer ' + credential.accessToken, Accept: 'text/event-stream',
        'User-Agent': 'codex_cli_rs/0.0.0 (Zotero-Obsidian-Connector)', originator: 'codex_cli_rs'};
      if (credential.accountId) headers['ChatGPT-Account-ID'] = credential.accountId;
      let response;
      try { response = await request(endpoint, payload, {headers, action: 'translation', timeout: 180000}); }
      catch (error) {
        if (error.status !== 401 || attempt || epoch !== generation) throw error;
        credential = await refreshCredential(); continue;
      }
      if (epoch !== generation) throw new Error('ChatGPT operation was cancelled.');
      return parseResponse(response);
    }
  }
  return {translate, status, login, logout, cancelLogin, stop};
}
if (typeof module !== 'undefined') module.exports = {createCodexTranslator};
