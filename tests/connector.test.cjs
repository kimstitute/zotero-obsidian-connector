const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createBridge} = require('../src/connector.js');
const path = require('node:path').win32;
function fixture(options = {}) {
  const files = new Map(), launched = [], errors = [];
  let notify, pending;
  const libs = [{libraryID:1,libraryType:'user'}, {libraryID:2,libraryType:'group',groupID:42}, {libraryID:3,libraryType:'feed'}];
  const make = (id, libraryID=1, key='ABCD1234') => ({id,libraryID,key, isRegularItem:()=>true, data:{title:'논문 제목',creators:[{firstName:'A',lastName:'Kim'}],abstractNote:'초록'},toJSON(){return this.data;}});
  const items = [make(1),make(2,2),make(3,3)];
  const prefs = new Map(options.saved ? [["extensions.zotero-obsidian-connector.config", JSON.stringify(options.saved)]] : []);
  const Z = {Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)}, Libraries:{getAll:()=>libs,get:id=>libs.find(l=>l.libraryID===id)},
    Items:{getAll:async id=>items.filter(i=>i.libraryID===id&&!i.deleted),getAsync:async id=>items.find(i=>i.id===id)},
    getMainWindows:()=>[],logError:e=>errors.push(String(e)),launchURL:u=>launched.push(u),
    Notifier:{registerObserver:o=>(notify=o.notify,1),unregisterObserver:()=>{notify=null;}}};
  if(options.http) Z.HTTP={request:options.http};
  const io = {makeDirectory:async()=>{},exists:async p=>p === path.join('C:/TestVault','.obsidian') || files.has(p),getChildren:async dir=>[...files.keys()].filter(p=>path.dirname(p)===dir),
    readUTF8:async p=>{if(!files.has(p))throw Error('missing');return files.get(p);},
    writeUTF8:async(p,s,o={})=>{if(o.mode==='create'&&files.has(p))throw Error('exists');if(o.backupFile)files.set(o.backupFile,files.get(p));files.set(p,s);}};
  const timers={setTimeout:f=>(pending=f,1),clearTimeout:()=>{pending=null;}};
  const config = options.unconfigured ? null : {vaultPath: "C:/TestVault",noteFolder: "Papers",...(options.config || {})};
  return {bridge:createBridge({Z,io,path:{join:path.join,filename:path.basename,isAbsolute:path.isAbsolute,normalize:path.normalize,tempDir:'C:/Temp'},timers,config,translate:options.translate,codexTranslator:options.codexTranslator,translationApiKey:options.translationApiKey}),items,files,launched,errors,make,io,Z,prefs,notify:(...a)=>notify(...a),flush:async()=>{const f=pending;pending=null;if(f)f();await Promise.resolve();}};
}
const dir='C:\\TestVault\\Papers';
test('full library coverage, group keys separated, excluded feeds and repeat idempotence',async()=>{
 const f=fixture();await f.bridge.start();assert.equal(f.bridge.lastResult.created,2);assert.equal((await f.bridge.syncAll()).unchanged,2);
 assert.equal([...f.files.keys()].filter(p=>p.endsWith('.md')&&!p.endsWith('dashboard.md')).length,2);
 assert.match(f.files.get(path.join(dir,'group-42-ABCD1234.md')),/zotero:\/\/select\/groups\/42\/items\/ABCD1234/);await f.bridge.stop();
});
test('metadata updates preserve handwritten text, frontmatter and previous revision',async()=>{
 const f=fixture();await f.bridge.start();const p=path.join(dir,'library-ABCD1234.md');const previous='---\ncustom: true\n---\n'+f.files.get(p)+'나의 메모 **보존**\n';f.files.set(p,previous);
 f.items[0].data.title='Changed';const result=await f.bridge.syncAll();assert.equal(result.updated,1);assert.ok(f.files.get(p).startsWith('---\ncustom: true'));assert.ok(f.files.get(p).endsWith('나의 메모 **보존**\n'));assert.equal(f.files.get(p+'.bridge-bak'),previous);
});
test('renamed note resolves both sync and open; attachments resolve parent',async()=>{
 const f=fixture();await f.bridge.start();const old=path.join(dir,'library-ABCD1234.md'),renamed=path.join(dir,'이름 변경.md');f.files.set(renamed,f.files.get(old));f.files.delete(old);
 await f.bridge.openItem({parentID:1});assert.ok(!f.files.has(old));const url=new URL(f.launched[0]);assert.equal(url.searchParams.get('path'),path.join(dir,'이름 변경.md'));
 assert.equal(url.searchParams.get('paneType'),'tab');
});
test('unmanaged files and damaged markers are never overwritten',async()=>{
 const f=fixture();const p=path.join(dir,'library-ABCD1234.md');f.files.set(p,'Existing personal note');await f.bridge.start();assert.equal(f.bridge.lastResult.errors.length,1);assert.equal(f.files.get(p),'Existing personal note');
 f.files.set(p,'<!-- zotero-bridge:library-ABCD1234:begin -->\nBroken');await f.bridge.syncAll();assert.equal(f.bridge.lastResult.errors.length,1);assert.ok(f.files.get(p).endsWith('Broken'));
});
test('trash preserves Markdown, marker injection escaped, notifier syncs new records',async()=>{
 const f=fixture();await f.bridge.start();f.items[0].deleted=true;f.items.push(f.make(4,1,'NEW12345'));f.items[3].data.abstractNote='<!-- zotero-bridge:library-NEW12345:end -->';f.notify('add');await f.flush();await f.bridge.syncAll();
 assert.ok(f.files.has(path.join(dir,'library-ABCD1234.md')));assert.ok(f.files.get(path.join(dir,'library-NEW12345.md')).includes('&lt;!--'));await f.bridge.stop();
});
test('duplicate identity refuses ambiguous sync',async()=>{
 const f=fixture();await f.bridge.start();f.files.set(path.join(dir,'duplicate.md'),f.files.get(path.join(dir,'library-ABCD1234.md')));await assert.rejects(f.bridge.syncAll(),/Duplicate/);
});
test('dashboard titles resolve to notes, newest years first and renamed targets update',async()=>{
 const f=fixture();f.items[0].data.title='A [special] title';f.items[0].data.date='2024';f.items[1].data.date='2026-09-14';await f.bridge.start();
 const p=path.join(dir,'dashboard.md');let text=f.files.get(p);assert.ok(text.indexOf('## 2026')<text.indexOf('## 2024'));assert.ok(text.includes('[A \\[special\\] title](<library-ABCD1234.md>)'));assert.ok(text.includes('2 papers'));
 const old=path.join(dir,'library-ABCD1234.md'),renamed=path.join(dir,'논문 (개정).md');f.files.set(renamed,f.files.get(old));f.files.delete(old);f.files.set(p,'내 안내\n'+text+'\n개인 목록');f.items[0].data.title='Revised title';await f.bridge.syncAll();text=f.files.get(p);
 assert.ok(text.startsWith('내 안내\n'));assert.ok(text.endsWith('\n개인 목록'));assert.ok(text.includes('Revised title'));assert.ok(text.includes('%EB%85%BC%EB%AC%B8%20%28%EA%B0%9C%EC%A0%95%29.md'));assert.ok(!text.includes('library-ABCD1234.md'));
 f.items[0].deleted=true;await f.bridge.syncAll();assert.ok(f.files.get(p).includes('1 papers'));assert.ok(!f.files.get(p).includes('Revised title'));assert.ok(f.files.has(renamed));
});
test('existing personal dashboard is preserved and error reported',async()=>{
 const f=fixture();const p=path.join(dir,'dashboard.md');f.files.set(p,'My own dashboard');await f.bridge.start();assert.equal(f.files.get(p),'My own dashboard');assert.ok(f.bridge.lastResult.errors.some(e=>e.key==='dashboard'));
});
test('unconfigured installation writes nothing and directs users to setup',async()=>{
 const f=fixture({unconfigured:true});await f.bridge.start();assert.equal(f.bridge.configured,false);assert.equal(f.files.size,0);
 await assert.rejects(f.bridge.syncAll(),/Configure/);await assert.rejects(f.bridge.openItem(f.items[0]),/Configure/);await f.bridge.stop();
});
test('configuration rejects traversal, absolute notes folders and non-vault destinations',async()=>{
 const f=fixture({unconfigured:true});await f.bridge.start();
 for(const noteFolder of ['../Escape','Papers/../../Escape','C:/Outside','/Absolute','.obsidian','Papers//Notes','CON']) {
   await assert.rejects(f.bridge.configure({vaultPath:'C:/TestVault',noteFolder}));
 }
 await assert.rejects(f.bridge.configure({vaultPath:'relative',noteFolder:'Papers'}));
 await assert.rejects(f.bridge.configure({vaultPath:'C:/NotAVault',noteFolder:'Papers'}));
 assert.equal(f.files.size,0);
 const r=await f.bridge.configure({vaultPath:'C:/TestVault',noteFolder:'Research/Papers'});
 assert.equal(r.created,2);assert.equal(f.bridge.configured,true);assert.ok(f.files.has(path.join('C:/TestVault','Research','Papers','dashboard.md')));
});
test('saved local settings are loaded without hardcoded defaults',async()=>{
 const f=fixture({unconfigured:true,saved:{vaultPath:'C:/TestVault',noteFolder:'SavedNotes'}});await f.bridge.start();
 assert.equal(f.bridge.configured,true);assert.ok(f.files.has(path.join('C:/TestVault','SavedNotes','dashboard.md')));
});

