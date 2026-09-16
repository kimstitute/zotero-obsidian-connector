/* Runs only in Zotero's native preferences window. */
var ZOCSettings = {
  load(root, event) {
    const operation = this.init(root).catch(error => {
      const output=root.querySelector('#zoc-feedback'); if(output)output.textContent=String(error.message || error);
    });
    event.waitUntil?.(operation);
  },
  async init(root) {
    if (root.dataset.ready) return;
    const bridge = Zotero.ObsidianConnector;
    const ko = String(Zotero.locale || '').startsWith('ko');
    const text = {
      intro:['Connect your library, manage translation, and sync your notes.','논문 노트 연결과 초록 번역을 한곳에서 관리합니다.'],
      library:['Obsidian connection','Obsidian 연결'],vault:['Vault folder','보관함 폴더'],browse:['Choose folder…','폴더 선택…'],
      vaultHelp:['Select the folder containing .obsidian.','.obsidian 폴더가 들어 있는 보관함을 선택하세요.'],
      folder:['Notes folder inside the vault','보관함 안의 논문 노트 폴더'],
      scope:['All papers in your Zotero personal and group libraries are included.','개인·그룹 라이브러리의 전체 논문을 대상으로 합니다.'],
      translate:['Translate abstracts into Korean','초록을 한국어로 번역'],terms:['Keep technical terms, model names, and proper nouns in English.','전문용어·모델명·고유명사는 영어로 유지합니다.'],
      provider:['Translation provider','번역 제공자'],chatgpt:['ChatGPT login','ChatGPT 로그인'],api:['OpenAI-compatible API (advanced)','OpenAI 호환 API (고급)'],
      independent:['No API key, AIdea, or Codex CLI needed.','API 키, AIdea, Codex CLI 설치 없이 사용할 수 있습니다.'],
      login:['Sign in with ChatGPT','ChatGPT 로그인'],logout:['Sign out','로그아웃'],refresh:['Refresh status','상태 새로고침'],
      codeHelp:['Enter this code on the OpenAI page. Enable device code login in ChatGPT Security settings if prompted.','아래 코드를 OpenAI 페이지에 입력하세요. 안내가 나오면 ChatGPT 설정 → 보안에서 기기 코드 인증을 켜세요.'],
      openLogin:['Open login page','로그인 페이지 열기'],cancel:['Cancel login','로그인 취소'],
      modelOverride:['Model override (optional)','사용할 모델 (선택)'],modelHelp:['Leave blank to use the default model.','비워 두면 기본 모델을 사용합니다.'],
      disclosure:["Signing in stores this connector's login in Zotero password storage. Uncached abstracts go to ChatGPT and use your account's allowance. This Codex integration is not an official third-party API and may change.",'로그인 정보는 Zotero 비밀번호 저장소에 보관합니다. 캐시에 없는 초록은 ChatGPT로 전송하며 계정의 사용 한도를 사용합니다. 이 Codex 연동은 공식 제3자 API가 아니므로 향후 변경될 수 있습니다.'],
      endpoint:['Chat completions URL','Chat completions URL'],model:['Model','모델'],key:['API key (optional)','API 키 (선택)'],clearKey:['Remove saved API key on save','저장할 때 기존 API 키 삭제'],
      apiHelp:['Use HTTPS for remote services. Local Ollama may use HTTP without an API key. API keys are stored in local Zotero preferences.','외부 서버는 HTTPS를 사용하세요. 로컬 Ollama는 API 키 없이 HTTP를 사용할 수 있습니다. API 키는 로컬 Zotero 환경설정에 저장됩니다.'],
      saveSync:['Save and sync now','저장 후 지금 동기화'],save:['Save settings','설정 저장'],saved:['Settings saved.','설정을 저장했습니다.'],
      dirty:['Unsaved changes.','저장하지 않은 변경사항이 있습니다.'],saving:['Saving…','저장 중…'],syncing:['Saving and syncing notes…','설정 저장 및 논문 노트 동기화 중…'],
      checking:['Checking…','확인 중…'],connected:['Signed in','로그인됨'],disconnected:['Sign-in required','로그인 필요'],unknown:['Status unavailable','상태 확인 실패'],
      waiting:['Waiting for browser approval (up to 15 minutes)…','브라우저 승인을 기다립니다 (최대 15분)…'],starting:['Requesting login code…','로그인 코드를 요청합니다…'],
      loggedIn:['ChatGPT sign-in complete. Save and sync to translate your notes.','ChatGPT 로그인 완료. 저장 후 동기화하면 논문 초록을 번역합니다.'],loggedOut:['Connector login removed.','커넥터에서 로그아웃했습니다.'],
      needLogin:['Sign in with ChatGPT before starting translation.','번역을 시작하려면 먼저 ChatGPT에 로그인하세요.'],
      keySaved:['An API key is saved. Leave this field blank to keep it.','저장된 API 키가 있습니다. 비워 두면 기존 키를 유지합니다.'],
      keyEmpty:['No API key saved. Leave blank for services that do not require one.','저장된 API 키가 없습니다. 키가 필요 없는 서비스는 비워 두세요.']
    };
    const t = key => text[key]?.[ko ? 1 : 0] || key;
    const $ = id => root.querySelector('#zoc-' + id);
    for (const node of root.querySelectorAll('[data-label]')) node.textContent = t(node.dataset.label);
    if (!bridge) { $('feedback').textContent = 'Connector unavailable. Restart Zotero.'; return; }
    let busy = false, ownsLogin = false, disposed = false, signedIn = false, accountKnown = false, deviceURL = '';
    const listeners = [];
    const feedback = (message, error = false) => { if (!disposed) { $('feedback').textContent = message; $('feedback').dataset.error = String(error); } };
    function updateControls() {
      if (disposed) return;
      const enabled = $('translate').checked, isCodex = $('provider').value === 'codex';
      $('translation-options').hidden = !enabled;
      $('chatgpt').hidden = !isCodex; $('api').hidden = isCodex;
      for (const node of root.querySelectorAll('input,select,button')) node.disabled = busy;
      $('login').disabled = busy || signedIn;
      $('logout').disabled = busy || (accountKnown && !signedIn);
      $('device-cancel').disabled = !ownsLogin;
      $('device-open').disabled = !deviceURL;
      $('device-code').disabled = false;
    }
    function populate() {
      const settings = bridge.getSettings();
      for (const [id,key] of Object.entries({vault:'vaultPath',folder:'noteFolder',provider:'translationProvider',endpoint:'translationEndpoint','api-model':'translationModel','codex-model':'codexModel'})) $(id).value = settings[key];
      $('translate').checked = settings.translateAbstracts;
      $('api-key').value = ''; $('clear-key').checked = false;
      $('key-hint').textContent = t(settings.hasApiKey ? 'keySaved' : 'keyEmpty');
      $('api-key').placeholder = settings.hasApiKey ? '••••••••' : '';
      updateControls();
    }
    async function refreshAccount() {
      $('account-status').textContent = t('checking');
      try {
        const state = await bridge.getAccountStatus();
        if (disposed) return;
        signedIn = state.signedIn; accountKnown = true;
        $('account-status').textContent = t(signedIn ? 'connected' : 'disconnected');
        $('account-status').dataset.connected = String(signedIn);
      } catch (_) {
        accountKnown = false; signedIn = false;
        if (!disposed) { $('account-status').textContent = t('unknown'); $('account-status').dataset.connected = 'false'; }
      }
      updateControls();
    }
    function summary(result) {
      if (!result || result.saved) return '';
      return ko ? `동기화: 새 노트 ${result.created} · 업데이트 ${result.updated} · 변경 없음 ${result.unchanged} · 오류 ${result.errors.length} · 번역 원문 유지 ${result.translationErrors.length}`
        : `Sync: ${result.created} created · ${result.updated} updated · ${result.unchanged} unchanged · ${result.errors.length} errors · ${result.translationErrors.length} translation fallbacks`;
    }
    async function run(operation) {
      if (busy || disposed) return;
      busy = true; updateControls();
      try { await operation(); }
      catch (error) { feedback(String(error.message || error), true); }
      finally { busy = false; updateControls(); }
    }
    function listen(id, event, handler) {
      const node = $(id); node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler));
    }
    function values() {
      const value = {vaultPath:$('vault').value.trim(),noteFolder:$('folder').value.trim(),
        translateAbstracts:$('translate').checked,translationProvider:$('provider').value,
        translationEndpoint:$('endpoint').value.trim(),translationModel:$('api-model').value.trim(),codexModel:$('codex-model').value.trim()};
      if ($('clear-key').checked) value.translationApiKey = '';
      else if ($('api-key').value.trim()) value.translationApiKey = $('api-key').value.trim();
      return value;
    }
    async function save(sync) {
      const value = values();
      if (sync && value.translateAbstracts && value.translationProvider === 'codex' && !(await bridge.getAccountStatus()).signedIn) throw new Error(t('needLogin'));
      feedback(t(sync ? 'syncing' : 'saving'));
      const result = await bridge.configure(value, {sync});
      if (disposed) return;
      populate(); feedback(t('saved') + (sync ? '\n' + summary(result) : ''));
      $('last-sync').textContent = summary(bridge.lastResult);
    }
    for (const id of ['vault','folder','translate','provider','endpoint','api-model','api-key','codex-model','clear-key']) {
      listen(id,'input',()=>{updateControls();feedback(t('dirty'));});
      listen(id,'change',()=>{updateControls();feedback(t('dirty'));});
    }
    listen('browse','click',()=>run(async()=>{
      const {FilePicker} = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
      const picker = new FilePicker(); picker.init(window, t('vault'), picker.modeGetFolder);
      if ($('vault').value) { try { picker.displayDirectory = $('vault').value; } catch (_) {} }
      if (await picker.show() === picker.returnOK && !disposed) { $('vault').value=picker.file; feedback(t('dirty')); }
    }));
    listen('save','click',()=>run(()=>save(false)));
    listen('save-sync','click',()=>run(()=>save(true)));
    listen('account-refresh','click',()=>run(refreshAccount));
    listen('login','click',()=>run(async()=>{
      ownsLogin = true; feedback(t('starting'));
      $('device').hidden = false; $('device-code').value = ''; deviceURL = ''; updateControls();
      try {
        await bridge.loginChatGPT({onCode:({userCode,verificationURL,cancel})=>{
          if (disposed) { cancel(); return; }
          deviceURL=verificationURL; $('device-code').value=userCode; $('device-code').select();
          feedback(t('waiting')); updateControls(); Zotero.launchURL(verificationURL);
        }});
        feedback(t('loggedIn'));
      } finally {
        ownsLogin=false; deviceURL='';
        if (!disposed) { $('device').hidden=true; $('device-code').value=''; await refreshAccount(); }
      }
    }));
    listen('logout','click',()=>run(async()=>{await bridge.logoutChatGPT();await refreshAccount();feedback(t('loggedOut'));}));
    listen('device-cancel','click',()=>bridge.cancelChatGPTLogin());
    listen('device-open','click',()=>{if(deviceURL)Zotero.launchURL(deviceURL);});
    function dispose() {
      if (disposed) return;
      disposed=true; if (ownsLogin) bridge.cancelChatGPTLogin();
      $('api-key').value=''; $('device-code').value=''; listeners.forEach(remove=>remove());
      window.removeEventListener('unload',dispose);
    }
    window.addEventListener('unload',dispose,{once:true});
    root.zocDispose=dispose;
    populate(); $('last-sync').textContent=summary(bridge.lastResult);
    await refreshAccount(); root.dataset.ready='true';
  }
};
