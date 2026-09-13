import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveWarrantPdfUrl,parseWarrantedOffenderNames} from './adapters/portsmouth.js';

test('source registry enables only verified adapters',async()=>{
  const sources=JSON.parse(await readFile(new URL('./data/sources.json',import.meta.url),'utf8'));
  assert.ok(sources.length>=2);
  for(const s of sources) assert.match(s.source_url,/^https:\/\//);
  const portsmouth=sources.find(s=>s.jurisdiction==='Portsmouth, VA');
  const chesapeake=sources.find(s=>s.jurisdiction==='Chesapeake, VA');
  assert.equal(portsmouth.adapter_enabled,true);
  assert.equal(chesapeake.adapter_enabled,false);
});

test('Portsmouth resolver accepts only the official CivicPlus PDF host',()=>{
  const html='<a href="https://content.civicplus.com/api/assets/example">Probation &amp; Parole Warranted Offenders (PDF)</a>';
  assert.equal(resolveWarrantPdfUrl(html),'https://content.civicplus.com/api/assets/example');
  assert.throws(()=>resolveWarrantPdfUrl('<a href="https://example.com/file.pdf">Probation &amp; Parole Warranted Offenders (PDF)</a>'),/unapproved host/);
});

test('Portsmouth parser extracts names only from expected official headings',()=>{
  const text='Portsmouth\nProbation\nand Parole\nWarranted\nOffender\nThomas Scott Allen Jr.\nPortsmouth\nProbation and Parole\nWarranted\nOffender\nShaun Antonio Baker';
  assert.deepEqual(parseWarrantedOffenderNames(text),['Thomas Scott Allen Jr.','Shaun Antonio Baker']);
  assert.throws(()=>parseWarrantedOffenderNames('random court case text'),/expected Portsmouth warrant heading/);
});
