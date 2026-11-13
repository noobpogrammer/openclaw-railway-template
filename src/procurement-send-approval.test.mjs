import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime(reply) {
 const hooks={}; const requests=[];
 const Type=new Proxy({}, {get:()=>()=>({})});
 const scope={Type,defineToolPlugin:()=>({register(){}}),process:{env:{PROCUREMENT_API_BASE_URL:'http://backend',PROCUREMENT_API_KEY:'test',OPENCLAW_TOOL_API_KEY:'test',MUAI_API_BASE_URL:'http://backend',MUAI_OPENCLAW_KEY:'test',MUAI_CLIENT_ID:'tenant',PROCUREMENT_CLIENT_ID:'tenant'}},Map,Set,Date,JSON,console,
 fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,text:async()=>JSON.stringify(await reply(url))};}};
 let source=fs.readFileSync(new URL('../plugins/procurement-tools/dist/index.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export default plugin;','globalThis.plugin=plugin;');
 vm.runInNewContext(source,scope);
 scope.plugin.register({registerTool:()=>{},on:(name,fn)=>hooks[name]=fn,logger:{warn(){},error(){},info(){}}});
 return {hooks,requests};
}
const context={channelId:'whatsapp',sessionKey:'agent:main:whatsapp:direct:971500000000'};
test('unapproved supplier reply is blocked at final delivery',async()=>{
 const {hooks}=runtime(()=>({authorized:false}));
 const result=await hooks.message_sending({to:'971500000000',content:'Confirmed at AED 11'},context);
 assert.equal(result.cancel,true);
});
test('exact approved message passes and prefix is normalized',async()=>{
 const {hooks,requests}=runtime(url=>url.includes('claim-commercial')?{authorized:true}:{bound:false});
 const result=await hooks.message_sending({to:'971500000000',content:'[Procurment Agent] Could you do AED 11?'},context);
 assert.equal(result,undefined);
 assert.equal(requests[0].body.message,'Could you do AED 11?');
});
test('persisted system invitation remains independent of agent approval',async()=>{
 const {hooks}=runtime(url=>url.includes('authorize-system')?{authorized:true}:{authorized:false});
 assert.equal(await hooks.message_sending({to:'971500000000',content:'Quotation request for 10 units'},context),undefined);
});
test('approval outage fails closed',async()=>{
 const {hooks}=runtime(()=>{throw new Error('offline');});
 assert.equal((await hooks.message_sending({to:'971500000000',content:'Confirmed AED 11'},context)).cancel,true);
});

test('missing session metadata cannot bypass approval with an implicit acceptance',async()=>{
 const {hooks}=runtime(()=>({authorized:false}));
 assert.equal((await hooks.message_sending({to:'971500000000',content:'Sure, agreed.'},{channelId:'whatsapp'})).cancel,true);
});
