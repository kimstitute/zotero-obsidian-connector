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
  const io = {makeDirectory:async()=>{},exists:async p=>p === path.join('C:/TestVault','.obsidian') || files.has(p),getChildren:async dir=>[...files.keys()].filter(p=>path.dirname(p)===dir),
    readUTF8:async p=>{if(!files.has(p))throw Error('missing');return files.get(p);},
    writeUTF8:async(p,s,o={})=>{if(o.mode==='create'&&files.has(p))throw Error('exists');if(o.backupFile)files.set(o.backupFile,files.get(p));files.set(p,s);}};
  const timers={setTimeout:f=>(pending=f,1),clearTimeout:()=>{pending=null;}};
  return {bridge:createBridge({Z,io,path:{join:path.join,filename:path.basename,isAbsolute:path.isAbsolute,normalize:path.normalize},timers,config:options.unconfigured ? null : {vaultPath: "C:/TestVault",noteFolder: "Papers"}}),items,files,launched,errors,make,notify:(...a)=>notify(...a),flush:async()=>{const f=pending;pending=null;if(f)f();await Promise.resolve();}};
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
