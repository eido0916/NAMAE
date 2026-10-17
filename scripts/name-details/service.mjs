import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { openDetails, root, normalize, transaction } from './db.mjs';
import { readNameDetails } from '../export-name-details.mjs';

const defaults=JSON.parse(readFileSync(resolve(root,'src/data/countries.json'),'utf8'));
const terminal=new Set(['complete','missing','pending']);
const defaultAgent='NAMAE/1.0 (https://github.com/eido0916/NAMED; contact: repository issues)';

export function runCollection(request,{database,agent}) {
  return new Promise((resolveRun,reject)=>{
    const child=spawn(process.execPath,[resolve(root,'scripts/collect-name-details.mjs'),'--countries',request.country,'--type',request.type,'--name',request.name,'--quiet-report','--refresh-job'],{
      cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,NAMAE_DETAILS_DB:database,WIKIDATA_USER_AGENT:agent},
    });
    let error='';
    child.stderr.on('data',part=>{error=(error+part.toString()).slice(-2000);});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolveRun():reject(Error(`Collection failed (${code}): ${error}`)));
    const timer=setTimeout(()=>{child.kill();reject(Error('Collection timed out'));},240000);
    timer.unref();
    child.on('close',()=>clearTimeout(timer));
  });
}

// One serial queue for all countries; deduplication spans concurrent browsers.
// Only a name already in the app's ranking/reference data can trigger collection.
export function createDetailService({database=process.env.NAMAE_DETAILS_DB || resolve(root,'data/name-details.sqlite'),rankingPath=resolve(root,'data/namae.sqlite'),countries=defaults,runner=runCollection,agent=process.env.WIKIDATA_USER_AGENT || defaultAgent,now=()=>Date.now(),maxQueue=24,refreshDays=30,pause=ms=>ms>0?new Promise(resolvePause=>setTimeout(resolvePause,ms)):Promise.resolve()}={}) {
  const db=openDetails(database);
  const available=new Set(countries.filter(c=>c.enabled && c.code!=='JP').map(c=>c.code));
  const queue=new Map();
  const failures=new Map();
  let running=false,closed=false,lastFinished=-Infinity;
  async function drain() {
    if (running || closed) return;
    running=true;
    try {
      while (!closed && queue.size) {
        const [key,task]=queue.entries().next().value;
        task.state='running';
        try {await pause(Math.max(0,1200-(now()-lastFinished)));await runner(task.request,{database,agent});failures.delete(key);}
        catch {failures.set(key,now());if(failures.size>256) failures.delete(failures.keys().next().value);}
        lastFinished=now();
        queue.delete(key);
      }
    } finally {running=false;}
  }
  function lookup(input) {
    if (!input || typeof input!=='object' || !available.has(input.country) || !['given_name','surname'].includes(input.type) || typeof input.name!=='string' || !input.name.trim() || input.name.length>160 || /[\p{C}]/u.test(input.name)) return {status:400,body:{error:'Invalid converted name'}};
    const request={country:input.country,type:input.type,name:input.name.trim()};
    const normalized=normalize(request.name);
    const key=JSON.stringify([request.country,request.type,normalized]);
    const data=readNameDetails(db,request.country,request.type,request.name);
    const job=db.prepare('SELECT j.state,j.updated_at,j.evidence_json FROM collection_jobs j JOIN names n ON n.id=j.name_id WHERE n.country=? AND n.type=? AND n.normalized=? ORDER BY j.updated_at DESC LIMIT 1').get(request.country,request.type,normalized);
    const fresh=job && Date.parse(job.updated_at)>now()-refreshDays*86400000;
    if (fresh && terminal.has(job.state) && JSON.parse(job.evidence_json || '{}').identityVersion>=3) return {status:200,body:{...data,lookup:{state:job.state}}};
    if (data.people.length>=3 && !job) return {status:200,body:{...data,lookup:{state:'complete'}}};
    if (queue.has(key)) return {status:202,body:{...data,lookup:{state:queue.get(key).state,retryAfter:3}}};
    if (job?.state==='error' && Date.parse(job.updated_at)>now()-300000) return {status:200,body:{...data,lookup:{state:'error'}}};
    if (failures.has(key) && now()-failures.get(key)<300000) return {status:200,body:{...data,lookup:{state:'error'}}};
    // Short-lived handle: the existing data build replaces this SQLite file on Windows.
    const ranking=new DatabaseSync(rankingPath,{readOnly:true});
    let reference;
    try {
      const ranked=ranking.prepare('SELECT name FROM ranking_entries WHERE country=? AND type=? AND name=? COLLATE NOCASE LIMIT 1').get(request.country,request.type,request.name);
      reference=ranked ?? ranking.prepare('SELECT name FROM reference_entries WHERE country=? AND type=? AND name=? COLLATE NOCASE LIMIT 1').get(request.country,request.type,request.name);
    } finally {ranking.close();}
    if (!reference) return {status:400,body:{error:'Name is not in the conversion data'}};
    request.name=reference.name;
    if (queue.size>=maxQueue) return {status:503,body:{...data,lookup:{state:'busy',retryAfter:10}}};
    transaction(db,()=>{
      const existing=db.prepare('SELECT id FROM names WHERE country=? AND type=? AND normalized=? ORDER BY id LIMIT 1').get(request.country,request.type,normalized);
      let id=existing?.id;
      if(!id) id=db.prepare('INSERT INTO names(country,type,name,normalized,language) VALUES (?,?,?,?,?)').run(request.country,request.type,request.name,normalized,({US:'en',GB:'en',FR:'fr',DE:'de',KR:'ko'})[request.country] ?? 'und').lastInsertRowid;
      db.prepare("INSERT INTO collection_jobs(name_id,state,updated_at,evidence_json) VALUES (?,'queued',?,?) ON CONFLICT(name_id) DO UPDATE SET state='queued',updated_at=excluded.updated_at").run(id,new Date(now()).toISOString(),JSON.stringify({onDemand:true}));
    });
    queue.set(key,{request,state:'queued'});
    void drain();
    return {status:202,body:{...data,lookup:{state:queue.get(key)?.state ?? 'queued',retryAfter:3}}};
  }
  return {lookup,close(){if(running) throw Error('Cannot close during collection');closed=true;db.close();}};
}

export async function handleDetailRequest(request,response,service) {
  const send=(status,body)=>response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));
  if (request.method!=='POST') {send(405,{error:'POST required'});return;}
  // Same-origin JSON prevents other sites from triggering a collection with forms.
  if (request.headers['sec-fetch-site']==='cross-site' || !request.headers['content-type']?.startsWith('application/json')) {send(403,{error:'Same-origin JSON required'});return;}
  const chunks=[];
  let size=0;
  try {
    for await (const chunk of request) {size+=chunk.length;if(size>1024) {send(413,{error:'Request too large'});return;}chunks.push(chunk);}
    const result=service.lookup(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    send(result.status,result.body);
  } catch {send(400,{error:'Invalid detail request'});}
}
