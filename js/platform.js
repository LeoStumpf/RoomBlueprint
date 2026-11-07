// @ts-check
// The only place for browser specifics: storage, saving files, printing, talking to serve.py.
// An Android shell only has to replace this file.

const SERVER_ID = 'room-blueprint';

/** @param {string} key @returns {any} parsed value, or null if missing, unreadable or storage is blocked */
function storeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

/** @param {string} key @param {any} val @returns {boolean} whether it was stored; storage can be full or blocked */
function storeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}

/** @param {string} key */
function storeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* private mode or the like */ }
}

/** The stored text as it is, also when it is no valid JSON. @param {string} key @returns {string | null} */
function storeRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Calls back when another tab changes storage. @param {(key: string | null) => void} fn */
function onStoreChange(fn) { addEventListener('storage', e => fn(e.key)); }

/** Hands a file to the user as a download. @param {Blob} blob @param {string} name */
function saveFile(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function printPlan() { window.print(); }

function reloadPage() { location.reload(); }

/**
 * Asks whether serve.py is behind this page. http alone proves nothing: GitHub Pages is http too, so serve.py marks the
 * pages it delivers and identifies itself on /api/info. Without the mark nothing is asked, which on a static host
 * would only put a 404 in the console.
 * @returns {Promise<boolean>}
 */
async function detectServer() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
  if (!document.querySelector(`meta[name="${SERVER_ID}-server"]`)) return false;
  try {
    const res = await fetch('api/info', { cache: 'no-store' });
    if (!res.ok) return false;
    return (await res.json())?.server === SERVER_ID;
  } catch { return false; }
}

/** @type {Promise<boolean> | null} */
let serverCheck = null;
/** Result of detectServer(), asked once per page load. */
function serverAvailable() { return serverCheck ??= detectServer(); }

// A server that stops answering must not hold up what waits behind this request. Not every shell has AbortSignal.timeout.
const SERVER_WAIT = 15000;   // ms
const serverDeadline = () => globalThis.AbortSignal?.timeout?.(SERVER_WAIT);

/** @returns {Promise<{ projects: Record<string, any>, rev: string }>} what the server holds and which version that is;
 *   rejects if the server cannot be reached */
async function fetchServerProjects() {
  const res = await fetch('api/projects', { cache: 'no-store', signal: serverDeadline() });
  if (!res.ok) throw new Error(`api/projects: ${res.status}`);
  return { projects: await res.json(), rev: res.headers.get('ETag') };
}

/**
 * Stores the projects on the server, unless it changed since the version named.
 * @param {Record<string, any>} projects @param {string} rev
 * @returns {Promise<'saved' | 'conflict' | 'failed'>}
 */
async function pushServerProjects(projects, rev) {
  if (!await serverAvailable()) return 'failed';
  try {
    const res = await fetch('api/projects', { method: 'PUT', signal: serverDeadline(),
      headers: { 'Content-Type': 'application/json', 'If-Match': rev }, body: JSON.stringify(projects) });
    return res.status === 412 ? 'conflict' : res.ok ? 'saved' : 'failed';
  } catch { return 'failed'; }
}

/** Whether the page runs from disk or from this computer, the only places an optional local project folder can be.
 * @param {{ protocol: string, hostname?: string }} [at] */
function isLocalPage(at = location) {
  return at.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(at.hostname ?? '');
}

/**
 * Runs an optional script that only exists on this computer, such as the gitignored local project folder. Any other host
 * is never asked, so a static host shows no 404. A missing file is not an error.
 * @param {string} src relative to the page @returns {Promise<boolean>} whether it ran
 */
function loadLocalScript(src) {
  if (typeof document === 'undefined' || !document.head || !isLocalPage()) return Promise.resolve(false);
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => { s.remove(); resolve(false); };
    document.head.append(s);
  });
}
