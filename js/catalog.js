// @ts-check
// The furniture catalog: generic names and common sizes in cm, width × depth, with the height where it matters to the
// checks. An entry is a piece of furniture without id and colour, in the same fields a project file uses, plus `also`:
// other words people search for, which never goes into a project.
//
// kind decides which checks apply. `table` is a place to sit and work at: it gets a chair and counts for the desk score. A
// dining or coffee table is therefore `custom`, so that no room is told its dining table has poor light for working.
// Things outside a living space (balcony, bathroom) are `custom` too, so that no sofa check runs on a garden bench.

/** @typedef {Omit<ItemDef, 'id' | 'color'> & { also?: string }} CatalogEntry */
/** @typedef {{ name: string, color: string, also?: string, items: CatalogEntry[] }} CatalogGroup */

/** @type {CatalogGroup[]} */
const CATALOG = [
  { name: 'Sofas and chairs', color: '#9ccabb', also: 'living room lounge seating seat', items: [
    { name: 'Two-seat sofa', kind: 'sofa', w: 160, d: 90, also: 'couch settee loveseat 2-seater' },
    { name: 'Three-seat sofa', kind: 'sofa', w: 210, d: 95, also: 'couch settee 3-seater' },
    { name: 'Four-seat sofa', kind: 'sofa', w: 250, d: 100, also: 'couch settee 4-seater large' },
    { name: 'L-shaped sofa', kind: 'sofa', w: 260, d: 170, shape: 'L', leg: [95, 95], also: 'corner sofa couch sectional settee' },
    { name: 'Large corner sofa', kind: 'sofa', w: 300, d: 200, shape: 'L', leg: [100, 100], also: 'l-shaped couch sectional settee' },
    { name: 'Sofa bed', kind: 'sofa', w: 200, d: 95, also: 'sleeper sofa couch futon settee guest' },
    { name: 'Armchair', kind: 'sofa', w: 80, d: 85, also: 'easy chair club chair wing chair' },
    { name: 'Recliner', kind: 'sofa', w: 90, d: 95, also: 'armchair lounge chair' },
    { name: 'Rocking chair', kind: 'sofa', w: 65, d: 90, also: 'rocker armchair' },
    { name: 'Footstool', kind: 'custom', w: 60, d: 45, h: 40, also: 'ottoman footrest' },
    { name: 'Pouf', kind: 'custom', w: 45, d: 45, h: 40, shape: 'round', also: 'pouffe ottoman footstool' },
    { name: 'Bean bag', kind: 'custom', w: 80, d: 80, h: 70, shape: 'round', also: 'beanbag sack chair' },
    { name: 'Coffee table', kind: 'custom', w: 110, d: 60, h: 45, also: 'living room table cocktail table' },
    { name: 'Round coffee table', kind: 'custom', w: 80, d: 80, h: 45, shape: 'round', also: 'cocktail table' },
    { name: 'Side table', kind: 'custom', w: 45, d: 45, h: 55, shape: 'round', also: 'end table occasional table' },
  ] },
  { name: 'TV and media', color: '#a9b7c6', also: 'screen media living room', items: [
    { name: 'TV on a media board', kind: 'television', w: 160, d: 45, h: 120, also: 'television telly tv set tv stand lowboard tv unit' },
    { name: 'TV 32 inch', kind: 'television', w: 73, d: 25, h: 95, also: 'television telly small tv' },
    { name: 'TV 43 inch', kind: 'television', w: 96, d: 25, also: 'television telly' },
    { name: 'TV 50 inch', kind: 'television', w: 112, d: 25, h: 115, also: 'television telly' },
    { name: 'TV 55 inch', kind: 'television', w: 123, d: 25, h: 120, also: 'television telly' },
    { name: 'TV 65 inch', kind: 'television', w: 145, d: 30, h: 130, also: 'television telly large tv' },
    { name: 'TV 75 inch', kind: 'television', w: 168, d: 35, h: 140, also: 'television telly large tv' },
    { name: 'Media board', kind: 'tv', w: 160, d: 45, also: 'tv stand tv bench lowboard tv unit tv cabinet' },
    { name: 'Small media board', kind: 'tv', w: 120, d: 40, also: 'tv stand tv bench lowboard tv unit' },
    { name: 'Floor speaker', kind: 'custom', w: 25, d: 30, h: 100, also: 'loudspeaker tower speaker hifi' },
  ] },
  { name: 'Beds', color: '#d9b3c4', also: 'bedroom sleep', items: [
    { name: 'Single bed', kind: 'bed', w: 90, d: 200, also: 'twin bed day bed daybed guest bed' },
    { name: 'Wide single bed', kind: 'bed', w: 120, d: 200, also: 'small double three quarter bed' },
    { name: 'Double bed', kind: 'bed', w: 140, d: 200, also: 'full bed' },
    { name: 'Queen bed', kind: 'bed', w: 160, d: 200, also: 'double bed' },
    { name: 'King bed', kind: 'bed', w: 180, d: 200, also: 'double bed' },
    { name: 'Super king bed', kind: 'bed', w: 200, d: 200, also: 'double bed california' },
    { name: 'Box-spring bed', kind: 'bed', w: 180, d: 210, also: 'boxspring continental bed double bed' },
    { name: 'Folding guest bed', kind: 'bed', w: 80, d: 190, also: 'camp bed cot extra bed' },
    { name: 'Bedside table', kind: 'custom', w: 45, d: 40, h: 55, also: 'nightstand night table' },
    { name: 'Dressing table', kind: 'custom', w: 100, d: 45, h: 75, also: 'vanity table makeup table' },
    { name: 'Bed bench', kind: 'custom', w: 120, d: 40, h: 45, also: 'end of bed bench blanket bench' },
  ] },
  { name: 'Wardrobes and storage', color: '#bdb0e0', also: 'storage cupboard bedroom', items: [
    { name: 'Wardrobe, 1 door', kind: 'wardrobe', w: 50, d: 60, h: 200, doors: 1, mirror: false, also: 'closet armoire narrow' },
    { name: 'Wardrobe, 2 doors', kind: 'wardrobe', w: 100, d: 60, h: 220, doors: 2, mirror: false, also: 'closet armoire' },
    { name: 'Wardrobe, 3 doors', kind: 'wardrobe', w: 150, d: 60, h: 220, doors: 3, mirror: false, also: 'closet armoire' },
    { name: 'Wardrobe, 4 doors', kind: 'wardrobe', w: 200, d: 60, h: 220, doors: 4, mirror: false, also: 'closet armoire' },
    { name: 'Mirror wardrobe', kind: 'wardrobe', w: 150, d: 60, h: 220, doors: 3, mirror: true, also: 'closet armoire mirrored' },
    { name: 'Wardrobe with sliding doors', kind: 'wardrobe', w: 200, d: 65, h: 220, doors: 2, mirror: false, clear: 0, also: 'closet sliding door' },
    { name: 'Large wardrobe with sliding doors', kind: 'wardrobe', w: 250, d: 65, h: 230, doors: 3, mirror: false, clear: 0, also: 'closet sliding door' },
    { name: 'Clothes rail', kind: 'shelf', w: 120, d: 50, h: 170, also: 'garment rack clothing rail open wardrobe' },
    { name: 'Bookcase', kind: 'shelf', w: 80, d: 30, h: 200, also: 'bookshelf shelving shelf unit' },
    { name: 'Narrow bookcase', kind: 'shelf', w: 40, d: 30, h: 200, also: 'bookshelf shelving' },
    { name: 'Wide bookcase', kind: 'shelf', w: 160, d: 35, h: 200, also: 'bookshelf shelving wall unit' },
    { name: 'Low shelf', kind: 'shelf', w: 80, d: 40, h: 90, also: 'bookshelf low bookcase' },
    { name: 'Cube shelf, 2 × 2', kind: 'shelf', w: 77, d: 39, h: 77, also: 'cube storage cubby shelving' },
    { name: 'Cube shelf, 4 × 4', kind: 'shelf', w: 147, d: 39, h: 147, also: 'cube storage cubby shelving room divider' },
    { name: 'Chest of drawers', kind: 'custom', w: 80, d: 45, h: 85, clear: 40, also: 'dresser drawers commode' },
    { name: 'Tall chest of drawers', kind: 'custom', w: 60, d: 45, h: 120, clear: 40, also: 'dresser drawers tallboy' },
    { name: 'Sideboard', kind: 'custom', w: 160, d: 45, h: 80, clear: 40, also: 'buffet credenza cabinet' },
    { name: 'Highboard', kind: 'custom', w: 100, d: 45, h: 140, clear: 40, also: 'cabinet cupboard' },
    { name: 'Display cabinet', kind: 'custom', w: 80, d: 40, h: 180, clear: 40, also: 'vitrine china cabinet glass cabinet' },
    { name: 'Storage chest', kind: 'custom', w: 90, d: 45, h: 50, also: 'trunk blanket box' },
  ] },
  { name: 'Kitchen and dining', color: '#e3d28f', also: 'kitchen dining eat', items: [
    { name: 'Small dining table', kind: 'custom', w: 80, d: 80, h: 75, also: 'table for 2 bistro kitchen table' },
    { name: 'Dining table for 4', kind: 'custom', w: 120, d: 80, h: 75, also: 'kitchen table' },
    { name: 'Dining table for 6', kind: 'custom', w: 180, d: 90, h: 75, also: 'kitchen table' },
    { name: 'Dining table for 8', kind: 'custom', w: 240, d: 100, h: 75, also: 'long table' },
    { name: 'Round dining table', kind: 'custom', w: 110, d: 110, h: 75, shape: 'round', also: 'kitchen table' },
    { name: 'Small round dining table', kind: 'custom', w: 90, d: 90, h: 75, shape: 'round', also: 'kitchen table bistro' },
    { name: 'Oval dining table', kind: 'custom', w: 180, d: 100, h: 75, shape: 'round', also: 'kitchen table' },
    { name: 'Chair', kind: 'custom', w: 45, d: 50, h: 85, also: 'dining chair kitchen chair seat' },
    { name: 'Dining bench', kind: 'custom', w: 140, d: 35, h: 45, also: 'bench seat' },
    { name: 'Corner bench', kind: 'custom', w: 180, d: 140, h: 85, shape: 'L', leg: [50, 50], also: 'kitchen corner seat banquette' },
    { name: 'Bar stool', kind: 'custom', w: 40, d: 40, h: 75, shape: 'round', also: 'counter stool high stool' },
    { name: 'Bar table', kind: 'custom', w: 120, d: 60, h: 105, also: 'high table counter table' },
    { name: 'Kitchen island', kind: 'custom', w: 180, d: 90, h: 90, clear: 60, also: 'island counter' },
    { name: 'Kitchen run', kind: 'custom', w: 270, d: 60, h: 90, clear: 90, also: 'kitchen counter worktop kitchen units fitted kitchen' },
    { name: 'Kitchenette', kind: 'custom', w: 180, d: 60, h: 90, clear: 90, also: 'mini kitchen small kitchen pantry kitchen' },
    { name: 'Kitchen base cabinet', kind: 'custom', w: 60, d: 60, h: 90, clear: 60, also: 'base unit cupboard counter' },
    { name: 'Kitchen tall cabinet', kind: 'custom', w: 60, d: 60, h: 210, clear: 60, also: 'larder pantry tall unit cupboard' },
    { name: 'Fridge', kind: 'custom', w: 60, d: 65, h: 180, clear: 60, also: 'refrigerator fridge freezer' },
    { name: 'Side-by-side fridge', kind: 'custom', w: 90, d: 70, h: 180, clear: 90, also: 'american fridge refrigerator double door' },
    { name: 'Chest freezer', kind: 'custom', w: 90, d: 65, h: 85, clear: 60, also: 'freezer' },
    { name: 'Cooker', kind: 'custom', w: 60, d: 60, h: 85, clear: 60, also: 'stove oven range hob' },
    { name: 'Dishwasher', kind: 'custom', w: 60, d: 60, h: 85, clear: 60, also: 'dish washer' },
    { name: 'Kitchen trolley', kind: 'custom', w: 50, d: 40, h: 90, also: 'cart kitchen cart serving trolley' },
    { name: 'Waste bin', kind: 'custom', w: 40, d: 35, h: 70, also: 'trash can garbage bin rubbish bin recycling' },
  ] },
  { name: 'Home office', color: '#e8c49a', also: 'office work study', items: [
    { name: 'Desk', kind: 'table', w: 120, d: 60, also: 'writing desk workplace computer desk table' },
    { name: 'Small desk', kind: 'table', w: 100, d: 50, also: 'writing desk compact desk table' },
    { name: 'Large desk', kind: 'table', w: 160, d: 80, also: 'writing desk computer desk table' },
    { name: 'Standing desk', kind: 'table', w: 140, d: 70, also: 'sit-stand desk height-adjustable desk table' },
    { name: 'Corner desk', kind: 'custom', w: 160, d: 140, h: 75, shape: 'L', leg: [60, 70], also: 'l-shaped desk' },
    { name: 'Office chair', kind: 'custom', w: 60, d: 60, h: 100, shape: 'round', also: 'desk chair swivel chair' },
    { name: 'Drawer pedestal', kind: 'custom', w: 40, d: 55, h: 60, clear: 40, also: 'drawer unit filing pedestal rolling cabinet' },
    { name: 'Filing cabinet', kind: 'custom', w: 50, d: 60, h: 130, clear: 60, also: 'file cabinet drawers' },
    { name: 'Office cupboard', kind: 'custom', w: 80, d: 40, h: 200, clear: 40, also: 'cabinet storage cupboard' },
    { name: 'Printer table', kind: 'custom', w: 60, d: 40, h: 70, also: 'printer stand side table' },
  ] },
  { name: 'Kids room', color: '#f0b9a5', also: 'kids children child baby nursery', items: [
    { name: 'Cot', kind: 'bed', w: 60, d: 120, h: 90, also: 'crib baby bed' },
    { name: 'Large cot', kind: 'bed', w: 70, d: 140, h: 90, also: 'crib cot bed baby bed' },
    { name: 'Toddler bed', kind: 'bed', w: 70, d: 160, also: 'junior bed kids bed children bed' },
    { name: 'Bunk bed', kind: 'bed', w: 90, d: 200, h: 160, also: 'double decker kids bed' },
    { name: 'Loft bed', kind: 'bed', w: 90, d: 200, h: 180, also: 'high sleeper mid sleeper kids bed' },
    { name: 'Changing table', kind: 'custom', w: 90, d: 55, h: 95, clear: 40, also: 'changing unit baby dresser' },
    { name: 'Nursing chair', kind: 'sofa', w: 70, d: 80, also: 'glider armchair rocking chair' },
    { name: "Children's desk", kind: 'table', w: 90, d: 55, also: 'kids desk school desk study desk' },
    { name: "Children's table", kind: 'custom', w: 60, d: 60, h: 50, also: 'kids table play table' },
    { name: 'Toy shelf', kind: 'shelf', w: 100, d: 30, h: 80, also: 'toy storage kids shelf' },
    { name: 'Toy chest', kind: 'custom', w: 70, d: 40, h: 45, also: 'toy box' },
    { name: 'Play tent', kind: 'custom', w: 100, d: 100, h: 130, shape: 'round', also: 'teepee tipi play house' },
  ] },
  { name: 'Bathroom', color: '#a6d4e0', also: 'bath laundry', items: [
    { name: 'Bathtub', kind: 'custom', w: 170, d: 75, h: 60, also: 'bath tub' },
    { name: 'Large bathtub', kind: 'custom', w: 180, d: 80, h: 60, also: 'bath tub' },
    { name: 'Shower', kind: 'custom', w: 90, d: 90, h: 200, also: 'shower tray shower cubicle shower enclosure' },
    { name: 'Walk-in shower', kind: 'custom', w: 120, d: 90, h: 200, also: 'shower tray shower enclosure' },
    { name: 'Washbasin with cabinet', kind: 'custom', w: 60, d: 45, h: 85, clear: 60, also: 'sink vanity unit basin' },
    { name: 'Double washbasin', kind: 'custom', w: 120, d: 50, h: 85, clear: 60, also: 'double sink vanity unit basin' },
    { name: 'Toilet', kind: 'custom', w: 40, d: 65, h: 80, clear: 60, also: 'wc loo lavatory' },
    { name: 'Bathroom tall cabinet', kind: 'custom', w: 35, d: 30, h: 170, clear: 35, also: 'tall unit cupboard' },
    { name: 'Washing machine', kind: 'custom', w: 60, d: 60, h: 85, clear: 60, also: 'washer laundry' },
    { name: 'Tumble dryer', kind: 'custom', w: 60, d: 60, h: 85, clear: 60, also: 'dryer laundry' },
    { name: 'Laundry basket', kind: 'custom', w: 40, d: 40, h: 60, shape: 'round', also: 'hamper' },
  ] },
  { name: 'Hallway', color: '#cfc39a', also: 'hall entrance entry corridor', items: [
    { name: 'Shoe cabinet', kind: 'custom', w: 80, d: 25, h: 100, clear: 30, also: 'shoe cupboard shoe storage' },
    { name: 'Shoe rack', kind: 'shelf', w: 80, d: 30, h: 50, also: 'shoe shelf shoe storage' },
    { name: 'Hall bench', kind: 'custom', w: 100, d: 40, h: 45, also: 'entryway bench shoe bench seat' },
    { name: 'Coat stand', kind: 'custom', w: 45, d: 45, h: 180, shape: 'round', also: 'coat rack hall stand hat stand' },
    { name: 'Hallway wardrobe', kind: 'wardrobe', w: 100, d: 40, h: 200, doors: 2, mirror: false, also: 'coat cupboard closet' },
    { name: 'Console table', kind: 'custom', w: 100, d: 35, h: 80, also: 'hall table sofa table' },
    { name: 'Standing mirror', kind: 'custom', w: 50, d: 30, h: 170, also: 'floor mirror full-length mirror' },
    { name: 'Umbrella stand', kind: 'custom', w: 25, d: 25, h: 60, shape: 'round', also: 'umbrella holder' },
  ] },
  { name: 'Balcony', color: '#b5d69a', also: 'garden patio terrace outdoor outside', items: [
    { name: 'Bistro table', kind: 'custom', w: 60, d: 60, h: 75, shape: 'round', also: 'balcony table cafe table' },
    { name: 'Balcony table', kind: 'custom', w: 100, d: 60, h: 75, also: 'folding table garden table' },
    { name: 'Folding chair', kind: 'custom', w: 45, d: 50, h: 80, also: 'balcony chair garden chair' },
    { name: 'Outdoor sofa', kind: 'custom', w: 140, d: 75, h: 75, also: 'garden sofa lounge couch balcony bench' },
    { name: 'Sun lounger', kind: 'custom', w: 200, d: 70, h: 35, also: 'deck chair lounger daybed' },
    { name: 'Planter', kind: 'custom', w: 80, d: 40, h: 60, also: 'flower box plant box trough' },
    { name: 'Raised bed', kind: 'custom', w: 120, d: 60, h: 80, also: 'garden bed vegetable bed planter' },
    { name: 'Garden storage box', kind: 'custom', w: 130, d: 60, h: 65, clear: 40, also: 'deck box cushion box' },
    { name: 'Barbecue', kind: 'custom', w: 100, d: 55, h: 110, clear: 60, also: 'grill bbq' },
    { name: 'Clothes airer', kind: 'custom', w: 180, d: 55, h: 100, also: 'drying rack laundry rack' },
  ] },
  { name: 'Other', color: '#c9beb1', also: 'misc', items: [
    { name: 'Floor lamp', kind: 'custom', w: 30, d: 30, h: 160, shape: 'round', also: 'standard lamp light' },
    { name: 'Large plant', kind: 'custom', w: 45, d: 45, h: 130, shape: 'round', also: 'pot plant house plant tree' },
    { name: 'Small plant', kind: 'custom', w: 30, d: 30, h: 70, shape: 'round', also: 'pot plant house plant' },
    { name: 'Upright piano', kind: 'custom', w: 150, d: 60, h: 125, clear: 60 },
    { name: 'Digital piano', kind: 'custom', w: 140, d: 40, h: 90, clear: 60, also: 'keyboard e-piano stage piano' },
    { name: 'Grand piano', kind: 'custom', w: 150, d: 190, h: 100, clear: 60, also: 'baby grand' },
    { name: 'Bicycle', kind: 'custom', w: 175, d: 60, h: 100, also: 'bike' },
    { name: 'Treadmill', kind: 'custom', w: 180, d: 80, h: 140, also: 'running machine fitness' },
    { name: 'Exercise bike', kind: 'custom', w: 100, d: 55, h: 130, also: 'home trainer spinning bike fitness' },
    { name: 'Rowing machine', kind: 'custom', w: 220, d: 55, h: 50, also: 'rower fitness' },
    { name: 'Yoga mat', kind: 'custom', w: 180, d: 60, h: 1, also: 'exercise mat fitness' },
    { name: 'Aquarium', kind: 'custom', w: 100, d: 40, h: 130, also: 'fish tank' },
    { name: 'Cat tree', kind: 'custom', w: 50, d: 50, h: 150, also: 'cat tower scratching post pet' },
    { name: 'Dog bed', kind: 'custom', w: 90, d: 70, h: 25, shape: 'round', also: 'pet bed dog basket' },
    { name: 'Room divider shelf', kind: 'shelf', w: 150, d: 40, h: 150, also: 'partition open shelf' },
    { name: 'Folding screen', kind: 'custom', w: 160, d: 30, h: 170, also: 'privacy screen room divider partition' },
    { name: 'Wood stove', kind: 'custom', w: 50, d: 45, h: 100, clear: 80, also: 'stove fireplace burner' },
  ] },
];

