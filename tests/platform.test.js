'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const json = (status, body) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => '"v1"' } });
// serve.py marks the pages it delivers
const marked = { querySelector: () => ({}) }, unmarked = { querySelector: () => null };
function page(protocol, fetchImpl, extra = {}) {
  const calls = [];
  const fetch = (url, opts) => { calls.push([url, opts?.method || 'GET', opts?.headers?.['If-Match']]); return fetchImpl(url, opts); };
  return { calls, ...load(['js/platform.js'], { location: { protocol }, fetch, document: marked, ...extra }) };
}

test('file:// has no server and does not even ask', async () => {
  const p = page('file:', () => { throw new Error('must not be called'); });
  assert.equal(await p.get('serverAvailable')(), false);
  assert.equal(p.calls.length, 0);
});

test('a page without the mark, as on GitHub Pages, asks nothing, so the console stays free of a 404', async () => {
  const p = page('https:', () => { throw new Error('must not be called'); }, { document: unmarked });
  assert.equal(await p.get('serverAvailable')(), false);
  assert.equal(p.calls.length, 0);
});

test('http without the api is no server, even with the mark in a copied page', async () => {
  assert.equal(await page('https:', async () => json(404))
    .get('serverAvailable')(), false);
});

test('a foreign or unparsable answer is no server', async () => {
  assert.equal(await page('http:', async () => json(200, { server: 'other' })).get('serverAvailable')(), false);
  assert.equal(await page('http:', async () => json(200, null)).get('serverAvailable')(), false);
  const broken = { ok: true, json: async () => { throw new SyntaxError('html'); } };
  assert.equal(await page('http:', async () => broken).get('serverAvailable')(), false);
});

test('an unreachable host is no server', async () => {
  assert.equal(await page('http:', async () => { throw new TypeError('offline'); }).get('serverAvailable')(), false);
});

test('serve.py identifies itself and is asked only once', async () => {
  const p = page('http:', async () => json(200, { server: 'room-blueprint', api: 1 }));
  assert.equal(await p.get('serverAvailable')(), true);
  assert.equal(await p.get('serverAvailable')(), true);
  assert.equal(p.calls.length, 1);
});

test('projects go to the server only if there is one, and name the version they build on', async () => {
  const yes = page('http:', async () => json(200, { server: 'room-blueprint' }));
  assert.equal(await yes.get('pushServerProjects')({ a: 1 }, '"v1"'), 'saved');
  assert.deepEqual(yes.calls, [['api/info', 'GET', undefined], ['api/projects', 'PUT', '"v1"']]);
  const no = page('https:', async () => json(404));
  assert.equal(await no.get('pushServerProjects')({ a: 1 }, '"v1"'), 'failed');
  assert.deepEqual(no.calls, [['api/info', 'GET', undefined]]);
});

test('a push says how it ended', async () => {
  const push = (status) => page('http:', async (url, opts) => opts?.method === 'PUT' ? json(status) : json(200, { server: 'room-blueprint' }))
    .get('pushServerProjects')({}, '"v1"');
  assert.equal(await push(204), 'saved');
  assert.equal(await push(412), 'conflict');
  assert.equal(await push(500), 'failed');
  const gone = page('http:', async (url, opts) => { if (opts?.method === 'PUT') throw new TypeError('offline'); return json(200, { server: 'room-blueprint' }); });
  assert.equal(await gone.get('pushServerProjects')({}, '"v1"'), 'failed');
});

test('fetchServerProjects hands over the version with the projects', async () => {
  const out = await page('http:', async () => json(200, { a: 1 })).get('fetchServerProjects')();
  assert.equal(out.rev, '"v1"');
  assert.equal(out.projects.a, 1);
});

test('fetchServerProjects rejects on an error status', async () => {
  await assert.rejects(page('http:', async () => json(404)).get('fetchServerProjects')());
});

test('storeGet survives corrupt values and blocked storage', () => {
  const mem = { good: '{"a":1}', bad: '{oops' };
  const localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const p = page('file:', async () => json(404), { localStorage });
  assert.equal(p.get('storeGet')('good').a, 1);
  assert.equal(p.get('storeGet')('bad'), null);
  assert.equal(p.get('storeGet')('missing'), null);
  assert.equal(p.get('storeSet')('n', 0), true);
  assert.equal(mem.n, '0');
  assert.equal(p.get('storeGet')('n'), 0);

  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const q = page('file:', async () => json(404), { localStorage: blocked });
  assert.equal(q.get('storeGet')('x'), null);
  assert.equal(q.get('storeSet')('x', 1), false);
});
