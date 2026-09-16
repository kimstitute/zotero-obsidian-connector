const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createCodexTranslator} = require('../src/codex-translation.js');
const issuer = 'https://auth.openai.com';
const translation = {abstract:'3D Gaussian Splatting represents a scene.',systemPrompt:'Translate accurately.'};
const jwt = exp => 'header.'+Buffer.from(JSON.stringify({exp,'https://api.openai.com/auth':{chatgpt_account_id:'account'}})).toString('base64url')+'.signature';
const stream = 'data: {"type":"response.output_text.delta","delta":"한국어 번역"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n';
function setup({signedIn=false,expired=false,route}={}) {
  let time = 2000000000000, saved = signedIn ? {accessToken:jwt(expired?1:time/1000+3600),refreshToken:'refresh-secret',accountId:'account',expiresAt:expired?1:time+3600000} : null;
  const calls=[],writes=[],sleeps=[];
  const tokens = () => ({access_token:jwt(time/1000+3600),refresh_token:'rotated-secret'});
  const credentialStore={read:async()=>saved,write:async value=>{writes.push(value);saved=value;},clear:async()=>{saved=null;}};
  const deps={Z:{getMainWindow:()=>({atob})},timers:{setTimeout,clearTimeout},credentialStore,now:()=>time,
    sleep:async ms=>{sleeps.push(ms);time+=ms;},request:async(url,options)=>{
      calls.push({url,...options});
      if(route) { const result=await route(url,options,{tokens,calls});if(result!==undefined)return result; }
      if(url.endsWith('/usercode'))return {device_auth_id:'device-secret',user_code:'TEST-CODE',interval:'5'};
      if(url.endsWith('/deviceauth/token'))return {authorization_code:'authorization-secret',code_verifier:'verifier-secret'};
      if(url.endsWith('/oauth/token'))return tokens();
      return stream;
    }};
  const translator=createCodexTranslator(deps);
  return {translator,deps,calls,writes,sleeps,get saved(){return saved;}};
}
test('a fresh install signs in, persists independently, and translates without CLI or AIdea',async()=>{
  const f=setup();
  assert.equal((await f.translator.status()).signedIn,false);
  const result=await f.translator.login({onCode:code=>{
    assert.equal(code.userCode,'TEST-CODE');assert.equal(code.verificationURL,issuer+'/codex/device');
  }});
  assert.equal(result.signedIn,true);assert.equal(result.mode,'connector-oauth');assert.equal(f.writes.length,1);
  const exchange=f.calls.find(c=>c.url.endsWith('/oauth/token'));
  assert.equal(exchange.form,true);assert.equal(exchange.payload.grant_type,'authorization_code');
  assert.equal(exchange.payload.code_verifier,'verifier-secret');assert.equal(exchange.payload.redirect_uri,issuer+'/deviceauth/callback');
  const restarted=createCodexTranslator(f.deps);
  assert.equal(await restarted.translate(translation),'한국어 번역');
  const req=f.calls.at(-1);
  assert.equal(req.headers['ChatGPT-Account-ID'],'account');assert.equal(req.headers.Authorization,'Bearer '+f.saved.accessToken);
  assert.equal(req.payload.model,'gpt-5.6-luna');assert.equal(req.payload.store,false);
  assert.deepEqual(req.payload.input,[{type:'message',role:'user',content:[{type:'input_text',text:translation.abstract}]}]);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('unrelated shared credentials are never discovered or executed',async()=>{
  const f=setup();let accesses=0;
  const translator=createCodexTranslator({...f.deps,io:{readUTF8:()=>{accesses++;}},Services:{env:{get:()=>{accesses++;}}}});
  assert.equal((await translator.status()).signedIn,false);
  await assert.rejects(translator.translate(translation),/Sign in/);assert.equal(accesses,0);assert.equal(f.calls.length,0);
});
test('device authorization waits on pending statuses and backs off on rate limits',async()=>{
  let polls=0;const f=setup({route:(url)=>{if(url.endsWith('/deviceauth/token')&&++polls<4)throw {status:[403,404,429][polls-1]};}});
  await f.translator.login({onCode:()=>{}});assert.deepEqual(f.sleeps,[5000,5000,10000]);
});
test('pending authorization expires after 15 minutes without saving credentials',async()=>{
  const f=setup({route:url=>{if(url.endsWith('/deviceauth/token'))throw {status:403};}});
  await assert.rejects(f.translator.login({onCode:()=>{}}),/expired after 15 minutes/);
  assert.equal(f.writes.length,0);assert.equal(f.sleeps.reduce((a,b)=>a+b,0),900000);
});
test('cancelling device login prevents token polling and credential writes',async()=>{
  const f=setup();await assert.rejects(f.translator.login({onCode:({cancel})=>cancel()}),/cancelled/);
  assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);
});
test('malformed device grants are rejected without a token exchange',async()=>{
  const f=setup({route:url=>url.endsWith('/deviceauth/token')?{authorization_code:'private'}:undefined});
  await assert.rejects(f.translator.login({onCode:()=>{}}),/invalid authorization/);
  assert.equal(f.calls.length,2);assert.equal(f.saved,null);
});
test('expired token refreshes automatically and saves rotated refresh token',async()=>{
  const f=setup({signedIn:true,expired:true});assert.equal(await f.translator.translate(translation),'한국어 번역');
  assert.equal(f.calls[0].payload.grant_type,'refresh_token');assert.equal(f.calls[0].payload.refresh_token,'refresh-secret');
  assert.equal(f.saved.refreshToken,'rotated-secret');assert.equal(f.writes.length,1);
});
test('parallel translations share a single token refresh',async()=>{
  const f=setup({signedIn:true,expired:true});
  await Promise.all([f.translator.translate(translation),f.translator.translate(translation)]);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/token')).length,1);
});
test('401 refreshes and retries once',async()=>{
  let translations=0;const f=setup({signedIn:true,route:url=>{if(url.endsWith('/responses')&&++translations===1)throw {status:401};}});
  assert.equal(await f.translator.translate(translation),'한국어 번역');assert.equal(translations,2);assert.equal(f.writes.length,1);
});
test('repeated 401 stops and server errors never expose credentials',async()=>{
  const f=setup({signedIn:true,route:(url,options)=>{if(url.endsWith('/responses'))throw {status:401,message:JSON.stringify(options)};}});
  await assert.rejects(f.translator.translate(translation),error=>{assert.match(error.message,/HTTP 401/);assert.ok(!error.message.includes('header.'));return true;});
  assert.equal(f.calls.length,3);
});
test('refresh failure preserves stored login and returns a sanitized error',async()=>{
  const f=setup({signedIn:true,expired:true,route:url=>{if(url.endsWith('/oauth/token'))throw {status:400,message:'refresh-secret'};}});
  await assert.rejects(f.translator.translate(translation),error=>{assert.match(error.message,/token refresh failed/);assert.ok(!error.message.includes('refresh-secret'));return true;});
  assert.equal(f.writes.length,0);assert.equal(f.saved.refreshToken,'refresh-secret');
});
test('logout during refresh cannot restore credentials',async()=>{
  let release,started;const ready=new Promise(r=>started=r);
  const f=setup({signedIn:true,expired:true,route:async(url,options,{tokens})=>{
    if(url.endsWith('/oauth/token')) { started();await new Promise(r=>release=r);return tokens(); }
  }});
  const operation=f.translator.translate(translation);const rejection=assert.rejects(operation,/cancelled/);
  await ready;await f.translator.logout();release();await rejection;
  assert.equal(f.saved,null);assert.equal(f.writes.length,0);
});
test('logout removes only the connector credential and supports a new login',async()=>{
  const f=setup({signedIn:true});await f.translator.logout();assert.equal((await f.translator.status()).signedIn,false);
  await f.translator.login({onCode:()=>{}});assert.equal((await f.translator.status()).signedIn,true);
});
test('truncated and failed streams do not cache partial translation or leak server text',async()=>{
  for(const response of ['data: {"type":"response.output_text.delta","delta":"partial"}\n',
    'data: {"type":"error","message":"access-token-secret"}\n']) {
    const f=setup({signedIn:true,route:url=>url.endsWith('/responses')?response:undefined});
    await assert.rejects(f.translator.translate(translation),error=>!error.message.includes('access-token-secret'));
  }
});
