const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path').win32;
const {createCodexTranslator} = require('../src/codex-translation.js');

test('Codex translator delegates auth, keeps the abstract out of process arguments, and cleans temporary files',async()=>{
 const files=new Map([['C:\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe','binary']]);
 const calls=[],removed=[],errors=[];
 const io={
   exists:async file=>files.has(file),
   makeDirectory:async()=>{},
   writeUTF8:async(file,value)=>files.set(file,value),
   readUTF8:async file=>files.get(file),
   remove:async(file,options)=>{removed.push({file,options});for(const key of [...files.keys()])if(key.startsWith(file))files.delete(key);}
 };
 const subprocess=async(command,args)=>{
   calls.push({kind:'subprocess',command,args:[...args]});
   if(args[0]==='--version')return 'codex-cli 1.0.0';
   if(args[0]==='login')return 'Logged in using ChatGPT';
   if(args[0]==='exec'){
     const output=args[args.indexOf('--output-last-message')+1];
     const folder=args[args.indexOf('--cd')+1];
     assert.equal(files.get(path.join(folder,'abstract.txt')),'Secret unpublished abstract');
     files.set(output,JSON.stringify({translation:'비공개 초록 번역'}));
     return '';
   }
   throw Error('unexpected command');
 };
 const Z={isWin:true,logError:e=>errors.push(String(e)),Utilities:{Internal:{subprocess,exec:async(command,args)=>calls.push({kind:'exec',command,args:[...args]})}}};
 const Services={env:{get:name=>({LOCALAPPDATA:'C:\\Local',PATH:''}[name]||'')}};
 const translator=createCodexTranslator({Z,io,path:{...path,tempDir:'C:\\Temp'},Services});
 assert.equal((await translator.status()).signedIn,true);
 const translated=await translator.translate({abstract:'Secret unpublished abstract',model:'gpt-test',systemPrompt:'Translate accurately.'});
 assert.equal(translated,'비공개 초록 번역');
 const execution=calls.find(call=>call.args[0]==='exec');
 assert.ok(execution);assert.ok(!execution.args.join(' ').includes('Secret unpublished abstract'));
 assert.ok(execution.args.includes('--ephemeral'));assert.ok(execution.args.includes('--ignore-user-config'));
 assert.ok(execution.args.includes('read-only'));assert.ok(execution.args.includes('gpt-test'));
 assert.equal(removed.length,1);assert.equal(removed[0].options.recursive,true);assert.deepEqual(errors,[]);
});

test('Codex login uses the CLI process and never reads an auth token file',async()=>{
 const exe='C:\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe',reads=[],execs=[];
 const io={exists:async file=>file===exe,readUTF8:async file=>(reads.push(file),''),makeDirectory:async()=>{},writeUTF8:async()=>{},remove:async()=>{}};
 let signedIn=false;
 const Z={isWin:true,logError:()=>{},Utilities:{Internal:{
   subprocess:async(_command,args)=>args[0]==='--version'?'codex-cli 1.0.0':'',
   exec:async(command,args)=>{execs.push({command,args});if(args[0]==='login'&&args[1]==='status'&&!signedIn)throw Error('not signed in');if(args.length===1&&args[0]==='login')signedIn=true;}
 }}};
 const environment={LOCALAPPDATA:'C:\\Local',USERPROFILE:'C:\\User'};
 const Services={env:{get:name=>environment[name]||'',set:(name,value)=>{environment[name]=value;}}};
 const translator=createCodexTranslator({Z,io,path:{...path,tempDir:'C:\\Temp'},Services});
 assert.equal((await translator.status()).signedIn,false);
 assert.equal((await translator.login()).signedIn,true);
 assert.deepEqual(execs,[{command:exe,args:['login','status']},{command:exe,args:['login']},{command:exe,args:['login','status']}]);assert.deepEqual(reads,[]);
 assert.equal(environment.CODEX_HOME,'C:\\User\\.codex');
});
