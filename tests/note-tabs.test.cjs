const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNoteTabs,renderNotePreview}=require('../src/note-tabs.js');
const {mergeNote}=require('../src/note-document.js');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.listeners={};this.style={};this.value='';this.hidden=false;this._text='';}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this._text='';this.children=nodes;}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 emit(name,event={}){for(const fn of this.listeners[name]||[])fn(event);}
 focus(){}
}
function fixture(sharedPrefs=new Map()){
 const document={createElementNS:(_,tag)=>new Node(tag),createTextNode:text=>{const n=new Node('#text');n.textContent=text;return n;}};
 const tabs=[{id:'library',type:'library'}]; let sequence=0;
 const window={document,closed:false,focus(){},confirm:()=>true,alert(){},Zotero_Tabs:{
   add:options=>{const container=new Node('div'),id='tab-'+(++sequence);tabs.push({...options,id});return {id,container};},
   close:id=>{const i=tabs.findIndex(t=>t.id===id);if(i>=0){tabs.splice(i,1)[0].onClose?.();}},select(){},getState:()=>tabs.map(t=>({id:t.id,type:t.type}))}};
 const errors=[], launched=[], timerQueue=new Map(); let timerID=0;
 const Z={Prefs:{get:key=>sharedPrefs.get(key),set:(key,value)=>sharedPrefs.set(key,value)},logError:e=>errors.push(e),launchURL:url=>launched.push(url)};
 const timers={setTimeout:fn=>{const id=++timerID;timerQueue.set(id,fn);return id;},clearTimeout:id=>timerQueue.delete(id)};
 const manager=createNoteTabs({Z,timers});
 const identity='library-ABCD1234';let disk='<!-- zotero-bridge:'+identity+':begin -->\n# Paper\n<!-- zotero-bridge:'+identity+':end -->\n\n## My notes\n';
 const session={key:'vault/Papers/'+identity,identity,title:'Paper',read:async()=>({file:'note.md',text:disk}),
   save:async(base,text)=>{disk=mergeNote(base,text,disk,identity);return {file:'note.md',text:disk};},openExternal:async()=>{}};
 return {document,window,tabs,manager,session,prefs:sharedPrefs,errors,launched,timerQueue,get disk(){return disk;},set disk(value){disk=value;}};
}
const type=(entry,text)=>{entry.body.value+=text;entry.body.emit('input');};
test('tabs reuse identity across windows, retain drafts through shutdown and restore session filtering',async()=>{
 const f=fixture();const state=f.window.Zotero_Tabs.getState;const entry=await f.manager.open(f.window,f.session);
 assert.equal((await f.manager.open(f.window,f.session)).id,entry.id);assert.equal(f.window.Zotero_Tabs.getState().length,1);
 type(entry,'Draft kept');f.manager.stop();assert.equal(f.tabs.length,1);assert.equal(f.window.Zotero_Tabs.getState,state);assert.equal(f.timerQueue.size,0);
 const g=fixture(f.prefs);const restored=await g.manager.open(g.window,g.session);assert.ok(restored.body.value.endsWith('Draft kept'));
 await restored.save();assert.ok(g.disk.endsWith('Draft kept'));assert.ok([...g.prefs.values()].every(v=>v===''));g.manager.stop();
});
test('refresh merges changed metadata and preserves conflicting drafts without overwriting disk',async()=>{
 const f=fixture();const entry=await f.manager.open(f.window,f.session);type(entry,'Local draft');
 f.disk=f.disk.replace('# Paper','# Latest');await entry.refresh();assert.ok(entry.preview.textContent.includes('Latest'));assert.ok(entry.body.value.endsWith('Local draft'));
 f.disk+='External draft';await entry.refresh();await entry.save();assert.ok(f.disk.endsWith('External draft'));assert.ok(entry.body.value.endsWith('Local draft'));
 f.window.confirm=()=>false;await entry.reload();assert.ok(entry.body.value.endsWith('Local draft'));
 f.window.confirm=()=>true;await entry.reload();assert.ok(entry.body.value.endsWith('External draft'));f.manager.stop();
});
test('a pending save cannot clear new edits made after closing and reopening a tab',async()=>{
 const f=fixture();const entry=await f.manager.open(f.window,f.session);type(entry,'First edit');
 let finish;const save=f.session.save;f.session.save=()=>new Promise(resolve=>{finish=resolve;});const pending=entry.save();
 f.window.Zotero_Tabs.close(entry.id);const reopened=await f.manager.open(f.window,f.session);type(reopened,'Second edit');
 const saved=await save(f.disk,f.disk+'First edit');finish(saved);await pending;
 assert.ok(JSON.parse([...f.prefs.values()][0]).text.endsWith('Second edit'));f.manager.stop();
});
test('pending opens do not create duplicate tabs or revive a closed window',async()=>{
 const f=fixture();const read=f.session.read;let finish;f.session.read=()=>new Promise(resolve=>{finish=resolve;});
 const a=f.manager.open(f.window,f.session),b=f.manager.open(f.window,f.session);f.manager.removeWindow(f.window);finish(await read());
 assert.equal(await a,null);assert.equal(await b,null);assert.equal(f.tabs.length,1);
});
test('preview never creates executable HTML, image requests or unsafe links',()=>{
 const f=fixture(),target=new Node('div');
 renderNotePreview(f.document,target,'# Title\n<script>evil()</script>\n![track](https://example.test/image)\n[bad](javascript:evil)\n[good](https://example.test/paper)\n```\n<iframe src="https://example.test">\n```',url=>f.launched.push(url));
 const all=[];const visit=n=>{all.push(n);n.children.forEach(visit);};visit(target);
 assert.ok(!all.some(n=>['script','img','iframe'].includes(n.tag)));assert.ok(target.textContent.includes('<script>'));
 assert.ok(!all.some(n=>n.attributes.href?.startsWith('javascript:')));
 const link=all.find(n=>n.attributes.href==='https://example.test/paper');assert.ok(link);link.emit('click',{preventDefault(){}});assert.deepEqual(f.launched,['https://example.test/paper']);
});
