'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { ROOT } = require('./load');

const HTML = ['index.html', 'room-check.html', 'compare.html'];
const pages = JSON.parse(execFileSync('python3', ['-B', '-c',
  'import json, serve; print(json.dumps({"pages": serve.PAGES, "types": serve.CONTENT_TYPES}))'], { cwd: ROOT }));

// Local files a page refers to: stylesheets and scripts, not the links between tabs
const assets = html => [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map(m => m[1]);

test('every asset of every page is on the whitelist and exists', () => {
  for (const name of HTML) {
    const list = assets(fs.readFileSync(path.join(ROOT, name), 'utf8'));
    assert.ok(list.length >= 7, `${name} lists its assets`);
    for (const a of list) {
      assert.equal(pages.pages[`/${a}`], a, `${a} from ${name} is served`);
      assert.ok(fs.existsSync(path.join(ROOT, a)), `${a} exists`);
    }
  }
});

test('every whitelisted file exists and has a content type', () => {
  for (const file of Object.values(pages.pages)) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    assert.ok(pages.types[path.extname(file)], `content type for ${file}`);
  }
});

test('pages stay file:// compatible: classic scripts, nothing fetched at load', () => {
  for (const name of HTML) {
    const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
    assert.doesNotMatch(html, /type="module"/);
    assert.doesNotMatch(html, /<iframe/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script');
    assert.doesNotMatch(html, /<style/, 'no inline stylesheet');
  }
});

test('only platform.js touches browser storage, fetch or the print dialog', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(n => n !== 'platform.js')) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    assert.doesNotMatch(src, /\blocalStorage\b|\bfetch\(|window\.print|location\.protocol/, f);
  }
});

