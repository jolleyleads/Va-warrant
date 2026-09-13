import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPortsmouthWarrants } from './adapters/portsmouth.js';
import { fetchNewportNewsWarrants } from './adapters/newport-news.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const sources = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const json=(res,code,body)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const normalized=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');

async function runFeed(fetcher,jurisdiction,name,results,sourceStatus){
  try{
    const feed=await fetcher();
    const q=normalized(name);
    results.push(...feed.records.filter(r=>!q||normalized(r.full_name).includes(q)));
    sourceStatus.push({jurisdiction,status:'checked',checked_at:feed.retrieved_at,source_url:feed.source_url});
  }catch(error){
    console.error(`${jurisdiction} adapter unavailable:`,error.message);
    sourceStatus.push({jurisdiction,status:'SOURCE_UNAVAILABLE',message:error.message});
  }
}

async function searchOfficialSources(name,city){
  const wantedCity=normalized(city); const results=[]; const sourceStatus=[];
  if(!wantedCity||wantedCity.includes('portsmouth')) await runFeed(fetchPortsmouthWarrants,'Portsmouth, VA',name,results,sourceStatus);
  if(!wantedCity||wantedCity.includes('newport news')) await runFeed(fetchNewportNewsWarrants,'Newport News, VA',name,results,sourceStatus);
  for(const s of sources.filter(s=>!s.adapter_enabled)){
    if(!wantedCity||normalized(s.jurisdiction).includes(wantedCity)||wantedCity.includes(normalized(s.jurisdiction).replace(', va',''))){
      sourceStatus.push({jurisdiction:s.jurisdiction,status:s.status.toUpperCase().replace(/-/g,'_'),message:s.note,source_url:s.source_url});
    }
  }
  return {results,sourceStatus};
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'va-warrant-watch'});
    if(url.pathname==='/api/sources') return json(res,200,{sources});
    if(url.pathname==='/api/search'){
      const name=(url.searchParams.get('name')||'').trim(); const city=(url.searchParams.get('city')||'').trim();
      if(name.length>120||city.length>80) return json(res,400,{error:'Search input is too long.'});
      const {results,sourceStatus}=await searchOfficialSources(name,city);
      return json(res,200,{query:{name,city},results,source_status:sourceStatus,message:results.length?'Results shown below were returned from official sources that explicitly identify these people as wanted or having active warrants.':'No verified match was returned by the official sources successfully checked. This does not prove that a person has no warrant.'});
    }
    let path=url.pathname==='/'?'/index.html':url.pathname; path=normalize(path).replace(/^(\.\.[/\\])+/,'');
    const file=join(root,'public',path); if(!file.startsWith(join(root,'public'))) return json(res,403,{error:'Forbidden'});
    const data=await readFile(file); res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'}); res.end(data);
  }catch(err){if(err?.code==='ENOENT') return json(res,404,{error:'Not found'}); console.error(err); json(res,500,{error:'Internal server error'});}
});

server.listen(port,'0.0.0.0',()=>{
  console.log(`VA Warrant Watch listening on ${port}`);
  Promise.allSettled([fetchPortsmouthWarrants(),fetchNewportNewsWarrants()]).then(results=>results.forEach((r,i)=>console.log(i===0?`Portsmouth preflight ${r.status}`:`Newport News preflight ${r.status}`)));
});
