import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPlugin(gate) {
  const hooks = new Map();
  const requests = [];
  let tools;
  const source = fs.readFileSync(new URL('../plugins/procurement-tools/dist/index.js', import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace('export default plugin;','globalThis.loadedPlugin = plugin;');
  const context = vm.createContext({
    Type: new Proxy({}, {get:()=> (...args)=>({args})}),
    defineToolPlugin: spec=>{tools=spec.tools(x=>x);return {register(){}};},
    process:{env:{PROCUREMENT_API_BASE_URL:'https://offline.invalid',OPENCLAW_TOOL_API_KEY:'test',PROCUREMENT_CLIENT_ID:'tenant'}},
    fetch: async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {ok:true,text:async()=>JSON.stringify(url.endsWith('/activation-gate')?gate:{recorded:true})};},
  });
  vm.runInContext(source,context);
  context.loadedPlugin.register({on:(name,fn)=>hooks.set(name,fn),logger:{info(){},warn(){},error(){}}});
  return {hooks,tools,requests};
}

const gate={supplier:{id:'supplier',name:'ABC'},has_procurement_state:true,
  engagement_decision:'ENGAGE',allow_autonomous_reply:true,automation_paused:false,
  active_rfqs:[{rfq_id:'lights',product_name:'Lights',quantity:100},{rfq_id:'fans',product_name:'Fans',quantity:50}]};

test('engaged turn receives current facts and the mapping validator', async()=>{
  const {hooks,requests}=loadPlugin(gate);
  const r=await hooks.get('before_prompt_build')({currentUserMessage:'agreed'},{channel:'whatsapp',senderId:'+971501234567',sessionKey:'s'});
  assert.ok(r.toolsAllow.includes('procurement_validate_rfq_mapping'));
  assert.ok(r.appendContext.includes(JSON.stringify(gate.active_rfqs)));
  assert.equal(requests.length,1); // no duplicate history/context model call
  const manifest=JSON.parse(fs.readFileSync(new URL('../plugins/procurement-tools/openclaw.plugin.json',import.meta.url),'utf8'));
  assert.ok(manifest.contracts.tools.includes('procurement_validate_rfq_mapping'));
});

test('database history remains opt-in for recovery',async()=>{
  const {tools,requests}=loadPlugin(gate);
  const tool=tools.find(t=>t.name==='procurement_get_supplier_context');
  await tool.execute({supplier_id:'supplier'},null,{});
  await tool.execute({supplier_id:'supplier',history_limit:5},null,{});
  assert.equal(requests[0].body.history_limit,0);
  assert.equal(requests[1].body.history_limit,5);
});

test('mixed product actions retain separate RFQs, price and availability',async()=>{
  const {tools,requests}=loadPlugin(gate);
  const quote=tools.find(t=>t.name==='procurement_record_quote');
  const unavailable=tools.find(t=>t.name==='procurement_mark_unavailable');
  await quote.execute({supplier_id:'supplier',rfq_id:'lights',variants:[{price:24,quantity:100}],raw_message:'Lights 24; fans out of stock'},null,{});
  await unavailable.execute({supplier_id:'supplier',rfq_id:'fans',reason:'Out of stock'},null,{});
  assert.equal(requests[0].body.rfq_id,'lights');
  assert.equal(requests[0].body.variants[0].price,24);
  assert.equal(requests[1].body.rfq_id,'fans');
  assert.ok(requests[1].url.endsWith('/mark-unavailable'));
});

test('denied activation still blocks direct supplier replies',async()=>{
  const {hooks}=loadPlugin({...gate,engagement_decision:'IGNORE',allow_autonomous_reply:false});
  const r=await hooks.get('before_prompt_build')({currentUserMessage:'agreed'},{channel:'whatsapp',senderId:'+971501234567',sessionKey:'s'});
  assert.equal(r.toolsAllow.length,0);
  const send=await hooks.get('message_sending')({to:'+971501234567',content:'Confirmed'},{channelId:'whatsapp',sessionKey:'agent:main:whatsapp:direct:+971501234567'});
  assert.equal(send.cancel,true);
});

test('analysis sessions remain unable to call tools',async()=>{
  const {hooks}=loadPlugin(gate);
  const r=await hooks.get('before_tool_call')({toolName:'procurement_record_quote'},{sessionKey:'agent:main:procurement-analysis:x'});
  assert.equal(r.block,true);
});
