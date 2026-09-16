const {test} = require('node:test');
const assert = require('node:assert/strict');
const winPath = require('node:path').win32;
const {createCodexTranslator} = require('../src/codex-translation.js');

function jwt(exp=Math.floor(Date.now()/1000)+3600) {
 const payload=Buffer.from(JSON.stringify({exp,'https://api.openai.com/auth':{chatgpt_account_id:'account-from-jwt'}})).toString('base64url');
 return 'header.'+payload+'.signature';
}
function setup({withAuth=true,expired=false,withCli=false,requestError=false}={}) {
 const home='C:\\User',auth=winPath.join(home,'.codex','auth.json'),exe='C:\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe';
 const files=new Map(),reads=[],writes=[],execs=[],requests=[];
 if(withAuth)files.set(auth,JSON.stringify({tokens:{access_token:jwt(expired?1:undefined),account_id:'account-id',refresh_token:'refresh-secret'}}));
 if(withCli)files.set(exe,'binary');
 const environment={USERPROFILE:home,LOCALAPPDATA:'C:\\Local'};
 const io={exists:async file=>files.has(file),readUTF8:async file=>(reads.push(file),files.get(file)),writeUTF8:async(file,value)=>(writes.push(file),files.set(file,value))};
 const Z={isWin:true,getMainWindow:()=>({atob}),Utilities:{Internal:{exec:async(command,args)=>{
   execs.push({command,args});files.set(auth,JSON.stringify({tokens:{access_token:jwt(),account_id:'new-account'}}));
 }}}};
 const Services={env:{get:name=>environment[name]||'',set:(name,value)=>{environment[name]=value;}}};
 const request=async(url,options)=>{requests.push({url,options});if(requestError)throw {status:401,debugSecret:options.headers.Authorization};return 'data: {"type":"response.output_text.delta","delta":"한국어 "}\n\ndata: {"type":"response.output_text.delta","delta":"번역"}\n\ndata: [DONE]\n';};
 const translator=createCodexTranslator({Z,io,path:{join:winPath.join},Services,request});
 return {translator,files,reads,writes,execs,requests,auth,exe,environment};
}

test('Codex OAuth translation reuses the AIdea/Codex login without requiring the CLI',async()=>{
 const f=setup();
 const state=await f.translator.status();
 assert.equal(state.signedIn,true);assert.equal(state.mode,'shared-codex-oauth');
 const result=await f.translator.translate({abstract:'Secret unpublished abstract',model:'',systemPrompt:'Translate accurately.'});
 assert.equal(result,'한국어 번역');assert.equal(f.requests.length,1);assert.equal(f.execs.length,0);assert.deepEqual(f.writes,[]);
 const request=f.requests[0],payload=request.options.payload;
 assert.equal(request.url,'https://chatgpt.com/backend-api/codex/responses');
 assert.equal(request.options.headers.Authorization,'Bearer '+JSON.parse(f.files.get(f.auth)).tokens.access_token);
 assert.equal(request.options.headers['ChatGPT-Account-ID'],'account-id');
 assert.equal(payload.model,'gpt-5.6-luna');assert.equal(payload.store,false);assert.equal(payload.stream,true);
 assert.equal(payload.input[0].content[0].text,'Secret unpublished abstract');assert.equal(payload.instructions,'Translate accurately.');
 assert.ok(f.reads.every(file=>file===f.auth));
 assert.ok(!JSON.stringify(state).includes('refresh-secret'));
});

test('Codex browser login remains available when no shared OAuth session exists',async()=>{
 const f=setup({withAuth:false,withCli:true});
 const before=await f.translator.status();assert.equal(before.installed,true);assert.equal(before.signedIn,false);
 const after=await f.translator.login();assert.equal(after.signedIn,true);
 assert.deepEqual(f.execs,[{command:f.exe,args:['login']}]);
 assert.equal(f.environment.CODEX_HOME,'C:\\User\\.codex');
});

test('expired OAuth credentials are rejected without sending a request',async()=>{
 const f=setup({expired:true});
 assert.equal((await f.translator.status()).signedIn,false);
 await assert.rejects(f.translator.translate({abstract:'abstract',systemPrompt:'translate'}),/not signed in/);
 assert.equal(f.requests.length,0);
});

test('OAuth request failures do not expose credentials in connector errors',async()=>{
 const f=setup({requestError:true}),token=JSON.parse(f.files.get(f.auth)).tokens.access_token;
 await assert.rejects(f.translator.translate({abstract:'abstract',systemPrompt:'translate'}),error=>{
   assert.match(error.message,/HTTP 401/);assert.ok(!error.message.includes(token));return true;
 });
});
