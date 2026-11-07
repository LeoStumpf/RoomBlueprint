# Roadmap

Room Blueprint is a dependency-free 2D room planner. This file lists what is done and what may come next. Ideas and
pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Principles

- Plain HTML, CSS and JavaScript: no build step, no framework, no npm dependency for the tool. `index.html` works when
  opened directly from disk, through `serve.py` and on GitHub Pages.
- Everything stays in the browser. `serve.py` is an optional helper for sharing projects within a home network.
- English user interface, metric units.
- An Android app may follow later as a thin wrapper around the same files, so browser-specific code stays in
  `js/platform.js`.

## Done

- [x] Code split into `js/`, `css/` and `demo/`, with `// @ts-check` and `node --test`
- [x] Project file format with validation, several projects, import and export
- [x] Room editor: size, wall thickness, doors, windows, balcony doors, radiators, niches, chimneys, columns and wall
      blocks; all four walls draggable; corners can be cut for L-shaped rooms
- [x] Start assistant with a small room library grouped by room type, each room with a ready example layout
- [x] Furniture catalog with about 150 generic pieces, search by words, synonyms and sizes, round and L-shaped pieces,
      groups, own pieces and templates
- [x] Room Check: a neutral, calculated review of every layout in percent, with reasons and suggestions
- [x] Optional Feng Shui layer
- [x] Compare view and scale drawings for printing
- [x] Blueprint design with dark mode, phone layout and keyboard control
- [x] Safe defaults for `serve.py` (localhost only), conflict handling for shared projects, clear messages when saving fails
- [x] Optional local project folder (`local/`, gitignored) that loads your own projects on `file://` and localhost

## Next

- [ ] Check on real touch devices, in Firefox and in Safari
- [ ] Check printing in a real print dialog at 100 % scale
- [ ] Room Check: a print stylesheet, and bars in the summary table
- [ ] Phone in landscape: some controls overlap the room corner and the room info
- [ ] Labels of fixtures and openings can overlap; zone labels can cover furniture names
- [ ] Screen reader announcements when weights change in Room Check and Compare
- [ ] Doors and windows on the inner walls of an L-shaped room
- [ ] Furniture pushed out by a smaller room is detected by its centre only
- [ ] Undo for moving a layout to another project
- [ ] Groups: rotate, duplicate and delete as a whole; snapping for every member
- [ ] Rugs: a "flat" property so that furniture can stand on them
- [ ] Furniture templates in the project file, so they travel with export and `serve.py`
- [ ] Direct links to a Room Check card open it
- [ ] Landscape printing for wide rooms
- [ ] Browser tests for dialogs, menus and printing in the repository
- [ ] `serve.py`: protection against DNS rebinding

## Ideas

- [ ] Free floor plans with slanted walls
- [ ] Several rooms, a whole flat
- [ ] 3D view
- [ ] Automatic layout suggestions
- [ ] Sharing by link
- [ ] A floor plan image as a background
- [ ] More languages, feet and inches
- [ ] Offline web app (manifest and service worker)
- [ ] Android app as a Capacitor wrapper
