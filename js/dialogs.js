// @ts-check
// The questions a page asks: our own dialogs in place of alert, confirm and prompt, which block the page, cannot be styled and
// do not exist in every app shell. Each answer is a promise. Texts go in as plain text.

/** Questions wait for each other, a page shows one at a time. @type {Promise<any>} */
let askQueue = Promise.resolve();

/** @param {{ text: string, value?: string, ok: string, cancel?: string, danger?: boolean }} q
 * @returns {Promise<string | null>} the text field, or '' without one; null when cancelled */
function showAsk({ text, value, ok, cancel, danger }) {
  const d = /** @type {any} */ (document.createElement('dialog'));
  d.id = 'askDialog';
  const form = document.createElement('form'), p = document.createElement('p'), btns = document.createElement('div');
  form.method = 'dialog'; p.id = 'askText'; p.textContent = text; btns.className = 'btns';
  d.setAttribute('aria-labelledby', 'askText');
  form.append(p);
  const input = document.createElement('input');
  if (value !== undefined) {
    input.type = 'text'; input.value = value; input.maxLength = 200; input.setAttribute('aria-labelledby', 'askText');
    form.append(input);
    // Enter means OK. Left alone the browser would press the first button, and that is Cancel.
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); d.close('yes'); }
    });
  }
  if (cancel) {
    const no = document.createElement('button');
    no.value = 'no'; no.textContent = cancel;
    btns.append(no);
  }
  const yes = document.createElement('button');
  yes.value = 'yes'; yes.textContent = ok; yes.className = danger ? 'danger' : 'primary';
  btns.append(yes);
  form.append(btns); d.append(form);
  document.body.append(d);
  return new Promise(resolve => {
    d.addEventListener('close', () => {
      d.remove();
      resolve(d.returnValue === 'yes' ? (value === undefined ? '' : input.value) : null);
    });
    d.showModal();
    (value === undefined ? yes : input).focus();
    if (value !== undefined) input.select();
  });
}

/** @param {Parameters<typeof showAsk>[0]} q */
function ask(q) {
  const answer = askQueue.then(() => showAsk(q));
  askQueue = answer.catch(() => null);
  return answer;
}

/** Instead of alert(). @param {string} text @returns {Promise<any>} */
const tell = text => ask({ text, ok: 'OK' });

/** Instead of confirm(). @param {string} text @param {string} [ok] what the button does @param {boolean} [danger]
 * @returns {Promise<boolean>} */
const askYes = async (text, ok = 'OK', danger = false) => await ask({ text, ok, cancel: 'Cancel', danger }) !== null;

/** Instead of prompt(). @param {string} text @param {string} value @returns {Promise<string | null>} */
const askText = (text, value) => ask({ text, value, ok: 'OK', cancel: 'Cancel' });