/** What goes into a project: the entry without its search words. @param {CatalogEntry} e @returns {Omit<ItemDef, 'id' | 'color'>} */
function catalogDef(e) {
  const { also, ...def } = e;
  return def;
}

// ---------- Search ----------
// A search has words and up to two numbers. Words must all be found in the name, the other words or the group; numbers
// are a size, and the closest sizes come first. "sofa 200", "200x90", "200 x 90 cm", "2 m" all work.

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toCm = (n, unit) => Math.round(parseFloat(n.replace(',', '.')) * (unit === 'm' ? 100 : 1));

/** @param {string} q @returns {{ words: string[], size: number[] }} size has no, one or two numbers in cm */
function parseSearch(q) {
  let text = ` ${q.toLowerCase()} `.replace(/[×*]/g, ' x ');
  const size = [];
  // A unit ends where no letter, digit or hyphen follows, so that "2-seater" stays a word
  const unit = String.raw`\s*(cm|m)?(?![\p{L}\d-])`;
  text = text.replace(new RegExp(`${NUM}\\s*(cm|m)?\\s*x\\s*${NUM}${unit}`, 'gu'), (_, a, ua, b, ub) => {
    if (size.length < 2) size.push(toCm(a, ua ?? ub), toCm(b, ub ?? ua));
    return ' ';
  });
  // A number standing alone, not part of a word like 2-seater
  text = text.replace(new RegExp(`(?<![\\p{L}\\d-])${NUM}${unit}`, 'gu'), (_, n, u) => {
    if (size.length < 2) size.push(toCm(n, u));
    return ' ';
  });
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(w => w && w !== 'x');
  return { words, size: size.filter(n => n > 0) };
}

