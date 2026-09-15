const {test}=require('node:test');
const assert=require('node:assert/strict');
const {splitNote,mergeNote}=require('../src/note-document.js');
const id='library-ABCD1234';
const managed='<!-- zotero-bridge:'+id+':begin -->\n# Paper\n<!-- zotero-bridge:'+id+':end -->';
const base='---\ncustom: true\n---\n'+managed+'\n## My notes\nOriginal';
test('three-way merging combines independent frontmatter and note changes with current metadata',()=>{
 const edited=base+'\nMy edit'; const current=base.replace('custom: true','custom: false').replace('# Paper','# Updated');
 assert.equal(mergeNote(base,edited,current,id),current+'\nMy edit');
 assert.equal(mergeNote(base,edited,edited,id),edited);
 assert.equal(splitNote(base.replaceAll('\n','\r\n'),id).managed,managed);
});
test('managed block corruption, duplicate identities and concurrent edits are rejected',()=>{
 for(const text of ['',base.replace(':end -->',':broken -->'),base+managed]) assert.throws(()=>splitNote(text,id));
 assert.throws(()=>mergeNote(base,base.replace('# Paper','# Edited'),base,id),/managed by Zotero/);
 assert.throws(()=>mergeNote(base,base+'A',base+'B',id),{code:'NOTE_CONFLICT'});
});
