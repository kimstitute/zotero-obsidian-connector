/* Local-only bridge. No library writes, network calls or note deletions. */
function createBridge(deps) {
  if (!deps) {
    const window = Zotero.getMainWindow();
    const timers = window.ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
    deps = {Z: Zotero, io: window.IOUtils, path: window.PathUtils, timers};
  }
  const {Z, io, path, timers} = deps;
  let config = deps.config || null;
  let directory = null;
  const prefKey = 'extensions.zotero-obsidian-connector.config';
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
    return {config: {vaultPath, noteFolder: segments.join('/')}, directory: path.join(vaultPath, ...segments)};
  }
  async function configure(value) {
    const validated = await validateConfig(value);
    await enqueue(async () => {
      Z.Prefs.set(prefKey, JSON.stringify(validated.config), true);
      config = validated.config;
      directory = validated.directory;
    });
    return syncAll();
  }
  async function configureWindow(window) {
    const vaultPath = window.prompt('Obsidian vault: enter the full folder path (the folder containing .obsidian).', config?.vaultPath || '');
    if (vaultPath === null) return;
    const noteFolder = window.prompt('Notes folder inside the vault:', config?.noteFolder || 'Papers');
    if (noteFolder === null) return;
    await configure({vaultPath: vaultPath.trim(), noteFolder: noteFolder.trim()});
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
  function render(item) {
    const id = identity(item), [begin, end] = markers(id);
    const d = item.toJSON();
    const authors = (d.creators || []).map(c => c.name || [c.firstName, c.lastName].filter(Boolean).join(' '));
    return [begin, '# ' + inline(d.title || item.key), '',
      '- Authors: ' + authors.map(inline).join('; '), '- Date: ' + inline(d.date),
      '- Publication: ' + inline(d.publicationTitle || d.proceedingsTitle || d.publisher),
      '- DOI: ' + inline(d.DOI), '- Tags: ' + (d.tags || []).map(t => inline(t.tag)).join(', '),
      '- [Open in Zotero](' + link(item) + ')', '', '## Abstract', '', clean(d.abstractNote), '', end].join('\n');
  }
  async function indexFiles() {
    const index = new Map();
    for (const file of await io.getChildren(directory)) {
      if (!file.toLowerCase().endsWith('.md')) continue;
      const text = await io.readUTF8(file);
      const match = text.match(/<!-- zotero-bridge:((?:library|group-\d+)-[A-Z0-9]+):begin -->/);
      if (!match) continue;
      if (index.has(match[1])) throw new Error('Duplicate bridge identity: ' + match[1]);
      index.set(match[1], file);
    }
    return index;
  }
  async function syncItem(item, index) {
    if (!item || item.deleted || !item.isRegularItem() || !identity(item)) return null;
    const id = identity(item), file = index.get(id) || path.join(directory, id + '.md');
    const result = await writeManaged(file, id, render(item), '\n\n## My notes\n\n\n## Related notes\n\n');
    index.set(id, file);
    return result;
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
      const index = await indexFiles();
      const result = {created: 0, updated: 0, unchanged: 0, errors: [], completedAt: null};
      const entries = [];
      for (const lib of libraries()) {
        if (lib.waitForDataLoad) await lib.waitForDataLoad('item');
        const items = await Z.Items.getAll(lib.libraryID, true, false);
        for (const item of items) {
          if (stopped) return result;
          try { const r = await syncItem(item, index); if (r) { result[r.status]++; entries.push({item, file: r.file}); } }
          catch (e) { result.errors.push({key: item.key, message: String(e)}); Z.logError(e); }
        }
      }
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
      const result = await syncItem(item, await indexFiles());
      if (!result) throw new Error('Select a regular bibliographic item.');
      const uri = 'obsidian://open?path=' + encodeURIComponent(result.file);
      Z.launchURL(uri);
      return uri;
    });
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
    menu('menu_ToolsPopup', 'zoc-dashboard', 'Open literature dashboard in Obsidian', async () => {
      await syncAll();
      Z.launchURL('obsidian://open?path=' + encodeURIComponent(path.join(directory, 'dashboard.md')));
    });
    menu('zotero-itemmenu', 'zoc-obsidian-open', 'Open in Obsidian', async () => {
      const selected = window.ZoteroPane.getSelectedItems();
      if (selected.length !== 1) throw new Error('Select exactly one paper.');
      await openItem(selected[0]);
    });
    menu('menu_ToolsPopup', 'zoc-obsidian-sync', 'Sync literature notes to Obsidian', async () => {
      const r = await syncAll();
      if (r) window.alert('Obsidian: created ' + r.created + ', updated ' + r.updated + ', unchanged ' + r.unchanged + ', errors ' + r.errors.length);
    });
    windows.set(window, nodes);
  }
  function removeWindow(window) {
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
    if (config) {
      try { const valid = await validateConfig(config); config = valid.config; directory = valid.directory; }
      catch (e) { config = null; directory = null; Z.logError(e); }
    }
    for (const window of Z.getMainWindows()) addWindow(window);
    observer = Z.Notifier.registerObserver({notify(event) {
      if (['add', 'modify', 'refresh', 'trash', 'delete'].includes(event)) schedule();
    }}, ['item'], 'zoc-obsidian-bridge');
    if (directory) await syncAll();
  }
  async function stop() {
    stopped = true;
    if (observer !== undefined) Z.Notifier.unregisterObserver(observer);
    if (timer) timers.clearTimeout(timer);
    for (const window of Array.from(windows.keys())) removeWindow(window);
    await chain;
  }
  return {start, stop, syncAll, configure, openItem, addWindow, removeWindow, render, identity, get configured() { return !!directory; }, get lastResult() { return lastResult; }};
}
if (typeof module !== 'undefined') module.exports = {createBridge};
