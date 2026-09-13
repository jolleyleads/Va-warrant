import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPortsmouthWarrants } from './adapters/portsmouth.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const sources = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));

const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const json = (res, code, body) => { res.writeHead(code, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
const normalized = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function searchOfficialSources(name, city) {
  const wantedName = normalized(name);
  const wantedCity = normalized(city);
  const results = [];
  const sourceStatus = [];

  if (!wantedCity || wantedCity.includes('portsmouth')) {
    try {
      const feed = await fetchPortsmouthWarrants();
      const matches = feed.records.filter(record => !wantedName || normalized(record.full_name).includes(wantedName));
      results.push(...matches);
      sourceStatus.push({jurisdiction:'Portsmouth, VA',status:'checked',checked_at:feed.retrieved_at,source_url:feed.source_url});
    } catch (error) {
      console.error('Portsmouth adapter unavailable:', error.message);
      sourceStatus.push({jurisdiction:'Portsmouth, VA',status:'SOURCE_UNAVAILABLE',message:error.message});
    }
  }

  if (!wantedCity || wantedCity.includes('chesapeake')) {
    sourceStatus.push({
      jurisdiction:'Chesapeake, VA',
      status:'CONTACT_REQUIRED',
      message:'No current official public name-level warrant feed is enabled. Chesapeake directs outstanding-warrant inquiries to its Warrant Unit.'
    });
  }

  return {results, sourceStatus};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return json(res, 200, {ok:true, service:'va-warrant-watch'});
    if (url.pathname === '/api/sources') return json(res, 200, {sources});
    if (url.pathname === '/api/search') {
      const name = (url.searchParams.get('name') || '').trim();
      const city = (url.searchParams.get('city') || '').trim();
      if (name.length > 120 || city.length > 80) return json(res, 400, {error:'Search input is too long.'});
      const {results, sourceStatus} = await searchOfficialSources(name, city);
      return json(res, 200, {
        query:{name,city},
        results,
        source_status:sourceStatus,
        message: results.length
          ? 'Results shown below were returned from an official source that explicitly identifies these people as warranted offenders.'
          : 'No verified match was returned by the official sources successfully checked. This does not prove that a person has no warrant.'
      });
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    path = normalize(path).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, 'public', path);
    if (!file.startsWith(join(root, 'public'))) return json(res, 403, {error:'Forbidden'});
    const data = await readFile(file);
    res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch (err) {
    if (err?.code === 'ENOENT') return json(res, 404, {error:'Not found'});
    console.error(err); json(res, 500, {error:'Internal server error'});
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`VA Warrant Watch listening on ${port}`);
  fetchPortsmouthWarrants()
    .then(feed => console.log(`Portsmouth live-source preflight OK: ${feed.records.length} verified record(s); source=${feed.source_url}`))
    .catch(error => console.error(`Portsmouth live-source preflight FAILED: ${error.message}`));
});
