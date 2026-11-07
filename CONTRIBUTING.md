# Contributing

Thanks for your interest. Bug reports, small fixes and ideas are all welcome. For a larger change, please open an
issue first, so we can agree on the approach before you spend time on it.

## Ground rules

- **No build and no dependencies.** The tool is plain HTML, CSS and JavaScript. `index.html` has to keep working when
  opened directly from disk (`file://`), through `serve.py` and on a static host.
- **Classic scripts, no ES modules.** Modules do not load under `file://`. Scripts share one global scope, in the order
  the pages list them. Data lives in `.js` files, because `fetch` does not work under `file://` either.
- **Browser specifics go in `js/platform.js`.** It is the only file that may touch `localStorage`, `fetch` or `window.print`.
- **Pure logic stays pure.** `geometry.js`, `analyze.js`, `project.js`, `recommend.js`, `room-edit.js`, `catalog.js` and
  `item-edit.js` take what they need as parameters and do not touch the page.
- **A new file must be added to `PAGES` in `serve.py`,** or the server returns 404 for it. A test checks this.
- **English only**, in the interface and in the code.
- **Demo rooms are invented.** Please do not add real floor plans, private addresses or brand names.
- **Your own rooms stay local.** Keep them in the optional local project folder `local/` (gitignored, see the README), never in
  `demo/` or a test.

## Checks

```
node --test                  # needs Node 20 or later
tsc -p jsconfig.json         # optional; TypeScript is not a dependency of this repository
```

Add a test when you change logic. Then try the change in a browser, opened from disk and through `serve.py`.
`serve.py` writes to `data/` next to itself by default, so use `--data` with a throwaway folder while testing.

A few tests compare the results with local reference data outside the repository. Without that data they are skipped,
which is expected.

## Licence

By contributing, you agree that your contribution is released under the [MIT License](LICENSE).