const wordsOf = s => (s ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** How well a word fits a list of words: 0 exactly, 1 as the start of one, Infinity not at all. Plural s is forgiven. */
function wordFit(word, list) {
  const stems = [word];
  if (word.length > 3 && word.endsWith('s')) stems.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) stems.push(word.slice(0, -2));
  if (list.some(w => stems.includes(w))) return 0;
  return list.some(w => stems.some(s => w.startsWith(s))) ? 1 : Infinity;
}

/**
 * How far a piece is from the size searched for, and the difference to show.
 * @param {{ name: string, w: number, d: number }} e @param {number[]} size
 * @returns {{ dist: number, diff: string }}
 */
function sizeFit(e, size) {
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
  if (size.length === 1) {
    const [n] = size;
    // "TV 55" or "table for 6": the number is in the name
    if (wordsOf(e.name).includes(String(n))) return { dist: 0, diff: '' };
    // One number is the width, as in "a 160 bed" or "a 2 m sofa"
    const dw = e.w - n;
    return { dist: Math.abs(dw), diff: dw ? `${sign(dw)} cm wide` : 'same width' };
  }
  const [a, b] = size, straight = Math.abs(e.w - a) + Math.abs(e.d - b), turned = Math.abs(e.w - b) + Math.abs(e.d - a);
  const [dx, dy] = straight <= turned ? [e.w - a, e.d - b] : [e.d - a, e.w - b];
  return { dist: Math.min(straight, turned), diff: dx || dy ? `${sign(dx)} × ${sign(dy)} cm` : 'same size' };
}

