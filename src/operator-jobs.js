import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Persist before acknowledging. Per-job exclusive locks prevent duplicate
// execution even when HTTP retries or rolling containers overlap on /data.
export class OperatorJobs {
  constructor(root, execute, { now = Date.now } = {}) {
    this.root = root; this.execute = execute; this.now = now; this.busy = false;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }
  file(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid job ID');
    return path.join(this.root, id+'.json');
  }
  read(id) { return JSON.parse(fs.readFileSync(this.file(id), 'utf8')); }
  write(job) {
    const tmp=this.file(job.id)+'.'+crypto.randomUUID()+'.tmp';
    fs.writeFileSync(tmp, JSON.stringify(job), {mode:0o600});
    fs.renameSync(tmp,this.file(job.id));
  }
  receipt(job) { return {ok:true,job_id:job.id,status:job.status,...(job.error?{error:job.error}:{})}; }
  enqueue(id, payload) {
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    try {
      const tmp=this.file(id)+'.'+crypto.randomUUID()+'.tmp';
      try {
        const fd=fs.openSync(tmp,'wx',0o600);
        try { fs.writeFileSync(fd,JSON.stringify({id,payload,fingerprint,status:'queued',createdAt:this.now()}));fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        fs.linkSync(tmp,this.file(id));
      } finally { try { fs.unlinkSync(tmp); } catch {} }
    } catch(err) { if(err.code!=='EEXIST') throw err; }
    const job=this.read(id);
    if(job.fingerprint!==fingerprint) throw new Error('Job ID already belongs to a different instruction');
    return this.receipt(job);
  }
  status(id) {
    const job=this.read(id);
    // A crash or timeout is an uncertain outcome, never permission to resend.
    const strandedClaim = job.status==='queued' && fs.existsSync(this.file(id)+'.lock') && this.now()-fs.statSync(this.file(id)+'.lock').mtimeMs>15*60*1000;
    if(strandedClaim || (job.status==='running' && this.now()-job.startedAt>15*60*1000)) {
      job.status='unknown';job.error='Processing outcome is uncertain. Review the conversation before taking further action.';this.write(job);
    }
    return this.receipt(job);
  }
  async pump() {
    if(this.busy)return;
    this.busy=true;
    try {
      for(const file of fs.readdirSync(this.root).filter(x=>x.endsWith('.json'))) {
        const id=file.slice(0,-5);
        let job=this.read(id);
        if(job.status!=='queued')continue;
        try { fs.closeSync(fs.openSync(this.file(id)+'.lock','wx',0o600)); }
        catch(err){if(err.code==='EEXIST')continue;throw err;}
        job.status='running';job.startedAt=this.now();this.write(job);
        try {
          await this.execute(job.payload);
          job.status='completed';job.finishedAt=this.now();
        } catch {
          job.status='unknown';job.error='Agent processing could not be confirmed. Review the conversation before retrying.';
        }
        this.write(job);
      }
    } finally { this.busy=false; }
  }
}
