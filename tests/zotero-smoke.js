// Only injected into a new test profile; never shipped in the XPI.
(async () => {
  const result={ok:false,version:Zotero.version,checks:[]};
  const check=(name,value)=>{Zotero.debug('Connector smoke: '+name+' = '+!!value);result.checks.push({name,pass:!!value});if(!value)throw Error(name);};
  try {
    check('isolated profile',Zotero.Profile.dir===__PROFILE__);
    const w=Zotero.getMainWindow(), bridge=Zotero.ObsidianConnector;
    check('internal note menu installed',!!w.document.getElementById('zoc-note-tab'));
    check('Codex sign-in menu installed',!!w.document.getElementById('zoc-codex-login'));
    check('ChatGPT sign-out menu installed',!!w.document.getElementById('zoc-codex-logout'));
    const oauthScope = {};
    Services.scriptloader.loadSubScript(Services.io.newFileURI(Zotero.File.pathToFile(PathUtils.join(__PROFILE__, 'extensions', 'zotero-obsidian-connector@local', 'codex-translation.js'))).spec, oauthScope);
    const authRequests = [];
    const fakeToken = 'test.' + w.btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,'https://api.openai.com/auth':{chatgpt_account_id:'isolated-test'}})) + '.signature';
    const authDeps = {Z:Zotero, Services, timers:w, request:async(url,options)=>{
      authRequests.push({url,options});
      if(url.endsWith('/usercode'))return {device_auth_id:'test-device',user_code:'TEST-ONLY',interval:'5'};
      if(url.endsWith('/deviceauth/token'))return {authorization_code:'test-code',code_verifier:'test-verifier'};
      if(url.endsWith('/oauth/token'))return {access_token:fakeToken,refresh_token:'synthetic-refresh'};
      return 'data: {"type":"response.output_text.delta","delta":"Point Cloud를 분석한다."}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n';
    }};
    const auth = oauthScope.createCodexTranslator(authDeps);
    check('fresh profile has no shared login',(await auth.status()).signedIn===false);
    await auth.login({onCode:code=>check('standalone device code callback',code.userCode==='TEST-ONLY')});
    check('standalone login stored in Zotero password manager',(await auth.status()).signedIn);
    const authRestart = oauthScope.createCodexTranslator(authDeps);
    check('connector login reloads independently',(await authRestart.status()).signedIn);
    check('standalone translation uses stored credential',await authRestart.translate({abstract:'Analyze Point Cloud.',systemPrompt:'Translate.'})==='Point Cloud를 분석한다.');
    await authRestart.logout();
    check('standalone logout removes credential',!(await auth.status()).signedIn);
    const nativeAuth = oauthScope.createCodexTranslator({Z:Zotero,Services,timers:w});
    const savedFetch=w.fetch;
    let fetchCount=0;
    try {
      w.fetch=async(url,options)=>{fetchCount++;check('OAuth fetch disables redirects and cookies',options.redirect==='error' && options.credentials==='omit');
        return {ok:true,text:async()=>JSON.stringify({device_auth_id:'test',user_code:'TEST-ONLY',interval:5})};};
      try {await nativeAuth.login({onCode:({cancel})=>cancel()});}catch(error){check('native request cancellation',String(error).includes('cancelled'));}
      check('native OAuth transport works in Zotero',fetchCount===1);
    } finally {w.fetch=savedFetch;}
    const originalConfirm=w.confirm, originalAlert=w.alert, originalLaunch=Zotero.launchURL;
    let approveLogin, browserURL='', success=false, loginError='';
    const approval=new Promise(resolve=>approveLogin=resolve);
    try {
      w.confirm=()=>true;
      w.alert=message=>{if(message.startsWith('ChatGPT sign-in complete'))success=true;else loginError=message;};
      Zotero.launchURL=url=>{browserURL=url;};
      w.fetch=async(url,options)=>{
        if(url.endsWith('/deviceauth/token'))await approval;
        const response=await authDeps.request(url,{payload:options.body});
        return {ok:true,text:async()=>typeof response==='string'?response:JSON.stringify(response)};
      };
      w.document.getElementById('zoc-codex-login').dispatchEvent(new w.Event('command'));
      for(let attempt=0;attempt<100&&!browserURL&&!loginError;attempt++)await Zotero.Promise.delay(20);
      const loginPanel=w.document.getElementById('zoc-chatgpt-login-panel');
      check('standalone login panel displays device code',loginPanel?.querySelector('input')?.value==='TEST-ONLY');
      check('login panel has visible layout',loginPanel.getBoundingClientRect().width>400 && loginPanel.querySelector('input').getBoundingClientRect().height>20);
      check('login opens only the OpenAI device page',browserURL==='https://auth.openai.com/codex/device');
      approveLogin();
      for(let attempt=0;attempt<100&&!success&&!loginError;attempt++)await Zotero.Promise.delay(20);
      check('menu login completes and removes panel',success&&!w.document.getElementById('zoc-chatgpt-login-panel'));
      const passwordFile=PathUtils.join(__PROFILE__,'logins.json');
      for(let attempt=0;attempt<200&&!await IOUtils.exists(passwordFile);attempt++)await Zotero.Promise.delay(20);
      check('password manager persisted encrypted login',await IOUtils.exists(passwordFile) && !(await IOUtils.readUTF8(passwordFile)).includes('synthetic-refresh') && !(await IOUtils.readUTF8(passwordFile)).includes(fakeToken));
      await nativeAuth.logout();
    } finally {approveLogin();w.fetch=savedFetch;w.confirm=originalConfirm;w.alert=originalAlert;Zotero.launchURL=originalLaunch;}
    // Optional live contract probe creates a device code then cancels; it never logs in or translates.
    if (__LIVE_OAUTH__) {
      let issued=false;
      try {await nativeAuth.login({onCode:({userCode,cancel})=>{issued=typeof userCode==='string'&&userCode.length>0;cancel();}});}
      catch(error){if(!issued)throw error;}
      check('live OpenAI device code issued without CLI or shared auth',issued);
      check('live probe leaves connector signed out',!(await nativeAuth.status()).signedIn);
    }
    const prefWindow=Zotero.Utilities.Internal.openPreferences('zoc-preferences');
    let settingsRoot;
    for(let attempt=0;attempt<250;attempt++) {
      settingsRoot=prefWindow.document.getElementById('zoc-settings');
      if(settingsRoot?.dataset.ready==='true')break;
      await Zotero.Promise.delay(20);
    }
    if(settingsRoot?.dataset.ready!=='true')result.settingsDiagnostic={root:!!settingsRoot,feedback:settingsRoot?.querySelector('#zoc-feedback')?.textContent,html:prefWindow.document.documentElement.outerHTML.slice(-4000)};
    check('native settings pane loads',settingsRoot?.dataset.ready==='true');
    const field=id=>settingsRoot.querySelector('#zoc-'+id);
    check('settings folder picker and form have layout',field('browse').getBoundingClientRect().width>50 && field('vault').getBoundingClientRect().width>100);
    check('translation options initially hidden',field('translation-options').hidden);
    field('translate').checked=true;field('translate').dispatchEvent(new prefWindow.Event('change'));
    check('translation toggle reveals ChatGPT controls',!field('translation-options').hidden&&!field('chatgpt').hidden);
    field('provider').value='api';field('provider').dispatchEvent(new prefWindow.Event('change'));
    check('API provider reveals masked key field',!field('api').hidden&&field('chatgpt').hidden&&field('api-key').type==='password');
    field('vault').value=__VAULT__;field('folder').value='SettingsTest';field('translate').checked=false;
    field('save').click();
    for(let attempt=0;attempt<100&&field('save').disabled;attempt++)await Zotero.Promise.delay(20);
    check('GUI saves settings without syncing',bridge.getSettings().noteFolder==='SettingsTest'&&!await IOUtils.exists(PathUtils.join(__VAULT__,'SettingsTest','dashboard.md')));
    field('folder').value='../escape';field('save').click();
    for(let attempt=0;attempt<100&&field('save').disabled;attempt++)await Zotero.Promise.delay(20);
    check('GUI shows validation errors inline and preserves saved config',field('feedback').dataset.error==='true'&&bridge.getSettings().noteFolder==='SettingsTest');
    field('folder').value='SettingsTest';field('save-sync').click();
    for(let attempt=0;attempt<100&&field('save-sync').disabled;attempt++)await Zotero.Promise.delay(20);
    check('GUI save and sync creates the dashboard',await IOUtils.exists(PathUtils.join(__VAULT__,'SettingsTest','dashboard.md')));
    field('translate').checked=true;field('provider').value='codex';field('provider').dispatchEvent(new prefWindow.Event('change'));
    let guiApprove, guiURL='';const guiApproval=new Promise(resolve=>guiApprove=resolve);
    try {
      Zotero.launchURL=url=>{guiURL=url;};
      w.fetch=async(url,options)=>{
        if(url.endsWith('/deviceauth/token'))await guiApproval;
        const response=await authDeps.request(url,{payload:options.body});
        return {ok:true,text:async()=>typeof response==='string'?response:JSON.stringify(response)};
      };
      field('login').click();
      for(let attempt=0;attempt<100&&!guiURL;attempt++)await Zotero.Promise.delay(20);
      check('settings GUI login shows inline code',!field('device').hidden&&field('device-code').value==='TEST-ONLY'&&guiURL==='https://auth.openai.com/codex/device');
      guiApprove();
      for(let attempt=0;attempt<100&&(field('account-status').dataset.connected!=='true'||field('logout').disabled);attempt++)await Zotero.Promise.delay(20);
      check('settings GUI login updates account status',field('account-status').dataset.connected==='true'&&field('device').hidden);
      field('logout').click();
      for(let attempt=0;attempt<100&&field('account-status').dataset.connected==='true';attempt++)await Zotero.Promise.delay(20);
      check('settings GUI logout removes saved credential',field('account-status').dataset.connected==='false'&&!(await nativeAuth.status()).signedIn);
    } finally {guiApprove();w.fetch=savedFetch;Zotero.launchURL=originalLaunch;}
    prefWindow.close();
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
