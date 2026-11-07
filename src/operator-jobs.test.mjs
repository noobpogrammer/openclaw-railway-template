import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OperatorJobs } from './operator-jobs.js';
const ID='11111111-1111-4111-8111-111111111111';
function root(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'operator-jobs-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}

test('acknowledges durably before execution and duplicate submissions run once',async t=>{
  let calls=0;let release;const done=new Promise(r=>release=r);
  const jobs=new OperatorJobs(root(t),async()=>{calls++;await done;});
  assert.equal(jobs.enqueue(ID,{instruction:'Continue'}).status,'queued');
  const work=jobs.pump();
  assert.equal(jobs.status(ID).status,'running');
  assert.equal(jobs.enqueue(ID,{instruction:'Continue'}).status,'running');
  assert.equal(calls,1);
  release();await work;
  await jobs.pump();
  assert.equal(jobs.status(ID).status,'completed');assert.equal(calls,1);
});
test('queued jobs survive restart and overlapping workers cannot duplicate execution',async t=>{
 const p=root(t);let calls=0;
 new OperatorJobs(p,async()=>{}).enqueue(ID,{instruction:'Resume'});
 const a=new OperatorJobs(p,async()=>{calls++;});const b=new OperatorJobs(p,async()=>{calls++;});
 await Promise.all([a.pump(),b.pump()]);assert.equal(calls,1);assert.equal(b.status(ID).status,'completed');
});
test('ambiguous execution does not automatically resend',async t=>{
 let calls=0;const jobs=new OperatorJobs(root(t),async()=>{calls++;throw new Error('connection lost after delivery');});
 jobs.enqueue(ID,{instruction:'Resume'});await jobs.pump();
 assert.equal(jobs.status(ID).status,'unknown');await jobs.pump();assert.equal(calls,1);
});
test('reusing a key with a different payload is rejected',t=>{
 const jobs=new OperatorJobs(root(t),async()=>{});jobs.enqueue(ID,{instruction:'A'});
 assert.throws(()=>jobs.enqueue(ID,{instruction:'B'}),/different instruction/);
 assert.throws(()=>jobs.enqueue('../unsafe',{instruction:'B'}),/Invalid job ID/);
});