/**
 * Searches a list of pieces. Without a size the best word matches come first, with one the closest sizes.
 * @template {{ e: { name: string, w: number, d: number, also?: string }, group?: { name: string, also?: string } }} T
 * @param {string} q @param {T[]} list
 * @returns {(T & { dist: number, diff: string, at: number })[]} at is the place in the list
 */
function searchFurniture(q, list) {
  const { words, size } = parseSearch(q);
  if (!words.length && !size.length) return [];
  const hits = [];
  list.forEach(({ e, group }, at) => {
    const name = wordsOf(e.name), also = wordsOf(e.also), grp = [...wordsOf(group?.name), ...wordsOf(group?.also)];
    let score = 0, weak = 0;
    for (const w of words) {
      const s = Math.min(wordFit(w, name), 2 + wordFit(w, also), 4 + wordFit(w, grp));
      if (s === Infinity) return;
      // Found only through its group: the kitchen chair for "kitchen", but after the pieces that say kitchen themselves
      if (s >= 4) weak = 1;
      // A bed among the beds before the sofa bed
      score += s - (wordFit(w, grp) < Infinity ? 0.5 : 0);
    }
    const fit = size.length ? sizeFit(e, size) : { dist: 0, diff: '' };
    hits.push({ ...list[at], score, weak, at, ...fit });
  });
  hits.sort((x, y) => x.weak - y.weak || x.dist - y.dist || x.score - y.score || x.at - y.at);
  // With a size, "sofa 230x100" means sofas of that size, not every seat in the group
  const strong = size.length && hits.some(h => !h.weak);
  return hits.filter(h => !strong || !h.weak).map(({ score, weak, ...h }) => h);
}

/** Every catalog entry with its group, in the order of the catalog. */
const catalogList = () => CATALOG.flatMap((group, gi) => group.items.map((e, k) => ({ e, group, gi, k })));
