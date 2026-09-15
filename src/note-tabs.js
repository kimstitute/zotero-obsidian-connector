/* A local Markdown editor. Note text is only inserted through DOM text nodes. */
function renderNotePreview(document, target, text, launch) {
  target.replaceChildren();
  const el = (tag, value) => {
    const node = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const inline = (parent, value) => {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[([^\]\n]+)\]\(([^)\s]+)\))/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      parent.append(document.createTextNode(value.slice(offset, match.index)));
      const token = match[0];
      if (token.startsWith('`')) parent.append(el('code', token.slice(1, -1)));
      else if (token.startsWith('**')) parent.append(el('strong', token.slice(2, -2)));
      else {
        let safe = false;
        try {
          const url = new URL(match[3]);
          safe = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
          safe ||= /^zotero:\/\/select\/(library|groups\/\d+)\/items\/[A-Z0-9]+$/.test(match[3]);
        } catch {}
        if (safe) {
          const a = el('a', match[2]); a.setAttribute('href', match[3]);
          a.addEventListener('click', event => {event.preventDefault(); launch(match[3]);});
          parent.append(a);
        } else parent.append(document.createTextNode(token));
      }
      offset = match.index + token.length;
    }
    parent.append(document.createTextNode(value.slice(offset)));
  };
  let code = null, list = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('```')) {
      if (code) code = null;
      else {const pre = el('pre'); code = el('code', ''); pre.append(code); target.append(pre);}
      list = null; continue;
    }
    if (code) {code.textContent += line + '\n'; continue;}
    if (/^<!-- zotero-bridge:[^>]+ -->$/.test(line)) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    let node;
    if (bullet) {
      if (!list) {list = el('ul'); target.append(list);}
      node = el('li'); inline(node, bullet[1]); list.append(node); continue;
    }
    list = null;
    if (!line.trim()) continue;
    node = el(heading ? 'h' + heading[1].length : 'p');
    inline(node, heading ? heading[2] : line); target.append(node);
  }
}