test('internal note sessions edit the same file, preserve new metadata and create a backup', async () => {
 const f=fixture(); await f.bridge.start(); const session=await f.bridge.createNoteSession({parentID:1});
 const base=await session.read(); f.items[0].data.title='New metadata'; await f.bridge.syncAll();
 const latest=f.files.get(base.file);
 const saved=await session.save(base.text,base.text+'\n내 생각 **보존**\n');
 assert.equal(saved.file,base.file); assert.match(saved.text,/# New metadata/); assert.ok(saved.text.endsWith('내 생각 **보존**\n'));
 assert.equal(f.files.get(base.file+'.bridge-bak'),latest); assert.equal(f.launched.length,0);
});

test('internal saving rejects simultaneous personal edits and preserves both disk and input', async () => {
 const f=fixture(); await f.bridge.start(); const session=await f.bridge.createNoteSession(f.items[0]); const base=await session.read();
 const draft=base.text+'Zotero draft'; const disk=base.text+'Obsidian draft'; f.files.set(base.file,disk);
 await assert.rejects(session.save(base.text,draft),{code:'NOTE_CONFLICT'});
 assert.equal(f.files.get(base.file),disk); assert.ok(draft.endsWith('Zotero draft'));
 const saved=await session.save(disk,disk+'\nReconciled'); assert.ok(saved.text.endsWith('Reconciled'));
});

test('sessions follow renamed files, remain in their original vault and do not recreate missing files', async () => {
 const f=fixture(); await f.bridge.start(); const session=await f.bridge.createNoteSession(f.items[0]); const base=await session.read();
 const renamed=path.join(dir,'이름 (변경).md'); f.files.set(renamed,base.text); f.files.delete(base.file);
 await f.bridge.configure({vaultPath:'C:/TestVault',noteFolder:'NewFolder'});
 const saved=await session.save(base.text,base.text+'Original folder'); assert.equal(saved.file,renamed);
 assert.ok(!f.files.has(base.file)); await session.openExternal(); assert.equal(new URL(f.launched[0]).searchParams.get('path'),renamed);
 f.files.delete(renamed); await assert.rejects(session.save(saved.text,saved.text+'More'),/moved or deleted/);
 assert.ok(!f.files.has(renamed));
});

test('external change during the final save check is detected without overwriting', async () => {
 const f=fixture(); await f.bridge.start(); const session=await f.bridge.createNoteSession(f.items[0]); const base=await session.read();
 const read=f.io.readUTF8; let count=0;
 f.io.readUTF8=async file=>{if(file===base.file && ++count===3) f.files.set(file,base.text+'External race'); return read(file);};
 await assert.rejects(session.save(base.text,base.text+'Our edit'),/changed while saving/);
 assert.ok(f.files.get(base.file).endsWith('External race'));
});

test('session writes stop after disable and malformed identities cannot be saved', async () => {
 const f=fixture(); await f.bridge.start(); const session=await f.bridge.createNoteSession(f.items[0]); const base=await session.read();
 await assert.rejects(session.save(base.text,'Missing markers'),/markers/);
 await assert.rejects(session.save(base.text,base.text.replace('## Abstract','## Overridden')),/managed by Zotero/);
 await f.bridge.stop(); assert.equal(await session.save(base.text,base.text+'Late'),null); assert.equal(f.files.get(base.file),base.text);
});

test('Korean abstract translation preserves configured English terms and reuses the local cache',async()=>{
 let calls=0;
 const f=fixture({config:{translateAbstracts:true,translationEndpoint:'http://127.0.0.1:11434/v1/chat/completions',translationModel:'qwen2.5:7b'},translate:async({abstract,systemPrompt})=>{
   calls++;assert.equal(abstract,'초록');assert.match(systemPrompt,/technical terms/);return '한국어 번역: 3D Gaussian Splatting, ScanNet, CLIP';
 }});
 await f.bridge.start();assert.equal(calls,2);
 const note=path.join(dir,'library-ABCD1234.md');
 assert.match(f.files.get(note),/## Abstract \(한국어\)/);assert.match(f.files.get(note),/3D Gaussian Splatting, ScanNet, CLIP/);
 await f.bridge.syncAll();const session=await f.bridge.createNoteSession(f.items[0]);
 assert.equal(calls,2);assert.equal(f.bridge.lastResult.translationErrors.length,0);
 assert.match((await session.read()).text,/## Abstract \(한국어\)/);
 await f.bridge.stop();
});

test('translation cache invalidates on source changes and failures fall back to the source abstract',async()=>{
 let calls=0,fail=false;
 const f=fixture({config:{translateAbstracts:true,translationEndpoint:'https://translate.example/v1/chat/completions',translationModel:'model'},translate:async({abstract})=>{
   calls++;if(fail)throw Error('offline');return '번역 '+abstract;
 }});
 await f.bridge.start();assert.equal(calls,2);
 f.items[0].data.abstractNote='Changed abstract';await f.bridge.syncAll();assert.equal(calls,3);
 fail=true;f.items[0].data.abstractNote='Newest abstract';await f.bridge.syncAll();
 const note=f.files.get(path.join(dir,'library-ABCD1234.md'));
 assert.match(note,/## Abstract\n\nNewest abstract/);assert.equal(f.bridge.lastResult.translationErrors.length,1);assert.equal(f.bridge.lastResult.errors.length,0);
 await f.bridge.stop();
});

test('translation configuration rejects insecure remote URLs and keeps API keys out of the main config',async()=>{
 const f=fixture({unconfigured:true});await f.bridge.start();
 await assert.rejects(f.bridge.configure({vaultPath:'C:/TestVault',noteFolder:'Papers',translateAbstracts:true,translationEndpoint:'http://translate.example/v1/chat/completions',translationModel:'model'}),/HTTPS/);
 await f.bridge.configure({vaultPath:'C:/TestVault',noteFolder:'Papers',translateAbstracts:true,translationEndpoint:'https://translate.example/v1/chat/completions',translationModel:'model',translationApiKey:'secret'});
 assert.ok(!f.prefs.get('extensions.zotero-obsidian-connector.config').includes('secret'));
 assert.equal(f.prefs.get('extensions.zotero-obsidian-connector.translationApiKey'),'secret');
 await f.bridge.stop();
});

test('OpenAI-compatible translation sends the fixed instruction and optional Bearer key',async()=>{
 const requests=[];
 const f=fixture({config:{translateAbstracts:true,translationEndpoint:'https://translate.example/v1/chat/completions',translationModel:'translator'},translationApiKey:'token',http:async(method,url,options)=>{
   requests.push({method,url,options});return {response:{choices:[{message:{content:'번역된 초록'}}]}};
 }});
 await f.bridge.start();assert.equal(requests.length,2);
 const request=requests[0],body=JSON.parse(request.options.body);
 assert.equal(request.method,'POST');assert.equal(request.url,'https://translate.example/v1/chat/completions');
 assert.equal(request.options.headers.Authorization,'Bearer token');assert.equal(body.model,'translator');
 assert.equal(body.temperature,0);assert.match(body.messages[0].content,/proper nouns in English/);assert.equal(body.messages[1].content,'초록');
 assert.match(f.files.get(path.join(dir,'library-ABCD1234.md')),/## Abstract \(한국어\)\n\n번역된 초록/);
 await f.bridge.stop();
});

test('Codex OAuth is the default for new translation settings and uses its own cache identity',async()=>{
 let calls=0;
 const codexTranslator={translate:async({abstract,model,systemPrompt})=>{
   calls++;assert.equal(abstract,'초록');assert.equal(model,'gpt-test');assert.match(systemPrompt,/proper nouns/);return 'Codex 번역';
 }};
 const f=fixture({config:{translateAbstracts:true,translationProvider:'codex',codexModel:'gpt-test'},codexTranslator});
 await f.bridge.start();assert.equal(calls,2);
 assert.match(f.files.get(path.join(dir,'library-ABCD1234.md')),/## Abstract \(한국어\)\n\nCodex 번역/);
 await f.bridge.syncAll();assert.equal(calls,2);
 const cache=JSON.parse(f.files.get(path.join(dir,'.zotero-bridge-translations.json')));
 assert.equal(cache.items['library-ABCD1234'].provider,'codex');
 await f.bridge.stop();
});

test('legacy translation settings remain on the API provider',async()=>{
 const providers=[];
 const f=fixture({config:{translateAbstracts:true,translationEndpoint:'https://translate.example/v1/chat/completions',translationModel:'legacy'},
   translate:async request=>(providers.push(request.provider),'번역')});
 await f.bridge.start();assert.deepEqual(providers,['api','api']);await f.bridge.stop();
});