test('geometry and analysis do not reach for global state', () => {
  for (const f of ['geometry.js', 'analyze.js', 'render.js', 'print.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    assert.doesNotMatch(src, /\bROOM\b|\bDEFAULT_ITEMS\b|\bPRESETS\b|\bstate\.items\b/, f);
  }
});

const freePort = () => new Promise(resolve => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

// Runs on a copy without data/: a test must never touch the real data folder
test('serve.py', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-serve-'));
  for (const f of [...HTML, 'serve.py', 'favicon.svg']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  for (const d of ['css', 'demo', 'js']) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  const port = await freePort();
  const server = spawn('python3', ['-B', 'serve.py', String(port)], { cwd: dir, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  t.after(() => { server.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/api/info`); break; } catch (e) {
      if (i > 50) throw e;
      await new Promise(r => setTimeout(r, 100));
    }
  }

  await t.test('identifies itself', async () => {
    const res = await fetch(`${base}/api/info`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).server, 'room-blueprint');
  });
  await t.test('serves all whitelisted files with the right type', async () => {
    for (const [url, file] of Object.entries(pages.pages)) {
      const res = await fetch(base + url);
      assert.equal(res.status, 200, url);
      assert.equal(res.headers.get('content-type'), `${pages.types[path.extname(file)]}; charset=utf-8`, url);
      await res.arrayBuffer();
    }
  });
  await t.test('refuses everything else', async () => {
    for (const url of ['/serve.py', '/data/variants.json', '/.git/config', '/js/', '/tests/load.js', '/../serve.py']) {
      const res = await fetch(base + url);
      assert.equal(res.status, 404, url);
      await res.arrayBuffer();
    }
  });
  const put = (body, headers = {}) => fetch(`${base}/api/projects`, { method: 'PUT', headers, body: JSON.stringify(body) });
  const project = (id, over = {}) => ({ id, name: id, room: {}, furniture: [], layouts: [], ...over });
  const version = async () => (await fetch(`${base}/api/projects`)).headers.get('etag');
  const statusOf = async res => { await res.arrayBuffer(); return res.status; };

  await t.test('marks its pages, so that a page can tell it from a static host', async () => {
    for (const name of HTML) {
      assert.match(await (await fetch(`${base}/${name}`)).text(), /<head>\s*<meta name="room-blueprint-server" content="1">/, name);
      assert.doesNotMatch(fs.readFileSync(path.join(ROOT, name), 'utf8'), /room-blueprint-server/, 'only the server adds it');
    }
  });
  await t.test('answers 404 when a listed file is missing, and stays up', async () => {
    fs.renameSync(path.join(dir, 'favicon.svg'), path.join(dir, 'favicon.away'));
    const res = await fetch(`${base}/favicon.svg`);
    assert.equal(await statusOf(res), 404);
    fs.renameSync(path.join(dir, 'favicon.away'), path.join(dir, 'favicon.svg'));
    assert.equal(await statusOf(await fetch(`${base}/favicon.svg`)), 200);
  });
  await t.test('the projects store starts empty and round-trips', async () => {
    const first = await version();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), {});
    const body = { a: project('a'), gone: { id: 'gone', deletedAt: 5 } };
    const res = await put(body, { 'If-Match': first });
    assert.equal(await statusOf(res), 200);
    assert.equal(res.headers.get('etag'), await version());
    assert.notEqual(await version(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), body);
    assert.ok(fs.existsSync(path.join(dir, 'data/projects.json')));
  });
  await t.test('a write that did not see the latest version is refused and changes nothing', async () => {
    const before = await version();
    assert.equal(await statusOf(await put({ b: project('b') }, { 'If-Match': '"old"' })), 412);
    assert.equal(await statusOf(await put({ b: project('b') })), 428);
    assert.equal(await version(), before);
  });
  await t.test('of many writes at once on one version exactly one gets through, and no connection breaks', async () => {
    const base0 = await version();
    const all = await Promise.all(Array.from({ length: 12 }, (_, i) => put({ [`r${i}`]: project(`r${i}`) }, { 'If-Match': base0 }).then(statusOf)));
    assert.equal(all.filter(s => s === 200).length, 1);
    assert.equal(all.filter(s => s === 412).length, 11);
  });
  await t.test('refuses what is no project store', async () => {
    const at = async () => ({ 'If-Match': await version() });
    for (const bad of [[], 'x', { a: 1 }, { a: { id: 'b', name: 'b', room: {}, furniture: [], layouts: [] } }, { a: { id: 'a' } },
      { a: { id: 'a', deletedAt: 'soon' } }, { a: project('a', { furniture: 3 }) }, { a: project('a', { name: 3 }) }])
      assert.equal(await statusOf(await put(bad, await at())), 400, JSON.stringify(bad));
    const raw = async (body, headers) => statusOf(await fetch(`${base}/api/projects`, { method: 'PUT', body, headers }));
    assert.equal(await raw('{oops', await at()), 400);
    assert.equal(await raw('['.repeat(200000), await at()), 400, 'nesting too deep to parse');
  });
  await t.test('refuses what it could store but no client could read back, and leaves the store alone', async () => {
    const stored = () => fs.readFileSync(path.join(dir, 'data/projects.json'));
    const before = stored();
    const raw = async body => statusOf(await fetch(`${base}/api/projects`, { method: 'PUT', body, headers: { 'If-Match': await version() } }));
    const shell = '"id":"x","room":{},"furniture":[],"layouts":[]';
    for (const [why, body] of [
      ['a number too large', '{"x":{"id":"x","deletedAt":1e999}}'],
      ['a number too large in a project', `{"x":{${shell},"name":"n","updatedAt":-1e999}}`],
      ['NaN', '{"x":{"id":"x","deletedAt":NaN}}'],
      ['Infinity', '{"x":{"id":"x","deletedAt":Infinity}}'],
      ['a lone surrogate', `{"x":{${shell},"name":"\\ud800"}}`],
    ]) {
      assert.equal(await raw(body), 400, why);
      assert.ok(stored().equals(before), `${why}: the store is byte-identical`);
    }
    assert.equal(await statusOf(await fetch(`${base}/api/projects`)), 200, 'still served');
    assert.deepEqual(fs.readdirSync(path.join(dir, 'data')).filter(f => f.endsWith('.tmp')), []);
  });
  await t.test('a size it cannot accept gets an answer', async () => {
    const reply = length => new Promise((resolve, reject) => {
      let got = '';
      net.connect(port, '127.0.0.1', function () { this.write(`PUT /api/projects HTTP/1.0\r\nContent-Length: ${length}\r\n\r\n`); })
        .on('data', d => { got += d; }).on('end', () => resolve(got)).on('error', reject);
    });
    assert.match(await reply('abc'), /^HTTP\/1\.\d 400/);
    assert.match(await reply(8 * 1024 * 1024 + 1), /^HTTP\/1\.\d 413/);
  });
  await t.test('the optional local project file is served only when it exists, and nothing else of its folder', async () => {
    assert.equal(await statusOf(await fetch(`${base}/local/projects.js`)), 404, 'missing');
    fs.mkdirSync(path.join(dir, 'local'));
    fs.writeFileSync(path.join(dir, 'local/projects.js'), 'globalThis.ROOM_BLUEPRINT_LOCAL = { projects: [] };\n');
    fs.writeFileSync(path.join(dir, 'local/other.json'), '{}');
    const res = await fetch(`${base}/local/projects.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(await res.text(), /ROOM_BLUEPRINT_LOCAL/);
    for (const url of ['/local/other.json', '/local/', '/local'])
      assert.equal(await statusOf(await fetch(base + url)), 404, url);
    fs.rmSync(path.join(dir, 'local'), { recursive: true });
  });
  await t.test('the old variants API is gone, and a file left in data/ stays untouched', async () => {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data/variants.json'), '{"old":1}');
    assert.equal(await statusOf(await fetch(`${base}/api/variants`)), 404);
    assert.equal(await statusOf(await fetch(`${base}/api/variants`, { method: 'PUT', body: '{}' })), 404);
    assert.equal(fs.readFileSync(path.join(dir, 'data/variants.json'), 'utf8'), '{"old":1}');
  });
});

test('the local project file goes to this computer only, also when the server is open to the network', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-local-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'serve.py'), path.join(dir, 'serve.py'));
    fs.mkdirSync(path.join(dir, 'local'));
    fs.writeFileSync(path.join(dir, 'local/projects.js'), '// local\n');
    const status = client => execFileSync('python3', ['-B', '-c', `
import serve
h = object.__new__(serve.Handler)
h.path, h.client_address, got = "/local/projects.js", (${JSON.stringify(client)}, 1), []
h.send = lambda code, *a, **k: got.append(code)
h.send_error = lambda code, *a: got.append(code)
h.do_GET()
print(got[0])`], { cwd: dir, encoding: 'utf8' }).trim();
    assert.equal(status('127.0.0.1'), '200');
    assert.equal(status('::1'), '200');
    assert.equal(status('192.168.1.20'), '404');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('serve.py listens on this computer unless told otherwise, and takes a data folder', () => {
  const run = (...args) => JSON.parse(execFileSync('python3', ['-B', '-c',
    `import json, sys, serve; o = serve.options(sys.argv[1:]); print(json.dumps({"port": o.port, "host": o.host, "data": str(o.data)}))`, ...args], { cwd: ROOT }));
  assert.deepEqual(run(), { port: 8080, host: '127.0.0.1', data: path.join(ROOT, 'data') });
  assert.deepEqual(run('9000', '--host', '0.0.0.0', '--data', '/x'), { port: 9000, host: '0.0.0.0', data: '/x' });
});

test('--data keeps the projects in that folder and away from the default one', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'room-data-'));
  fs.copyFileSync(path.join(ROOT, 'serve.py'), path.join(dir, 'serve.py'));
  const data = path.join(dir, 'elsewhere/deep'), port = await freePort();
  const server = spawn('python3', ['-B', 'serve.py', String(port), '--data', data], { cwd: dir, stdio: 'ignore' });
  t.after(() => { server.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}/api/projects`;
  for (let i = 0; ; i++) {
    try { await fetch(base); break; } catch (e) {
      if (i > 50) throw e;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  const rev = (await fetch(base)).headers.get('etag');
  assert.equal((await fetch(base, { method: 'PUT', headers: { 'If-Match': rev }, body: '{}' })).status, 200);
  assert.ok(fs.existsSync(path.join(data, 'projects.json')));
  assert.equal(fs.existsSync(path.join(dir, 'data')), false);
});
