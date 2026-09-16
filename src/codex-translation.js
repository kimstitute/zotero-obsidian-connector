/* Reuses the local Codex OAuth session without copying credentials into plugin settings. */
function createCodexTranslator(deps) {
  const {Z, io, path, Services} = deps;
  const endpoint = 'https://chatgpt.com/backend-api/codex/responses';
  const defaultModel = 'gpt-5.6-luna';
  let executable = deps.executable || null;
  const env = name => {
    try { return Services?.env?.get(name) || ''; }
    catch (_) { return ''; }
  };
  const exists = async file => {
    try { return !!file && await io.exists(file); }
    catch (_) { return false; }
  };
  function decodeClaims(token) {
    try {
      const encoded = String(token || '').split('.')[1];
      if (!encoded) return {};
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const decode = deps.atob || Z.getMainWindow?.()?.atob?.bind(Z.getMainWindow()) || globalThis.atob;
      if (!decode) return {};
      return JSON.parse(decode(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=')));
    } catch (_) { return {}; }
  }
  function credentialPaths() {
    const values = [], add = value => { if (value && !values.includes(value)) values.push(value); };
    const codexHome = env('CODEX_HOME'), home = env('HOME') || env('USERPROFILE');
    if (codexHome) add(path.join(codexHome, 'auth.json'));
    if (home) add(path.join(home, '.codex', 'auth.json'));
    return values;
  }
  async function readCredential() {
    for (const file of credentialPaths()) {
      if (!await exists(file)) continue;
      try {
        const saved = JSON.parse(await io.readUTF8(file));
        const tokens = saved?.tokens && typeof saved.tokens === 'object' ? saved.tokens : {};
        const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token.trim() : '';
        if (!accessToken) continue;
        const claims = decodeClaims(accessToken);
        const accountId = String(tokens.account_id || claims?.['https://api.openai.com/auth']?.chatgpt_account_id || '').trim();
        const expiresAt = Number(claims.exp || 0) * 1000;
        return {accessToken, accountId, expiresAt, expired: !!expiresAt && expiresAt <= Date.now() + 60000};
      } catch (_) {}
    }
    return null;
  }
  function ensureCodexEnvironment() {
    const home = env('HOME') || env('USERPROFILE');
    try {
      if (home && !env('HOME')) Services?.env?.set('HOME', home);
      if (home && !env('CODEX_HOME')) Services?.env?.set('CODEX_HOME', path.join(home, '.codex'));
    } catch (_) {}
  }
  function candidates() {
    const values = [], add = value => { if (value && !values.includes(value)) values.push(value); };
    const local = env('LOCALAPPDATA'), appdata = env('APPDATA'), home = env('HOME') || env('USERPROFILE');
    if (local) {
      add(path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'));
      add(path.join(local, 'Microsoft', 'WindowsApps', 'codex.exe'));
    }
    if (appdata) add(path.join(appdata, 'npm', 'codex.exe'));
    if (home) {
      add(path.join(home, '.local', 'bin', 'codex.exe'));
      add(path.join(home, '.local', 'bin', 'codex'));
    }
    for (const folder of String(env('PATH') || '').split(Z.isWin ? ';' : ':')) {
      if (folder) add(path.join(folder, Z.isWin ? 'codex.exe' : 'codex'));
    }
    for (const file of ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex']) add(file);
    return values;
  }
  async function resolveExecutable() {
    if (executable && await exists(executable)) return executable;
    for (const file of candidates()) if (await exists(file)) return (executable = file);
    throw new Error('Codex CLI was not found. Sign in from AIdea, or install the official Codex CLI.');
  }
  async function refreshCredential() {
    try {
      const command = await resolveExecutable();
      ensureCodexEnvironment();
      await Z.Utilities.Internal.exec(command, ['login', 'status']);
    } catch (_) {}
    return readCredential();
  }
  async function status() {
    let credential = await readCredential();
    if (credential?.expired) credential = await refreshCredential();
    if (credential && !credential.expired) return {
      installed: true, signedIn: true, mode: 'shared-codex-oauth', message: 'A local Codex OAuth session is available.'
    };
    try {
      const command = await resolveExecutable();
      return {installed: true, signedIn: false, executable: command,
        message: credential?.expired ? 'The Codex OAuth session has expired.' : 'Codex OAuth is not signed in.'};
    } catch (error) {
      return {installed: false, signedIn: false,
        message: credential?.expired ? 'The Codex OAuth session has expired. Sign in again from AIdea.' : String(error)};
    }
  }
  async function login() {
    const current = await readCredential();
    if (current && !current.expired) return status();
    const command = await resolveExecutable();
    ensureCodexEnvironment();
    await Z.Utilities.Internal.exec(command, ['login']);
    const result = await status();
    if (!result.signedIn) throw new Error('Codex sign-in did not complete. You can also sign in from AIdea settings and try again.');
    return result;
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
    if (!body) throw new Error('Codex OAuth returned no response.');
    if (!body.includes('data:')) {
      const parsed = JSON.parse(body);
      const text = extractOutputText(parsed);
      if (text) return text.trim();
    }
    let text = '', completed = '';
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const event = JSON.parse(data);
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
        if (event.type === 'response.completed') completed = extractOutputText(event.response) || completed;
        if (event.type === 'response.output_item.done') completed = extractOutputText(event.item) || completed;
        if (event.type === 'error') throw new Error('Codex OAuth error: ' + String(event.message || event.error?.message || 'unknown error'));
      } catch (error) {
        if (String(error).includes('Codex OAuth error:')) throw error;
      }
    }
    const result = (text || completed).trim();
    if (!result) throw new Error('Codex OAuth returned no translated text.');
    return result;
  }
  async function translate({abstract, model, systemPrompt}) {
    const source = String(abstract || '').trim();
    if (!source) return '';
    if (source.length > 100000) throw new Error('The abstract is too long to translate safely.');
    let credential = await readCredential();
    if (credential?.expired) credential = await refreshCredential();
    if (!credential || credential.expired) throw new Error('Codex OAuth is not signed in. Sign in from AIdea settings or the connector Tools menu.');
    const headers = {
      Authorization: 'Bearer ' + credential.accessToken,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': 'codex_cli_rs/0.0.0 (Zotero-Obsidian-Connector)',
      originator: 'codex_cli_rs'
    };
    if (credential.accountId) headers['ChatGPT-Account-ID'] = credential.accountId;
    const payload = {
      model: String(model || '').trim() || defaultModel,
      instructions: systemPrompt,
      input: [{type: 'message', role: 'user', content: [{type: 'input_text', text: source}]}],
      store: false,
      stream: true,
      tool_choice: 'none'
    };
    let response;
    try {
      if (deps.request) response = await deps.request(endpoint, {headers, payload});
      else {
        if (!Z.HTTP?.request) throw new Error('Zotero HTTP API is unavailable.');
        response = await Z.HTTP.request('POST', endpoint, {
          headers, body: JSON.stringify(payload), responseType: 'text', timeout: 180000
        });
      }
    } catch (error) {
      const status = Number(error?.status || error?.xmlhttp?.status || error?.response?.status || 0);
      throw new Error('Codex OAuth request failed' + (status ? ' (HTTP ' + status + ')' : '') + '. Sign in again from AIdea if the session expired.');
    }
    return parseResponse(response?.responseText ?? response?.response ?? response);
  }
  return {translate, status, login};
}
if (typeof module !== 'undefined') module.exports = {createCodexTranslator};
