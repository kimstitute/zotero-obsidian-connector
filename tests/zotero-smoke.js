// Only injected into a new test profile; never shipped in the XPI.
(async () => {
  const result={ok:false,version:Zotero.version,checks:[]};
  const check=(name,value)=>{result.checks.push({name,pass:!!value});if(!value)throw Error(name);};
  try {
    check('isolated profile',Zotero.Profile.dir===__PROFILE__);
    const w=Zotero.getMainWindow(), bridge=Zotero.ObsidianConnector;
    check('internal note menu installed',!!w.document.getElementById('zoc-note-tab'));
    const item=new Zotero.Item('journalArticle');
    item.setField('title','Internal note editor — 한글 검증'); item.setField('abstractNote','<script>throw Error("unsafe")</script>'); await item.saveTx();
    await bridge.configure({vaultPath:__VAULT__,noteFolder:'Papers'});
    const entry=await bridge.openItemInTab(item,w);
    check('custom tab created',w.Zotero_Tabs._tabs.some(t=>t.id===entry.id && t.type==='obsidiannote'));
    check('same paper reuses tab',(await bridge.openItemInTab(item,w)).id===entry.id);
    check('managed metadata only in preview',entry.preview.textContent.includes('Internal note editor') && !entry.body.value.includes('zotero-bridge:'));
    check('note HTML not executed',!entry.preview.querySelector('script') && entry.preview.textContent.includes('<script>'));
    const bounds=entry.body.getBoundingClientRect();
    check('editor has visible layout',bounds.width>100 && bounds.height>100);
    const state=w.Zotero_Tabs.getState(); check('custom tab excluded from core session',!state.some(t=>t.type==='obsidiannote'));
    entry.body.value+='\nZotero에서 쓴 메모'; entry.body.dispatchEvent(new w.Event('input',{bubbles:true}));
    await entry.save(); let disk=await entry.session.read();
    check('save writes shared Markdown',disk.text.endsWith('Zotero에서 쓴 메모'));
    check('previous file backup exists',await IOUtils.exists(disk.file+'.bridge-bak'));
    await IOUtils.writeUTF8(disk.file,disk.text+'\nObsidian external edit'); await entry.refresh();
    check('external changes reload clean tab',entry.body.value.endsWith('Obsidian external edit'));
    entry.body.value+='\nRecovered draft'; entry.body.dispatchEvent(new w.Event('input',{bubbles:true}));
    w.Zotero_Tabs.close(entry.id);
    const recovered=await bridge.openItemInTab(item,w);
    check('draft restored after tab close',recovered.body.value.endsWith('Recovered draft'));
    disk=await recovered.session.read(); await IOUtils.writeUTF8(disk.file,disk.text+'\nConcurrent edit');
    await recovered.refresh(); await recovered.save();
    check('conflict retains both versions',recovered.body.value.endsWith('Recovered draft') && (await IOUtils.readUTF8(disk.file)).endsWith('Concurrent edit'));
    check('conflict comparison visible',!recovered.root.querySelector('.zoc-conflict').hidden);
    const confirm=w.confirm;
    try {w.confirm=()=>true; await recovered.reload();} finally {w.confirm=confirm;}
    check('explicit reload uses current file',recovered.body.value.endsWith('Concurrent edit'));
    recovered.body.value+='\nAfter metadata update'; recovered.body.dispatchEvent(new w.Event('input',{bubbles:true}));
    item.setField('title','Updated Zotero metadata'); await item.saveTx(); await bridge.syncAll();
    await recovered.save(); disk=await recovered.session.read();
    check('metadata and personal edits preserved',disk.text.includes('Updated Zotero metadata') && disk.text.endsWith('After metadata update'));
    const renamed=PathUtils.join(__VAULT__,'Papers','이름 변경.md'); await IOUtils.move(disk.file,renamed);
    await recovered.refresh(); recovered.body.value+='\nRenamed file edit'; recovered.body.dispatchEvent(new w.Event('input',{bubbles:true})); await recovered.save();
    check('open session follows rename',(await IOUtils.readUTF8(renamed)).endsWith('Renamed file edit') && !await IOUtils.exists(disk.file));
    recovered.body.value+='\nDraft after disable'; recovered.body.dispatchEvent(new w.Event('input',{bubbles:true}));
    await bridge.stop();
    check('disable removes tabs and menus',!w.Zotero_Tabs._tabs.some(t=>t.type==='obsidiannote') && !w.document.getElementById('zoc-note-tab'));
    const draftKey='extensions.zotero-obsidian-connector.draft.'+encodeURIComponent(recovered.session.key);
    check('disable retains draft',JSON.parse(Zotero.Prefs.get(draftKey,true)).text.endsWith('Draft after disable'));
    check('normal Zotero session still works',w.Zotero_Tabs.getState().some(t=>t.type==='library'));
    result.ok=true;
  } catch(error) {result.error=String(error);result.stack=error.stack;}
  await IOUtils.writeJSON(__RESULT__,result);
  if(Zotero.Profile.dir===__PROFILE__) Services.startup.quit(Services.startup.eAttemptQuit);
})();
