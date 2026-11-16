import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

function runtime(t,config={channels:{whatsapp:{dmPolicy:'allowlist',allowFrom:[]}}}) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'allowlist-sync-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'config.json');fs.writeFileSync(file,JSON.stringify(config));
 let restarts=0;
 const source=fs.readFileSync(new URL('./server.js',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('function normalizeWhatsAppNumber('),source.indexOf('function requireSetupAuth('));
 const scope={fs,process,Date,JSON,Set,Promise,configPath:()=>file,ensureGatewayRunning:async()=>({ok:true}),waitForGatewayReady:async()=>true,restartGateway:async()=>{restarts++;await Promise.resolve();}};
 vm.runInNewContext(block+';globalThis.mutate=mutateWhatsAppAllowlist;',scope);
 return {scope,file,restarts:()=>restarts};
}
test('adding the same normalized number does not restart twice',async t=>{
 const r=runtime(t);
 await r.scope.mutate('add',['+971 50 000 0000']);
 await r.scope.mutate('add',['+971500000000']);
 assert.equal(r.restarts(),1);
 assert.deepEqual(JSON.parse(fs.readFileSync(r.file)).channels.whatsapp.allowFrom,['+971500000000']);
});
test('overlapping saves cannot lose supplier numbers',async t=>{
 const r=runtime(t);
 await Promise.all([r.scope.mutate('add',['+971500000001']),r.scope.mutate('add',['+971500000002'])]);
 assert.equal(JSON.parse(fs.readFileSync(r.file)).channels.whatsapp.allowFrom.length,2);
});
test('invalid config fails closed without erasing admission list',async t=>{
 const r=runtime(t);fs.writeFileSync(r.file,'invalid config');
 await assert.rejects(r.scope.mutate('add',['+971500000001']));
 assert.equal(fs.readFileSync(r.file,'utf8'),'invalid config');
 assert.equal(r.restarts(),0);
});
