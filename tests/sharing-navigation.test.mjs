import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const js=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('styles.css','utf8');
const sw=readFileSync('sw.js','utf8');

test('indicatore cliccabile accanto al profilo',()=>{
  const pos=html.indexOf('id="top-sharing"');
  const avatar=html.indexOf('id="avatar"');
  assert.ok(pos>0 && avatar>pos);
  const segment=html.slice(pos-120,avatar);
  assert.match(segment,/data-action="nav"/);
  assert.match(segment,/data-page="sharing"/);
  assert.match(segment,/id="top-sharing-count"/);
  assert.match(segment,/>Condivisi</);
});
test('il numero condivisi rappresenta solo gli accessi remoti (non le persone locali)',()=>{
  assert.ok(js.includes("connected:typeof cloudMode==='undefined'||!cloudMode?0:"));
  assert.ok(js.includes("el('top-sharing-count').textContent=shared===null?'–':String(shared)"));
  assert.ok(js.includes("shared+' accessi condivisi'"));
  assert.ok(js.includes('function renderSharing(){'));
});
test('navigazione mobile comprende Condivisioni e Famiglia',()=>{
  assert.ok(js.includes("'rooms','people','sharing','settings'"));
  assert.ok(js.includes("key==='sharing'?'Condivisi':label"));
  assert.ok(js.includes("case'sharing':html=renderSharing();break"));
  assert.ok(js.includes("['sharing','Condivisioni','users']"));
});
test('non rompe dati, backup e cache offline',()=>{
  assert.match(js,/const VERSION = '1\.4\.0-beta'/);
  assert.match(js,/const STORAGE_KEY = 'casafacile\.v1\.database'/);
  assert.match(js,/schemaVersion:1/);
  assert.match(html,/app\.js\?v=1\.4\.0-beta/);
  assert.match(html,/styles\.css\?v=1\.4\.0-beta/);
  assert.match(sw,/casafacile-static-1\.4\.0-beta/);
  assert.match(css,/\.top-sharing\{/);
});
