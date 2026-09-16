/* Writes only generated vault files. Zotero remains read-only; translation is opt-in. */
function createBridge(deps) {
  if (!deps) {
    const window = Zotero.getMainWindow();
    const timers = window.ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
    deps = {Z: Zotero, io: window.IOUtils, path: window.PathUtils, timers, Services,
      createNoteTabs, mergeNote, createCodexTranslator};
  }
  const {Z, io, path, timers} = deps;
  const merge = deps.mergeNote || (typeof require !== 'undefined' ? require('./note-document.js').mergeNote : null);
  const noteTabs = deps.createNoteTabs ? deps.createNoteTabs({Z, timers}) : null;
  const codex = deps.codexTranslator || (deps.createCodexTranslator ? deps.createCodexTranslator({
    Z, io, path, Services: deps.Services, executable: deps.codexExecutable
  }) : null);
  let config = deps.config || null;
  let translationApiKey = deps.translationApiKey || '';
  let translationCache = {};
  let directory = null;
  const prefKey = 'extensions.zotero-obsidian-connector.config';
  const secretPrefKey = 'extensions.zotero-obsidian-connector.translationApiKey';
  const translationPromptVersion = 1;
  const translationSystemPrompt = [
    'Translate the academic abstract into natural Korean.',
    'Keep technical terms, method names, model names, dataset names, acronyms, equations, code identifiers, product names, organization names, and other proper nouns in English.',
    'Do not summarize, explain, add, or omit information.',
    'Return only the translated abstract without a heading, quotation marks, or commentary.'
  ].join(' ');
  function translationDefaults(value = {}) {
    const legacyApi = value.translateAbstracts === true && !value.translationProvider &&
      (value.translationEndpoint || value.translationModel);
    const provider = value.translationProvider || (legacyApi ? 'api' : 'codex');
    return {
      enabled: value.translateAbstracts === true,
      provider,
      endpoint: value.translationEndpoint || 'http://127.0.0.1:11434/v1/chat/completions',
      model: value.translationModel || 'qwen2.5:7b',
      codexModel: value.codexModel || ''
    };
  }
  function validateTranslationURL(value) {
    let parsed;
    try { parsed = new URL(value); }
    catch (_) { throw new Error('Enter a valid translation API URL.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
      throw new Error('Translation API URLs must use HTTPS, except for localhost.');
    }
    if (parsed.username || parsed.password) throw new Error('Do not put API credentials in the translation URL.');
    return parsed.toString();
  }
  async function validateConfig(value) {
    if (!value || typeof value.vaultPath !== 'string' || !path.isAbsolute(value.vaultPath)) {
      throw new Error('Choose an absolute path to an existing Obsidian vault.');
    }
    const vaultPath = path.normalize(value.vaultPath);
    if (!await io.exists(path.join(vaultPath, '.obsidian'))) {
      throw new Error('The selected folder is not an Obsidian vault (.obsidian is missing).');
    }
    const segments = String(value.noteFolder || '').split(/[\\/]/);
    if (!segments.length || segments.some(s => !s || s === '.' || s === '..' || /[<>:"|?*\x00-\x1f]/.test(s) || /[. ]$/.test(s) || /^\./.test(s) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s))) {
      throw new Error('Use a relative notes folder such as Papers or Research/Papers; hidden folders and parent paths are not allowed.');
    }
    const translation = translationDefaults(value);
    if (translation.enabled) {
      if (!['codex', 'api'].includes(translation.provider)) throw new Error('Choose Codex OAuth or an OpenAI-compatible API for translation.');
      if (translation.provider === 'api') {
        translation.endpoint = validateTranslationURL(String(translation.endpoint || '').trim());
        translation.model = String(translation.model || '').trim();
        if (!translation.model || translation.model.length > 200) throw new Error('Enter a translation model name.');
      } else {
        translation.codexModel = String(translation.codexModel || '').trim();
        if (translation.codexModel.length > 200) throw new Error('The Codex model name is too long.');
      }
    }
    return {config: {
      vaultPath,
      noteFolder: segments.join('/'),
      translateAbstracts: translation.enabled,
      translationProvider: translation.provider,
      translationEndpoint: translation.endpoint,
      translationModel: translation.model,
      codexModel: translation.codexModel
    }, directory: path.join(vaultPath, ...segments)};
  }
  async function configure(value) {
    const validated = await validateConfig(value);
    await enqueue(async () => {
      Z.Prefs.set(prefKey, JSON.stringify(validated.config), true);
      if (Object.prototype.hasOwnProperty.call(value, 'translationApiKey')) {
        translationApiKey = String(value.translationApiKey || '').trim();
        Z.Prefs.set(secretPrefKey, translationApiKey, true);
      }
      config = validated.config;
      directory = validated.directory;
      translationCache = {};
    });
    return syncAll();
  }
  async function configureWindow(window) {
    const vaultPath = window.prompt('Obsidian vault: enter the full folder path (the folder containing .obsidian).', config?.vaultPath || '');
    if (vaultPath === null) return;
    const noteFolder = window.prompt('Notes folder inside the vault:', config?.noteFolder || 'Papers');
    if (noteFolder === null) return;
    const enabled = window.confirm('Translate Zotero abstracts into Korean when creating Obsidian notes?\n\nTechnical terms, model and dataset names, acronyms, and proper nouns will stay in English.');
    let translationProvider, translationEndpoint, translationModel, codexModel, key;
    if (enabled) {
      const defaults = translationDefaults(config || {});
      const choice = window.prompt('Translation provider:\n\n1 = ChatGPT sign-in through Codex CLI (no API key)\n2 = OpenAI-compatible endpoint\n\nEnter 1 or 2:', defaults.provider === 'api' ? '2' : '1');
      if (choice === null) return;
      translationProvider = choice.trim() === '2' ? 'api' : choice.trim() === '1' ? 'codex' : '';
      if (!translationProvider) throw new Error('Enter 1 for Codex OAuth or 2 for an API endpoint.');
      if (translationProvider === 'codex') {
        if (!codex) throw new Error('Codex translation support is unavailable. Reinstall the connector.');
        const state = await codex.status();
        if (!state.installed) throw new Error('Codex CLI was not found. Install Codex CLI, restart Zotero, and configure again.');
        if (!state.signedIn) {
          if (!window.confirm('Codex CLI is installed but is not signed in to ChatGPT. Start sign-in now?')) return;
          await codex.login();
        }
        codexModel = window.prompt('Optional Codex model override. Leave blank to use the Codex CLI default:', defaults.codexModel);
        if (codexModel === null) return;
      } else {
        translationEndpoint = window.prompt('OpenAI-compatible chat completions URL:', defaults.endpoint);
        if (translationEndpoint === null) return;
        translationModel = window.prompt('Translation model:', defaults.model);
        if (translationModel === null) return;
        key = window.prompt('Optional Bearer API key. Leave blank for local Ollama. It is stored only in local Zotero preferences:', '');
        if (key === null) return;
      }
    }
    await configure({
      vaultPath: vaultPath.trim(), noteFolder: noteFolder.trim(),
      translateAbstracts: enabled,
      translationProvider, translationEndpoint, translationModel, codexModel,
      ...(enabled && translationProvider === 'api' ? {translationApiKey: key} : {})
    });
    window.alert('Connector configured. Open your notes folder/dashboard.md in Obsidian.');
  }
  const windows = new Map();
  let stopped = false, observer, timer, chain = Promise.resolve();
  let lastResult = null;
  const libraries = () => Z.Libraries.getAll().filter(l => ['user', 'group'].includes(l.libraryType));
  function identity(item) {
    const lib = Z.Libraries.get(item.libraryID);
    if (!lib || !['user', 'group'].includes(lib.libraryType)) return null;
    const prefix = lib.libraryType === 'group' ? 'group-' + lib.groupID : 'library';
    return prefix + '-' + item.key;
  }
  function link(item) {
    const lib = Z.Libraries.get(item.libraryID);
    return 'zotero://select/' + (lib.libraryType === 'group' ? 'groups/' + lib.groupID : 'library') + '/items/' + item.key;
  }
  function markers(id) { return ['<!-- zotero-bridge:' + id + ':begin -->', '<!-- zotero-bridge:' + id + ':end -->']; }
  function clean(value) {
    return String(value || '').replace(/<!--/g, '&lt;!--').replace(/-->/g, '--&gt;');
  }
  function inline(value) { return clean(value).replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1'); }
  function fingerprint(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return String(value || '').length + '-' + (hash >>> 0).toString(16);
  }
  function translationCachePath() { return path.join(directory, '.zotero-bridge-translations.json'); }
  async function loadTranslationCache() {
    translationCache = {};
    if (!directory || !await io.exists(translationCachePath())) return;
    try {
      const saved = JSON.parse(await io.readUTF8(translationCachePath()));
      if (saved && saved.version === 1 && saved.items && typeof saved.items === 'object') translationCache = saved.items;
    } catch (e) { Z.logError(e); }
  }
  async function saveTranslationCache() {
    if (!directory || !translationDefaults(config || {}).enabled) return;
    const file = translationCachePath(), body = JSON.stringify({version: 1, items: translationCache}, null, 2) + '\n';
    const exists = await io.exists(file);
    await io.writeUTF8(file, body, exists ? {tmpPath: file + '.tmp'} : {mode: 'create'});
  }
  function parseTranslationResponse(response) {
    let body = response?.response ?? response?.responseText ?? response;
    if (typeof body === 'string') body = JSON.parse(body);
    let content = body?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) content = content.map(part => part?.text || '').join('');
    if (typeof content !== 'string' || !content.trim()) throw new Error('Translation API returned no text.');
    return content.trim();
  }
  async function requestTranslation(abstract) {
    const translation = translationDefaults(config || {});
    if (deps.translate) return String(await deps.translate({
      abstract, provider: translation.provider, endpoint: translation.endpoint,
      model: translation.provider === 'codex' ? translation.codexModel : translation.model,
      apiKey: translationApiKey, systemPrompt: translationSystemPrompt
    })).trim();
    if (translation.provider === 'codex') {
      if (!codex) throw new Error('Codex translation support is unavailable. Reinstall the connector.');
      return String(await codex.translate({
        abstract, model: translation.codexModel, systemPrompt: translationSystemPrompt
      })).trim();
    }
    if (!Z.HTTP?.request) throw new Error('Zotero HTTP API is unavailable.');
    const headers = {'Content-Type': 'application/json'};
    if (translationApiKey) headers.Authorization = 'Bearer ' + translationApiKey;
    const response = await Z.HTTP.request('POST', translation.endpoint, {
      headers,
      body: JSON.stringify({
        model: translation.model,
        temperature: 0,
        messages: [
          {role: 'system', content: translationSystemPrompt},
          {role: 'user', content: abstract}
        ]
      }),
      responseType: 'json',
      timeout: 120000
    });
    return parseTranslationResponse(response);
  }
  async function translatedAbstract(item) {
    const source = String(item.toJSON().abstractNote || '').trim();
    const translation = translationDefaults(config || {});
    if (!translation.enabled || !source) return {text: source, translated: false};
    const id = identity(item), sourceHash = fingerprint(source);
    const cached = translationCache[id];
    const provider = translation.provider;
    const endpoint = provider === 'api' ? translation.endpoint : '';
    const model = provider === 'api' ? translation.model : translation.codexModel;
    if (cached && cached.sourceHash === sourceHash && (cached.provider || 'api') === provider &&
        (cached.endpoint || '') === endpoint && (cached.model || '') === model &&
        cached.promptVersion === translationPromptVersion && cached.translation) {
      return {text: cached.translation, translated: true, cached: true};
    }
    try {
      const translated = await requestTranslation(source);
      if (!translated) throw new Error('The translation provider returned an empty translation.');
      translationCache[id] = {sourceHash, provider, endpoint, model,
        promptVersion: translationPromptVersion, translation: translated};
      return {text: translated, translated: true, cached: false};
    } catch (error) {
      Z.logError(error);
      return {text: source, translated: false, error: String(error)};
    }
  }
  async function translateItems(items, concurrency = null) {
    if (concurrency === null) concurrency = translationDefaults(config || {}).provider === 'codex' ? 1 : 3;
    const results = new Map();
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor++];
        results.set(identity(item), await translatedAbstract(item));
      }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => worker()));
    return results;
  }
  function render(item, abstract = null) {
    const id = identity(item), [begin, end] = markers(id);
    const d = item.toJSON();
    const authors = (d.creators || []).map(c => c.name || [c.firstName, c.lastName].filter(Boolean).join(' '));
    const abstractText = abstract?.text ?? String(d.abstractNote || '');
    const abstractHeading = abstract?.translated ? '## Abstract (한국어)' : '## Abstract';
    return [begin, '# ' + inline(d.title || item.key), '',
      '- Authors: ' + authors.map(inline).join('; '), '- Date: ' + inline(d.date),
      '- Publication: ' + inline(d.publicationTitle || d.proceedingsTitle || d.publisher),
      '- DOI: ' + inline(d.DOI), '- Tags: ' + (d.tags || []).map(t => inline(t.tag)).join(', '),
      '- [Open in Zotero](' + link(item) + ')', '', abstractHeading, '', clean(abstractText), '', end].join('\n');
  }
  async function indexFiles(folder = directory) {
    const index = new Map();
    for (const file of await io.getChildren(folder)) {
      if (!file.toLowerCase().endsWith('.md')) continue;
      const text = await io.readUTF8(file);
      const match = text.match(/<!-- zotero-bridge:((?:library|group-\d+)-[A-Z0-9]+):begin -->/);
      if (!match) continue;
      if (index.has(match[1])) throw new Error('Duplicate bridge identity: ' + match[1]);
      index.set(match[1], file);
    }
    return index;
  }
  async function syncItem(item, index, abstract = null) {
    if (!item || item.deleted || !item.isRegularItem() || !identity(item)) return null;
    const id = identity(item), file = index.get(id) || path.join(directory, id + '.md');
    const result = await writeManaged(file, id, render(item, abstract), '\n\n## My notes\n\n\n## Related notes\n\n');
    index.set(id, file);
    return {...result, translationError: abstract?.error || null};
  }
  async function writeManaged(file, id, block, tail = '\n') {
    const exists = await io.exists(file);
    const previous = exists ? await io.readUTF8(file) : null;
    let next;
    if (previous === null) {
      next = block + tail;
    } else {
      const [begin, end] = markers(id);
      const a = previous.indexOf(begin), b = previous.indexOf(end);
      if (a < 0 || b < a || previous.indexOf(begin, a + 1) >= 0 || previous.indexOf(end, b + 1) >= 0) {
        throw new Error('Refusing to overwrite an unmanaged or damaged note: ' + file);
      }
      next = previous.slice(0, a) + block + previous.slice(b + end.length);
    }
    if (next !== previous) {
      if (exists && await io.readUTF8(file) !== previous) throw new Error('Note changed during sync: ' + file);
      const options = exists ? {tmpPath: file + '.bridge-tmp', backupFile: file + '.bridge-bak'} : {mode: 'create'};
      await io.writeUTF8(file, next, options);
    }
    return {file, status: previous === null ? 'created' : next === previous ? 'unchanged' : 'updated'};
  }
  async function syncDashboard(entries, errorCount) {
    const [begin, end] = markers('dashboard');
    const groups = new Map();
    for (const {item, file} of entries) {
      const data = item.toJSON();
      const year = String(data.date || '').match(/\b(?:18|19|20|21)\d{2}\b/)?.[0] || 'Unknown year';
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push({data, file, id: identity(item)});
    }
    const lines = [begin, '# Literature dashboard', '', '**' + entries.length + ' papers** · Select a title to open its literature note.', '',
      'Updated automatically from Zotero. Write your own notes in each paper’s **My notes** section.', ''];
    if (errorCount) lines.push('> Sync errors: ' + errorCount + '. Items that could not be synchronized are excluded.', '');
    for (const year of [...groups.keys()].sort((a, b) => (Number(b) || 0) - (Number(a) || 0))) {
      const rows = groups.get(year).sort((a, b) => String(a.data.title || a.id).localeCompare(String(b.data.title || b.id), 'ko', {sensitivity: 'base'}) || a.id.localeCompare(b.id));
      lines.push('## ' + year + ' · ' + rows.length + ' papers', '');
      for (const {data, file, id} of rows) {
        const creators = data.creators || [];
        const first = creators[0];
        const author = first ? first.name || [first.firstName, first.lastName].filter(Boolean).join(' ') : '';
        const target = encodeURIComponent(path.filename(file)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
        lines.push('- [' + inline(data.title || id) + '](<' + target + '>)' + (author ? ' — ' + inline(author) + (creators.length > 1 ? ' et al.' : '') : ''));
      }
      lines.push('');
    }
    lines.push(end);
    return writeManaged(path.join(directory, 'dashboard.md'), 'dashboard', lines.join('\n'));
  }
  function enqueue(fn) {
    const task = chain.then(() => stopped ? null : fn());
    chain = task.catch(e => Z.logError(e));
    return task;
  }
  async function syncAll() {
    return enqueue(async () => {
      if (!directory) throw new Error('Configure the connector from Zotero’s Tools menu first.');
      await io.makeDirectory(directory, {ignoreExisting: true, createAncestors: true});
      await loadTranslationCache();
      const index = await indexFiles();
      const result = {created: 0, updated: 0, unchanged: 0, errors: [], translationErrors: [], completedAt: null};
      const entries = [];
      const items = [];
      for (const lib of libraries()) {
        if (lib.waitForDataLoad) await lib.waitForDataLoad('item');
        const libraryItems = await Z.Items.getAll(lib.libraryID, true, false);
        for (const item of libraryItems) {
          if (item && !item.deleted && item.isRegularItem() && identity(item)) items.push(item);
        }
      }
      const translations = await translateItems(items);
      for (const item of items) {
          if (stopped) return result;
          try { const r = await syncItem(item, index, translations.get(identity(item))); if (r) {
            result[r.status]++; entries.push({item, file: r.file});
            if (r.translationError) result.translationErrors.push({key: item.key, message: r.translationError});
          } }
          catch (e) { result.errors.push({key: item.key, message: String(e)}); Z.logError(e); }
      }
      await saveTranslationCache();
      try { result.dashboard = await syncDashboard(entries, result.errors.length); }
      catch (e) { result.errors.push({key: 'dashboard', message: String(e)}); Z.logError(e); }
      result.completedAt = new Date().toISOString();
      lastResult = result;
      await io.writeUTF8(path.join(directory, '.zotero-bridge-status.json'), JSON.stringify(result, null, 2));
      return result;
    });
  }
  async function openItem(item) {
    if (item && item.parentID) item = await Z.Items.getAsync(item.parentID);
    return enqueue(async () => {
      if (!directory) throw new Error('Configure the connector from Zotero’s Tools menu first.');
      await io.makeDirectory(directory, {ignoreExisting: true, createAncestors: true});
      await loadTranslationCache();
      const abstract = await translatedAbstract(item);
      const result = await syncItem(item, await indexFiles(), abstract);
      await saveTranslationCache();
      if (!result) throw new Error('Select a regular bibliographic item.');
      const uri = 'obsidian://open?path=' + encodeURIComponent(result.file) + '&paneType=tab';
      Z.launchURL(uri);
      return uri;
    });
  }
  async function createNoteSession(item) {
    if (item && item.parentID) item = await Z.Items.getAsync(item.parentID);
    return enqueue(async () => {
      if (!directory) throw new Error('Configure the connector from Zotero’s Tools menu first.');
      await io.makeDirectory(directory, {ignoreExisting: true, createAncestors: true});
      await loadTranslationCache();
      const abstract = await translatedAbstract(item);
      const result = await syncItem(item, await indexFiles(), abstract);
      await saveTranslationCache();
      if (!result) throw new Error('Select a regular bibliographic item.');
      const id = identity(item), folder = directory;
      let file = result.file;
      const locate = async () => {
        // Resolve by identity again if Obsidian renamed the file. Never recreate a missing note here.
        const found = (await indexFiles(folder)).get(id);
        if (!found) throw new Error('The note was moved or deleted. Your draft is retained; restore the file inside its original notes folder.');
        file = found;
        return {file, text: await io.readUTF8(file)};
      };
      return {
        key: folder + '/' + id, identity: id, title: item.toJSON().title || item.key,
        read: () => enqueue(locate),
        save: (base, edited) => enqueue(async () => {
          const current = await locate();
          const text = merge(base, edited, current.text, id);
          if (text !== current.text) {
            if (await io.readUTF8(file) !== current.text) throw new Error('The note changed while saving. Your draft is retained; try again.');
            await io.writeUTF8(file, text, {tmpPath: file + '.bridge-tmp', backupFile: file + '.bridge-bak'});
          }
          return {file, text};
        }),
        openExternal: () => enqueue(async () => {
          const current = await locate();
          Z.launchURL('obsidian://open?path=' + encodeURIComponent(current.file) + '&paneType=tab');
        })
      };
    });
  }
  async function openItemInTab(item, window = Z.getMainWindow()) {
    if (!noteTabs) throw new Error('The Zotero note editor is unavailable. Reinstall the connector.');
    const session = await createNoteSession(item);
    if (session && !stopped) return noteTabs.open(window, session);
  }
  function report(window, error) { Z.logError(error); window.alert('Obsidian Bridge: ' + error); }
  function addWindow(window) {
    if (windows.has(window)) return;
    const document = window.document, nodes = [];
    function menu(parentID, id, label, handler) {
      const parent = document.getElementById(parentID);
      if (!parent) return;
      const node = document.createXULElement('menuitem');
      node.id = id; node.setAttribute('label', label);
      node.addEventListener('command', () => handler().catch(e => report(window, e)));
      parent.appendChild(node); nodes.push(node);
    }
    menu('menu_ToolsPopup', 'zoc-configure', 'Zotero–Obsidian Connector: Configure…', () => configureWindow(window));
    menu('menu_ToolsPopup', 'zoc-codex-login', 'Zotero–Obsidian Connector: Sign in to ChatGPT…', async () => {
      if (!codex) throw new Error('Codex translation support is unavailable. Reinstall the connector.');
      const state = await codex.status();
      if (!state.installed) throw new Error('Codex CLI was not found. Install Codex CLI, restart Zotero, and try again.');
      if (state.signedIn) {
        window.alert('Codex CLI is signed in to ChatGPT.');
        return;
      }
      await codex.login();
      window.alert('Codex CLI is now signed in to ChatGPT.');
    });
    menu('menu_ToolsPopup', 'zoc-dashboard', 'Open literature dashboard in Obsidian', async () => {
      await syncAll();
      Z.launchURL('obsidian://open?path=' + encodeURIComponent(path.join(directory, 'dashboard.md')) + '&paneType=tab');
    });
    menu('zotero-itemmenu', 'zoc-obsidian-open', 'Open in Obsidian', async () => {
      const selected = window.ZoteroPane.getSelectedItems();
      if (selected.length !== 1) throw new Error('Select exactly one paper.');
      await openItem(selected[0]);
    });
    menu('zotero-itemmenu', 'zoc-note-tab', 'Open Obsidian note in Zotero tab', async () => {
      const selected = window.ZoteroPane.getSelectedItems();
      if (selected.length !== 1) throw new Error('Select exactly one paper.');
      await openItemInTab(selected[0], window);
    });
    menu('menu_ToolsPopup', 'zoc-obsidian-sync', 'Sync literature notes to Obsidian', async () => {
      const r = await syncAll();
      if (r) window.alert('Obsidian: created ' + r.created + ', updated ' + r.updated + ', unchanged ' + r.unchanged + ', errors ' + r.errors.length + ', translation fallbacks ' + r.translationErrors.length);
    });
    windows.set(window, nodes);
  }
  function removeWindow(window) {
    noteTabs?.removeWindow(window);
    for (const node of windows.get(window) || []) node.remove();
    windows.delete(window);
  }
  function schedule() {
    if (stopped || timer || !directory) return;
    timer = timers.setTimeout(() => { timer = null; syncAll().catch(e => Z.logError(e)); }, 1500);
  }
  async function start() {
    if (!config) {
      try { const saved = Z.Prefs.get(prefKey, true); if (saved) config = JSON.parse(saved); }
      catch (e) { Z.logError(e); }
    }
    try { translationApiKey = deps.translationApiKey || Z.Prefs.get(secretPrefKey, true) || ''; }
    catch (e) { Z.logError(e); }
    if (config) {
      try { const valid = await validateConfig(config); config = valid.config; directory = valid.directory; }
      catch (e) { config = null; directory = null; Z.logError(e); }
    }
    for (const window of Z.getMainWindows()) addWindow(window);
    Z.Reader?.registerEventListener('createViewContextMenu', readerMenu, 'zotero-obsidian-connector@local');
    observer = Z.Notifier.registerObserver({notify(event) {
      if (['add', 'modify', 'refresh', 'trash', 'delete'].includes(event)) schedule();
    }}, ['item'], 'zoc-obsidian-bridge');
    if (directory) await syncAll();
  }
  async function stop() {
    stopped = true;
    if (observer !== undefined) Z.Notifier.unregisterObserver(observer);
    if (timer) timers.clearTimeout(timer);
    Z.Reader?.unregisterEventListener('createViewContextMenu', readerMenu);
    noteTabs?.stop();
    for (const window of Array.from(windows.keys())) removeWindow(window);
    await chain;
  }
  const readerMenu = ({reader, append}) => append({label: 'Open Obsidian note in Zotero tab',
    onCommand: () => Z.Items.getAsync(reader.itemID).then(item => openItemInTab(item)).catch(e => report(Z.getMainWindow(), e))});
  return {start, stop, syncAll, configure, openItem, openItemInTab, createNoteSession, addWindow, removeWindow, render, identity, get configured() { return !!directory; }, get lastResult() { return lastResult; }};
}
if (typeof module !== 'undefined') module.exports = {createBridge};