function createNoteTabs({Z, timers}) {
  const split = typeof splitNote === 'function' ? splitNote : require('./note-document.js').splitNote;
  const merge = typeof mergeNote === 'function' ? mergeNote : require('./note-document.js').mergeNote;
  const entries = new Map(), owners = new Map(), opening = new Map();
  let stopped = false;
  const type = 'obsidiannote';
  function register(window) {
    if (owners.has(window)) return;
    const tabs = window.Zotero_Tabs;
    if (!tabs?.add) throw new Error('This window cannot open Zotero tabs.');
    const original = tabs.getState;
    const filtered = function (...args) {return original.apply(this, args).filter(t => t.type !== type);};
    tabs.getState = filtered;
    owners.set(window, {original, filtered});
  }
  async function open(window, session) {
    if (stopped) return null;
    if (opening.has(session.key)) return opening.get(session.key);
    const existing = entries.get(session.key);
    if (existing && !existing.window.closed) {
      existing.window.Zotero_Tabs.select(existing.id); existing.window.focus(); return existing;
    }
    const task = build(window, session);
    opening.set(session.key, task);
    try {return await task;} finally {opening.delete(session.key);}
  }
  async function build(window, session) {
    register(window);
    let current = await session.read();
    if (!current || stopped || window.closed || !owners.has(window)) return null;
    let base = current.text, edited = current.text, active = true, working = false, pollTimer, previewTimer;
    const draftKey = 'extensions.zotero-obsidian-connector.draft.' + encodeURIComponent(session.key);
    const raw = Z.Prefs.get(draftKey, true);
    if (raw) {
      const draft = JSON.parse(raw);
      if (typeof draft.base !== 'string' || typeof draft.text !== 'string') throw new Error('Cannot read the saved draft. It has been preserved in Zotero preferences.');
      split(draft.base, session.identity); split(draft.text, session.identity);
      base = draft.base; edited = draft.text;
    }
    let parts = split(edited, session.identity);
    const document = window.document;
    const el = (tag, text, cls) => {
      const node = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      if (text !== undefined) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const {id, container} = window.Zotero_Tabs.add({type, title: 'Obsidian · ' + session.title, data: {icon: 'note'}, select: true,
      onClose: () => cleanup()});
    container.style.cssText = 'display:flex;flex-direction:column;min-width:0;min-height:0;';
    const root = el('section', undefined, 'zoc-editor');
    const style = el('style', `.zoc-editor{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;color:light-dark(#252333,#eee);background:light-dark(#faf9fc,#222126);font:14px system-ui}
      .zoc-editor *{box-sizing:border-box}.zoc-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid light-dark(#ddd,#555)}
      .zoc-editor button{font:inherit;padding:6px 12px;border:1px solid light-dark(#cbc7d6,#666);border-radius:6px;cursor:pointer}.zoc-editor button:focus-visible,.zoc-editor textarea:focus-visible{outline:2px solid #9867de;outline-offset:2px}
      .zoc-editor .zoc-save{background:#7044ad;color:white;border-color:#7044ad}.zoc-status{flex:1;min-width:180px}.zoc-path{padding:8px 16px;font-size:12px;overflow-wrap:anywhere;color:light-dark(#635b72,#bdb4c9)}
      .zoc-panes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);flex:1;min-height:0;gap:1px;background:light-dark(#ddd,#555)}.zoc-source,.zoc-reading{display:flex;flex-direction:column;min-height:0;padding:16px;background:light-dark(#fff,#29272e)}
      .zoc-editor textarea{width:100%;resize:none;font:14px/1.65 ui-monospace,monospace;background:light-dark(#fff,#29272e);color:inherit;border:1px solid light-dark(#ddd,#666);border-radius:6px;padding:12px;tab-size:2}.zoc-body{flex:1;min-height:120px}.zoc-before{height:110px}.zoc-editor label,.zoc-editor summary{font-weight:600;margin-bottom:8px}.zoc-editor details{margin-bottom:10px}.zoc-editor details textarea{margin-top:8px}
      .zoc-preview{overflow:auto;flex:1;line-height:1.65;overflow-wrap:anywhere}.zoc-preview h1{font-size:23px}.zoc-preview h2{font-size:18px}.zoc-preview p{white-space:pre-wrap}.zoc-preview pre{overflow:auto;padding:12px;background:light-dark(#f1edf7,#211f25)}.zoc-preview a{color:light-dark(#7044ad,#c7a3ff)}
      .zoc-hint{font-size:12px;color:light-dark(#635b72,#c2bacb);margin:8px 0}.zoc-conflict{padding:10px 16px;background:light-dark(#fff2d8,#4b3b21)}.zoc-conflict textarea{height:160px}.zoc-editor [hidden]{display:none!important}`);
    const toolbar = el('div', undefined, 'zoc-toolbar');
    const status = el('span', raw ? '저장 전 초안을 복구했습니다.' : '파일을 불러왔습니다.', 'zoc-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const location = el('div', current.file, 'zoc-path');
    const panes = el('div', undefined, 'zoc-panes');
    const source = el('div', undefined, 'zoc-source'), reading = el('div', undefined, 'zoc-reading');
    const details = el('details'); details.append(el('summary', '문서 앞부분 · 속성 편집'));
    const before = el('textarea', undefined, 'zoc-before'); before.setAttribute('aria-label', '서지정보 앞의 Markdown 및 속성'); details.append(before);
    const label = el('label', '내 노트 · Markdown');
    const body = el('textarea', undefined, 'zoc-body'); body.id = id + '-body'; label.setAttribute('for', body.id);
    const preview = el('article', undefined, 'zoc-preview'); preview.setAttribute('aria-label', '노트 미리보기');
    source.append(details, label, body, el('p', '저장: Ctrl+S / ⌘S · 서지정보는 Zotero에서 자동 갱신됩니다.', 'zoc-hint'));
    reading.append(el('strong', '미리보기'), el('p', '기본 Markdown 표시 · 수식, 위키 링크, 플러그인 기능은 Obsidian에서 확인하세요.', 'zoc-hint'), preview);
    panes.append(source, reading);
    const conflict = el('div', undefined, 'zoc-conflict'); conflict.hidden = true;
    conflict.append(el('p', '외부 변경과 편집 내용이 겹칩니다. 아래 현재 파일과 비교하세요. 필요한 편집 내용을 복사한 뒤 “현재 파일 불러오기”로 다시 편집할 수 있습니다.'));
    const comparison = el('textarea'); comparison.readOnly = true; comparison.setAttribute('aria-label', '디스크의 현재 파일'); conflict.append(comparison);
    const button = (text, action, cls) => {
      const node = el('button', text, cls); node.type = 'button';
      node.addEventListener('click', () => {Promise.resolve().then(action).catch(showError);}); toolbar.append(node); return node;
    };
    function showError(error) {if (active) status.textContent = error.message || String(error); Z.logError(error);}
    function text() {return before.value + parts.managed + body.value;}
    function dirty() {return text() !== base.replace(/\r\n/g, '\n');}
    function persist() {
      Z.Prefs.set(draftKey, dirty() ? JSON.stringify({base, text: text()}) : '', true);
    }
    function paint() {
      renderNotePreview(document, preview, text(), url => {try {Z.launchURL(url);} catch (e) {showError(e);}});
    }
    function setText(value) {
      parts = split(value, session.identity); before.value = parts.before; body.value = parts.after;
      paint();
    }
    function setWorking(value) {working = value; before.readOnly = body.readOnly = value; saveButton.disabled = reloadButton.disabled = value;}
    async function save() {
      if (working || !active) return;
      persist(); setWorking(true);
      const submitted = text(), submittedBase = base;
      try {
        const saved = await session.save(submittedBase, submitted);
        if (!saved) throw new Error('The connector has stopped. Your draft is retained.');
        base = saved.text; current = saved;
        if (active) {setText(saved.text); location.textContent = saved.file; conflict.hidden = true;}
        // A closed tab may already have been reopened and edited while this save was pending.
        const stored = Z.Prefs.get(draftKey, true);
        if (!stored || (JSON.parse(stored).base === submittedBase && JSON.parse(stored).text === submitted)) Z.Prefs.set(draftKey, '', true);
        if (active) status.textContent = '저장했습니다. Obsidian에서도 같은 파일을 사용합니다.';
      } catch (error) {
        if (error.code === 'NOTE_CONFLICT' && active) {
          const latest = await session.read();
          if (latest && active) {comparison.value = latest.text; conflict.hidden = false;}
        }
        showError(error);
      } finally {if (active) setWorking(false);}
    }
    async function reload() {
      if (working || !active) return;
      if (dirty() && !window.confirm('저장 전 편집 내용과 보관된 초안을 버리고 현재 파일을 불러올까요? 필요한 내용은 먼저 복사해 주세요.')) return;
      setWorking(true);
      try {
        const latest = await session.read();
        if (latest && active) {base = latest.text; current = latest; setText(base); persist(); location.textContent = latest.file; conflict.hidden = true; status.textContent = '현재 파일을 불러왔습니다.';}
      } finally {if (active) setWorking(false);}
    }
    const saveButton = button('저장', save, 'zoc-save');
    const reloadButton = button('현재 파일 불러오기', reload);
    button('Obsidian에서 열기', async () => {await session.openExternal(); if (dirty()) status.textContent = 'Obsidian은 마지막으로 저장된 파일을 엽니다. 이 탭의 편집 내용은 아직 저장 전입니다.';});
    button('읽기 / 편집', () => {source.hidden = !source.hidden; panes.style.gridTemplateColumns = source.hidden ? 'minmax(0,1fr)' : '';});
    toolbar.append(status); root.append(style, toolbar, location, conflict, panes); container.append(root);
    setText(edited);
    for (const input of [before, body]) input.addEventListener('input', () => {
      try {persist(); status.textContent = '저장 전 · 초안 보관됨';}
      catch (e) {showError(e); window.alert('초안을 보관하지 못했습니다. 탭을 닫기 전에 저장하거나 편집 내용을 복사해 주세요.');}
      timers.clearTimeout(previewTimer); previewTimer = timers.setTimeout(() => {if (active) paint();}, 200);
    });
    root.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {event.preventDefault(); event.stopPropagation(); save().catch(showError);}
      else if (event.target === body || event.target === before) {
        if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w')) event.stopPropagation();
      }
    });
    async function refresh() {
      if (!active || working) return;
      setWorking(true);
      try {
        const latest = await session.read();
        if (!latest || !active) return;
        location.textContent = latest.file;
        if (latest.text !== base) {
          try {
            const next = dirty() ? merge(base, text(), latest.text, session.identity) : latest.text;
            base = latest.text; current = latest; setText(next); persist(); conflict.hidden = true;
            status.textContent = dirty() ? '외부 서지정보를 반영했습니다. 편집 내용은 저장 전입니다.' : '외부 변경을 불러왔습니다.';
          } catch (error) {
            comparison.value = latest.text; conflict.hidden = false;
            status.textContent = '외부 편집과 충돌합니다. 파일을 덮어쓰지 않았으며 초안은 보관되어 있습니다.';
          }
        }
      } catch (error) {showError(error);}
      finally {if (active) setWorking(false);}
    }
    function schedule() {pollTimer = timers.setTimeout(async () => {await refresh(); if (active) schedule();}, 2000);}
    function cleanup() {
      if (!active) return;
      try {persist();} catch (e) {Z.logError(e);}
      active = false; timers.clearTimeout(pollTimer); timers.clearTimeout(previewTimer);
      entries.delete(session.key);
    }
    const entry = {id, window, session, root, body, before, preview, status, save, refresh, reload, cleanup};
    entries.set(session.key, entry); schedule(); body.focus(); return entry;
  }
  function removeWindow(window) {
    for (const entry of [...entries.values()]) if (entry.window === window) {
      entry.cleanup();
      if (!window.closed) window.Zotero_Tabs.close(entry.id);
    }
    const owner = owners.get(window);
    if (owner && window.Zotero_Tabs.getState === owner.filtered) window.Zotero_Tabs.getState = owner.original;
    owners.delete(window);
  }
  return {open, removeWindow, stop() {stopped = true; for (const window of [...owners.keys()]) removeWindow(window);}};
}
if (typeof module !== 'undefined') module.exports = {createNoteTabs, renderNotePreview};
