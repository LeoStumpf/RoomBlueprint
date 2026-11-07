#!/usr/bin/env node
'use strict';
// Writes a project file into the optional local project folder, as the classic script the planner loads from there
// (local/projects.js, gitignored). The file may be in any format the planner imports. An entry with the same id is replaced,
// other entries stay.
//
// Usage: node tools/local-project.js <project.json> [--id local-my-room] [--name "My room"] [--out local/projects.js]
const fs = require('node:fs');
const path = require('node:path');
const { load, PROJECT_SCRIPTS } = require('../tests/load');

const GLOBAL = 'ROOM_BLUEPRINT_LOCAL';

/** @param {string[]} argv */
function options(argv) {
  const out = { file: '', id: 'local-project', name: '', out: path.join(__dirname, '..', 'local', 'projects.js') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id' || a === '--name' || a === '--out') out[a.slice(2)] = argv[++i] ?? '';
    else if (!out.file) out.file = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.file) throw new Error('usage: node tools/local-project.js <project.json> [--id local-…] [--name …] [--out …]');
  return out;
}

/** Reads the entries of an existing local script, through the same global the pages use. @param {string} src */
function readLocalScript(src) {
  const ctx = load([]).ctx;
  require('node:vm').runInContext(src, ctx);
  return ctx[GLOBAL]?.projects ?? [];
}

/**
 * The text of the local script with this project in it, checked the way the planner checks it.
 * @param {any} data parsed project file @param {{ id: string, name?: string, createdAt?: number }} opts
 * @param {string} [existing] the current script, whose other entries stay
 * @returns {{ text: string, project: any }}
 */
function localScript(data, { id, name, createdAt = Date.now() }, existing) {
  const { get } = load(PROJECT_SCRIPTS);
  if (!get('LOCAL_ID').test(id)) throw new Error(`the id must look like local-my-room, not ${id}`);
  const { project } = get('parseProjectFile')(data, { name: name || 'Local project' });
  const file = get('exportProject')({ ...JSON.parse(JSON.stringify(project)), ...(name ? { name } : {}) });
  const entries = (existing ? readLocalScript(existing) : []).filter(e => e?.id !== id);
  entries.push({ id, createdAt, file });
  // The planner must take every entry back, or this would write a file it ignores
  const back = get('localEntries')({ projects: JSON.parse(JSON.stringify(entries)) });
  if (back.length !== entries.length) throw new Error('the planner would not read this file back');
  const text = '// Optional local project folder, written by tools/local-project.js. It stays on this computer.\n'
    + `globalThis.${GLOBAL} = ${JSON.stringify({ version: 1, projects: entries }, null, 1)};\n`;
  return { text, project: file };
}

if (require.main === module) {
  try {
    const o = options(process.argv.slice(2));
    const existing = fs.existsSync(o.out) ? fs.readFileSync(o.out, 'utf8') : undefined;
    const { text, project } = localScript(JSON.parse(fs.readFileSync(o.file, 'utf8')), o, existing);
    fs.mkdirSync(path.dirname(o.out), { recursive: true });
    fs.writeFileSync(o.out, text, { mode: 0o600 });
    console.log(`${o.out}: ${o.id}, ${project.layouts.length} layouts, ${project.furniture.length} pieces of furniture`);
  } catch (err) {
    console.error(`local-project: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { localScript, readLocalScript, GLOBAL };
