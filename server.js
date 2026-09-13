import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const sources = JSON.parse(await readFile(join(root, 'data/sources.json'), 'utf8'));

const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const json = (res, code, body) => { res.writeHead(code, {'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return json(res, 200, {ok:true, service:'va-warrant-watch'});
    if (url.pathname === '/api/sources') return json(res, 200, {sources});
    if (url.pathname === '/api/search') {
      const name = (url.searchParams.get('name') || '').trim();
      const city = (url.searchParams.get('city') || '').trim();
      return json(res, 200, {query:{name,city}, results:[], message:'No person is labeled as having an active warrant unless an enabled official-source adapter provides current, affirmative warrant status.', sources});
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
server.listen(port, '0.0.0.0', () => console.log(`VA Warrant Watch listening on ${port}`));
