import test from 'node:test';
import assert from 'node:assert/strict';
import { repairProcurementSessionRuntimes } from './procurement-session-runtime.js';
const row={key:'agent:main:whatsapp:direct:+123',sessionId:'session',modelProvider:'openai',model:'gpt-6.1-sol',agentRuntime:{id:'codex',source:'session-key'}};

test('repairs conflicting chat runtime without changing model, transcript or security policy',async()=>{
  const calls=[];
  const result=await repairProcurementSessionRuntimes(async(method,params)=>{
    calls.push({method,params});return method==='sessions.list'?{sessions:[row]}:{ok:true};
  });
  assert.equal(result.repaired,1);
  assert.deepEqual(calls[1],{method:'sessions.patch',params:{key:row.key,expectedSessionId:'session',model:'openai/gpt-6.1-sol',agentRuntime:'openclaw'}});
});

test('leaves unrelated, already repaired and locked sessions alone',async()=>{
  const rows=[{...row,key:'agent:main:webchat:x'}, {...row,modelProvider:'anthropic'}, 
    {...row,agentRuntime:{id:'openclaw',source:'model'}}, {...row,runtimeSelectionLocked:true}, {...row,sessionId:null}];
  const calls=[];
  const result=await repairProcurementSessionRuntimes(async(method,params)=>{calls.push(method);return {sessions:rows};});
  assert.deepEqual(calls,['sessions.list']);assert.equal(result.repaired,0);assert.equal(result.locked,2);
});

test('reads every page before mutations and reports rejected concurrent changes',async()=>{
  let listed=0;
  const result=await repairProcurementSessionRuntimes(async(method,params)=>{
    if(method==='sessions.list'){listed++;return {sessions:params.offset===0?Array.from({length:100},(_,i)=>({...row,key:`agent:main:webchat:${i}`})):[row]};}
    assert.equal(listed,2);throw new Error('Session replaced');
  });
  assert.equal(result.scanned,101);assert.equal(result.failed,1);assert.equal(result.repaired,0);
});
