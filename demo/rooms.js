// @ts-check
// The room library a new project can start from, in groups. Every room opens on its first layout, so nobody starts from zero.
// The rooms are invented, except “Long bedroom with a chimney”: a real room, shared by its owner, with generic furniture names
// and layouts of its own (tests/privacy.test.js allows exactly its measures). Screens are ordinary TV sets.
// Scores and advice are worked out by the checks, so nothing here but the short idea is written by hand.
// All sizes in cm. Origin at the inner top left corner, x to the right, y down. place: id -> [x, y, rotation] of the centre.
// The order of DEMO_ROOMS stays fixed (the first one is the starter room); the start dialog sorts them by DEMO_GROUPS.

const DEMO_GROUPS = ['Living room', 'Bedroom', 'Kids room', 'Home office', 'One-room flat'];

const DEMO_COLORS = { BED: '#d9b3c4', SEATING: '#9ccabb', SCREEN: '#a9b7c6', WORK: '#e3d28f', STORE: '#bdb0e0', OTHER: '#c9beb1' };

const DEMO_ROOMS = (({ BED, SEATING, SCREEN, WORK, STORE, OTHER }) => [
  {
    group: 'One-room flat', name: 'Studio', hint: '20 m², one room for everything', profile: 'studio',
    room: {
      w: 540, l: 390, wall: 24,
      openings: [
        { type: 'door', wall: 'bottom', pos: 235, width: 90, hinge: 'end', name: 'Entrance' },
        { type: 'window', wall: 'top', pos: 60, width: 160 },
        { type: 'window', wall: 'right', pos: 110, width: 150 },
      ],
      fixtures: [{ type: 'block', x: 360, y: 330, w: 180, d: 60 }, { type: 'radiator', x: 100, y: 0, w: 80, d: 10 }],
    },
    furniture: [
      { id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, color: BED },
      { id: 'sofa', name: 'Sofa', kind: 'sofa', w: 160, d: 90, color: SEATING },
      { id: 'desk', name: 'Desk', kind: 'table', w: 120, d: 60, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 150, d: 60, h: 220, doors: 3, mirror: false, color: STORE },
      { id: 'shelf', name: 'Bookcase', kind: 'shelf', w: 80, d: 30, h: 200, color: STORE },
      { id: 'table', name: 'Dining table', kind: 'custom', w: 90, d: 90, h: 75, shape: 'round', color: WORK },
    ],
    layouts: [
      { name: 'Sleeping corner', idea: ['The bed takes the dark corner, the day happens at the windows.'],
        place: { bed: [100, 320, 270], sofa: [495, 185, 90], desk: [30, 70, 90], wardrobe: [345, 30, 0], shelf: [15, 190, 90], table: [340, 190, 0] } },
      { name: 'Bed by the light', idea: ['The bed moves to the windows and leaves the door side to the table.'],
        place: { bed: [470, 100, 0], sofa: [45, 300, 270], desk: [30, 70, 90], wardrobe: [305, 30, 0], shelf: [15, 175, 90], table: [250, 200, 0] } },
      { name: 'Wardrobe as a divider', idea: ['A tall wardrobe screens the bed from the rest of the room.'],
        place: { bed: [100, 320, 270], sofa: [495, 185, 90], desk: [30, 65, 90], wardrobe: [75, 215, 180], shelf: [290, 15, 0], table: [340, 190, 0] } },
      { name: 'Office by day', idea: ['The desk gets the best place at the corner of the two windows.'],
        place: { bed: [100, 320, 270], sofa: [140, 55, 0], desk: [480, 30, 0], wardrobe: [30, 175, 270], shelf: [300, 15, 0], table: [350, 190, 0] } },
    ],
  },
  {
    group: 'Home office', name: 'Shared flat room', hint: '14 m², sleeping and studying', profile: 'homeoffice',
    room: {
      w: 350, l: 400, wall: 16,
      openings: [
        { type: 'door', wall: 'top', pos: 245, width: 85, hinge: 'end' },
        { type: 'window', wall: 'bottom', pos: 90, width: 170 },
      ],
      fixtures: [{ type: 'radiator', x: 120, y: 390, w: 110, d: 10 }],
    },
    furniture: [
      { id: 'bed', name: 'Bed', kind: 'bed', w: 120, d: 200, color: BED },
      { id: 'desk', name: 'Desk', kind: 'table', w: 140, d: 70, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 150, d: 60, h: 220, doors: 3, mirror: false, color: STORE },
      { id: 'chair', name: 'Armchair', kind: 'sofa', w: 80, d: 85, color: SEATING },
      { id: 'shelf', name: 'Bookcase', kind: 'shelf', w: 80, d: 30, h: 200, color: STORE },
    ],
    layouts: [
      { name: 'Bed at the back', idea: ['Sleeping away from the window, studying next to it.'],
        place: { bed: [100, 60, 270], desk: [35, 320, 90], wardrobe: [320, 165, 90], chair: [275, 357, 180], shelf: [335, 280, 90] } },
      { name: 'Desk along the window', idea: ['A long desk under the window, with the wardrobe by the door.'],
        place: { bed: [100, 60, 270], desk: [175, 345, 180], wardrobe: [320, 165, 90], chair: [43, 200, 270], shelf: [335, 280, 90] } },
      { name: 'Bed by the window', idea: ['Morning light on the bed, the desk moves into the room.'],
        place: { bed: [60, 300, 180], desk: [35, 100, 90], wardrobe: [320, 165, 90], chair: [275, 357, 180], shelf: [120, 15, 0] } },
    ],
  },
  {
    group: 'Living room', name: 'Living room with home office', hint: '24 m², a wall block makes the L', profile: 'living',
    room: {
      w: 620, l: 420, wall: 24,
      openings: [
        { type: 'door', wall: 'top', pos: 300, width: 95, hinge: 'end' },
        { type: 'balcony', wall: 'left', pos: 120, width: 180, hinge: 'both' },
        { type: 'window', wall: 'bottom', pos: 380, width: 180 },
      ],
      fixtures: [{ type: 'block', x: 420, y: 0, w: 200, d: 100 }, { type: 'radiator', x: 420, y: 410, w: 100, d: 10 }],
    },
    furniture: [
      { id: 'sofa', name: 'Corner sofa', kind: 'sofa', w: 260, d: 170, shape: 'L', leg: [95, 95], color: SEATING },
      { id: 'coffee', name: 'Coffee table', kind: 'custom', w: 110, d: 60, h: 45, color: WORK },
      { id: 'tv', name: 'TV', kind: 'television', w: 145, d: 30, h: 130, color: SCREEN },
      { id: 'desk', name: 'Desk', kind: 'table', w: 160, d: 80, color: WORK },
      { id: 'shelf', name: 'Bookcase', kind: 'shelf', w: 160, d: 35, h: 200, color: STORE },
      { id: 'board', name: 'Sideboard', kind: 'custom', w: 140, d: 45, h: 80, clear: 40, color: OTHER },
    ],
    layouts: [
      { name: 'Office in the niche', idea: ['The desk takes the end of the room, the sofa keeps the view to the balcony.'],
        place: { sofa: [200, 335, 180], coffee: [260, 265, 0], tv: [225, 15, 0], desk: [580, 270, 90], shelf: [530, 118, 0], board: [70, 22, 0] } },
      { name: 'Sofa to the window', idea: ['The sofa moves to the bright end, work moves next to the balcony.'],
        place: { sofa: [480, 325, 180], coffee: [530, 270, 0], tv: [510, 115, 0], desk: [90, 380, 0], shelf: [220, 18, 0], board: [70, 22, 0] } },
      { name: 'Room in two halves', idea: ['A sideboard behind the sofa divides living and working.'],
        place: { sofa: [200, 335, 180], coffee: [260, 265, 0], tv: [225, 15, 0], desk: [580, 270, 90], shelf: [530, 118, 0], board: [355, 335, 270] } },
      { name: 'Desk at the balcony', idea: ['Work with the most daylight, and the sofa turned to the wide wall.'],
        place: { desk: [85, 40, 0], sofa: [480, 325, 180], coffee: [530, 270, 0], tv: [510, 115, 0], shelf: [90, 402, 0], board: [270, 398, 180] } },
    ],
  },
  {
    group: 'Bedroom', name: 'Bedroom', hint: '13 m², a double bed and a wide wardrobe', profile: 'sleep',
    room: {
      w: 380, l: 340, wall: 16,
      openings: [
        { type: 'door', wall: 'left', pos: 40, width: 85, hinge: 'end' },
        { type: 'window', wall: 'top', pos: 100, width: 180 },
      ],
      fixtures: [{ type: 'radiator', x: 150, y: 0, w: 80, d: 10 }],
    },
    furniture: [
      { id: 'bed', name: 'Double bed', kind: 'bed', w: 140, d: 200, color: BED },
      { id: 'night1', name: 'Bedside table', kind: 'custom', w: 45, d: 40, h: 55, color: OTHER },
      { id: 'night2', name: 'Bedside table 2', kind: 'custom', w: 45, d: 40, h: 55, color: OTHER },
      { id: 'wardrobe', name: 'Mirror wardrobe', kind: 'wardrobe', w: 160, d: 60, h: 220, doors: 3, mirror: true, color: STORE },
      { id: 'chest', name: 'Chest of drawers', kind: 'custom', w: 80, d: 45, h: 85, clear: 40, color: OTHER },
    ],
    layouts: [
      { name: 'Bed in the corner', idea: ['The head and one side rest against walls, the floor stays in one piece.'],
        place: { bed: [280, 270, 90], night1: [358, 180, 0], wardrobe: [80, 310, 180], chest: [357, 90, 90] } },
      { name: 'Bed in the middle of the wall', idea: ['Both sides of the bed stay free, with a table on each.'],
        place: { bed: [280, 170, 90], night1: [358, 80, 0], night2: [358, 260, 0], wardrobe: [80, 310, 180], chest: [285, 318, 180] } },
      { name: 'Wardrobe facing the bed', idea: ['Shows what a mirror opposite the bed does to the score.'],
        place: { bed: [280, 270, 90], night1: [358, 180, 0], wardrobe: [30, 240, 270], chest: [357, 90, 90] } },
    ],
  },
  {
    group: 'Home office', name: 'Study with a corner column', hint: '18 m², a column fills one corner', profile: 'balanced',
    room: {
      w: 470, l: 380, wall: 30,
      openings: [
        { type: 'door', wall: 'top', pos: 360, width: 85, hinge: 'end' },
        { type: 'window', wall: 'bottom', pos: 170, width: 150 },
        { type: 'window', wall: 'right', pos: 120, width: 130 },
      ],
      fixtures: [{ type: 'column', x: 0, y: 335, w: 45, d: 45 }, { type: 'radiator', x: 460, y: 135, w: 10, d: 100 }],
    },
    furniture: [
      { id: 'bed', name: 'Day bed', kind: 'bed', w: 90, d: 200, color: BED },
      { id: 'desk', name: 'Desk', kind: 'table', w: 140, d: 70, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 110, d: 60, h: 210, doors: 2, mirror: false, color: STORE },
      { id: 'shelf', name: 'Bookcase', kind: 'shelf', w: 100, d: 35, h: 200, color: STORE },
      { id: 'chair', name: 'Armchair', kind: 'sofa', w: 85, d: 85, color: SEATING },
    ],
    layouts: [
      { name: 'Desk in the bright corner', idea: ['The desk takes the corner between the windows, the bed the quiet wall.'],
        place: { bed: [45, 100, 0], wardrobe: [30, 255, 270], shelf: [95, 362, 180], desk: [395, 345, 180], chair: [195, 43, 0] } },
      { name: 'Bed against the column', idea: ['The column becomes the headboard, the bed lies under the window.'],
        place: { bed: [145, 335, 270], wardrobe: [30, 90, 270], shelf: [18, 210, 270], desk: [395, 345, 180], chair: [205, 43, 0] } },
      { name: 'Wardrobe as a screen', idea: ['A wardrobe in the room screens the bed and hides the door from it.'],
        place: { bed: [45, 100, 0], wardrobe: [175, 60, 90], shelf: [95, 362, 180], desk: [395, 345, 180], chair: [255, 337, 180] } },
    ],
  },
  {
    group: 'Bedroom', name: 'Long bedroom with a chimney', hint: '21 m², long and narrow, a chimney in a corner',
    profile: 'balanced',
    room: {
      w: 368, l: 565, wall: 20,
      openings: [
        { type: 'door', wall: 'right', pos: 70, width: 86, hinge: 'start' },
        { type: 'balcony', wall: 'bottom', pos: 54, width: 218, hinge: 'both' },
      ],
      fixtures: [{ type: 'chimney', x: 318, y: 0, w: 50, d: 50 }, { type: 'radiator', x: 280, y: 545, w: 80, d: 20 }],
    },
    furniture: [
      { id: 'bed', name: 'Double bed', kind: 'bed', w: 146, d: 206, color: BED },
      { id: 'sofa', name: 'Sofa', kind: 'sofa', w: 131, d: 79, color: SEATING },
      { id: 'chaise', name: 'Chaise longue', kind: 'sofa', w: 68, d: 142, color: SEATING },
      { id: 'desk', name: 'Desk', kind: 'table', w: 157, d: 80, color: WORK },
      { id: 'desk2', name: 'Small desk', kind: 'table', w: 140, d: 74, color: WORK },
      { id: 'tv', name: 'TV on a media board', kind: 'television', w: 120, d: 45, h: 120, color: SCREEN },
      { id: 'wardrobe', name: 'Mirror wardrobe', kind: 'wardrobe', w: 117, d: 50, h: 220, doors: 3, mirror: true, color: STORE },
      { id: 'shelf', name: 'Open shelf', kind: 'shelf', w: 80, d: 38, h: 180, color: STORE },
    ],
    layouts: [
      { name: 'Desk at the window', idea: ['Both desks get daylight, the bed sleeps at the far end.'],
        place: { bed: [73, 103, 0], wardrobe: [208.5, 25, 0], tv: [22.5, 273, 270], sofa: [328.5, 295.5, 90], chaise: [297, 196, 90],
          desk: [328, 466.5, 90], desk2: [37, 406, 270], shelf: [19, 520, 270] } },
      { name: 'Sofa at the window', idea: ['Sit and look out: the sofa takes the light, the desks move nearer the door.'],
        place: { bed: [73, 103, 0], wardrobe: [208.5, 25, 0], desk2: [37, 278, 270], tv: [22.5, 409, 270], shelf: [19, 511, 270],
          desk: [328, 248.5, 90], sofa: [328.5, 470, 90], chaise: [297, 370, 90] } },
      { name: 'Desk as a divider', idea: ['A desk across the room faces the window and screens off the living part.'],
        place: { bed: [73, 103, 0], wardrobe: [208.5, 25, 0], desk2: [37, 278, 270], shelf: [349, 355, 90], chaise: [334, 236, 0],
          desk: [130, 420, 180], tv: [22.5, 491, 270], sofa: [328.5, 470, 90] } },
    ],
  },
  {
    group: 'Living room', name: 'Narrow living room with two doors', hint: '19 m², three metres wide, two doors',
    profile: 'living',
    room: {
      w: 300, l: 640, wall: 24,
      openings: [
        { type: 'door', wall: 'top', pos: 180, width: 90, hinge: 'end', name: 'Entrance' },
        { type: 'door', wall: 'left', pos: 300, width: 85, hinge: 'start', name: 'Kitchen door' },
        { type: 'balcony', wall: 'bottom', pos: 70, width: 160, hinge: 'both' },
        { type: 'window', wall: 'right', pos: 120, width: 130 },
      ],
      fixtures: [{ type: 'radiator', x: 290, y: 135, w: 10, d: 100 }],
    },
    furniture: [
      { id: 'sofa', name: 'Sofa', kind: 'sofa', w: 210, d: 90, color: SEATING },
      { id: 'chair', name: 'Armchair', kind: 'sofa', w: 80, d: 85, color: SEATING },
      { id: 'coffee', name: 'Coffee table', kind: 'custom', w: 100, d: 55, h: 45, color: WORK },
      { id: 'tv', name: 'TV on a media board', kind: 'television', w: 160, d: 45, h: 120, color: SCREEN },
      { id: 'shelf', name: 'Bookcase', kind: 'shelf', w: 100, d: 35, h: 200, color: STORE },
      { id: 'table', name: 'Dining table', kind: 'custom', w: 120, d: 80, h: 75, color: WORK },
    ],
    layouts: [
      { name: 'TV on the long wall', idea: ['Sofa and TV face each other across the room, dining by the entrance.'],
        place: { sofa: [255, 465, 90], tv: [22.5, 465, 270], coffee: [172.5, 465, 90], chair: [247.5, 185, 90],
          table: [80, 160, 0], shelf: [80, 17.5, 0] } },
      { name: 'Sofa facing the balcony', idea: ['The sofa looks out to the balcony, the armchair keeps the TV.'],
        place: { sofa: [105, 470, 0], coffee: [105, 550, 0], tv: [22.5, 200, 270], chair: [255, 280, 90],
          table: [80, 80, 0], shelf: [80, 17.5, 0] } },
    ],
  },
  {
    group: 'Bedroom', name: 'Bedroom with a bed alcove', hint: '11 m², the bed fits into an alcove',
    profile: 'sleep',
    room: {
      w: 400, l: 330, wall: 20,
      openings: [
        { type: 'door', wall: 'left', pos: 200, width: 85, hinge: 'end' },
        { type: 'window', wall: 'bottom', pos: 120, width: 160 },
      ],
      fixtures: [
        { type: 'block', x: 0, y: 0, w: 60, d: 100 }, { type: 'block', x: 280, y: 0, w: 120, d: 100 },
        { type: 'radiator', x: 140, y: 320, w: 120, d: 10 },
      ],
    },
    furniture: [
      { id: 'bed', name: 'Double bed', kind: 'bed', w: 140, d: 200, color: BED },
      { id: 'night1', name: 'Bedside table', kind: 'custom', w: 40, d: 40, h: 55, color: OTHER },
      { id: 'night2', name: 'Bedside table 2', kind: 'custom', w: 40, d: 40, h: 55, color: OTHER },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 145, d: 60, h: 220, doors: 3, mirror: false, color: STORE },
      { id: 'chest', name: 'Chest of drawers', kind: 'custom', w: 90, d: 45, h: 85, clear: 40, color: OTHER },
      { id: 'chair', name: 'Armchair', kind: 'sofa', w: 75, d: 80, color: SEATING },
    ],
    layouts: [
      { name: 'Bed in the alcove', idea: ['The alcove holds the bed and both bedside tables like a built-in.'],
        place: { bed: [170, 100, 0], night1: [80, 20, 0], night2: [260, 20, 0], wardrobe: [370, 172.5, 90],
          chest: [345, 307.5, 180], chair: [190, 280, 0] } },
      { name: 'Wardrobe in the alcove', idea: ['The alcove becomes a walk-in closet, the bed moves into the room.'],
        place: { wardrobe: [170, 30, 0], bed: [300, 205, 90], night1: [380, 295, 0], chest: [22.5, 150, 270], chair: [130, 280, 0] } },
    ],
  },
  {
    group: 'Kids room', name: 'Kids room with a bunk bed', hint: '9.5 m², small and deep, a bunk bed for two',
    profile: 'balanced',
    room: {
      w: 250, l: 380, wall: 16,
      openings: [
        { type: 'door', wall: 'top', pos: 150, width: 80, hinge: 'end' },
        { type: 'window', wall: 'bottom', pos: 60, width: 130 },
      ],
      fixtures: [{ type: 'radiator', x: 70, y: 370, w: 110, d: 10 }],
    },
    furniture: [
      { id: 'bed', name: 'Bunk bed', kind: 'bed', w: 90, d: 200, h: 160, color: BED },
      { id: 'desk', name: "Children's desk", kind: 'table', w: 90, d: 55, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 100, d: 55, h: 190, doors: 2, mirror: false, color: STORE },
      { id: 'shelf', name: 'Toy shelf', kind: 'shelf', w: 100, d: 30, h: 80, color: STORE },
      { id: 'play', name: 'Play table', kind: 'custom', w: 60, d: 60, h: 50, color: OTHER },
    ],
    layouts: [
      { name: 'Play floor in the middle', idea: ['Everything stands at the walls, so the floor stays free for playing.'],
        place: { bed: [45, 100, 0], wardrobe: [222.5, 140, 90], desk: [222.5, 315, 90], shelf: [15, 270, 270], play: [110, 280, 0] } },
      { name: 'Desk at the window', idea: ['Homework in daylight, with the play table next to the bunk bed.'],
        place: { bed: [45, 100, 0], wardrobe: [222.5, 140, 90], desk: [125, 342.5, 0], shelf: [235, 300, 90], play: [30, 240, 0] } },
    ],
  },
  {
    group: 'Kids room', name: 'Room for two kids', hint: '15 m², two windows, a chimney between',
    profile: 'balanced',
    room: {
      w: 420, l: 360, wall: 24,
      openings: [
        { type: 'door', wall: 'left', pos: 30, width: 85, hinge: 'start' },
        { type: 'window', wall: 'top', pos: 60, width: 110 },
        { type: 'window', wall: 'top', pos: 250, width: 110 },
      ],
      fixtures: [
        { type: 'chimney', x: 185, y: 315, w: 50, d: 45 },
        { type: 'radiator', x: 75, y: 0, w: 80, d: 10 }, { type: 'radiator', x: 265, y: 0, w: 80, d: 10 },
      ],
    },
    furniture: [
      { id: 'bed1', name: 'Single bed', kind: 'bed', w: 90, d: 200, color: BED },
      { id: 'bed2', name: 'Single bed 2', kind: 'bed', w: 90, d: 200, color: BED },
      { id: 'desk1', name: "Children's desk", kind: 'table', w: 90, d: 55, color: WORK },
      { id: 'desk2', name: "Children's desk 2", kind: 'table', w: 90, d: 55, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 100, d: 55, h: 190, doors: 2, mirror: false, color: STORE },
      { id: 'shelf', name: 'Toy shelf', kind: 'shelf', w: 100, d: 30, h: 80, color: STORE },
    ],
    layouts: [
      { name: 'A half for each', idea: ['Each child gets a bed, a desk and a window, the chimney marks the middle.'],
        place: { bed1: [45, 260, 180], bed2: [375, 260, 180], desk1: [135, 37.5, 0], desk2: [270, 37.5, 0],
          wardrobe: [392.5, 90, 90], shelf: [210, 300, 180] } },
      { name: 'Sleeping side, playing side', idea: ['Both beds share the quiet wall, the other half is for desks and play.'],
        place: { bed1: [45, 260, 180], bed2: [140, 260, 180], desk1: [305, 37.5, 0], desk2: [392.5, 200, 90],
          wardrobe: [370, 332.5, 180], shelf: [206, 15, 0] } },
    ],
  },
  {
    group: 'One-room flat', name: 'Narrow studio with a bathroom block', hint: '21 m², the bathroom block makes an L',
    profile: 'studio',
    room: {
      w: 320, l: 760, wall: 24,
      openings: [
        { type: 'door', wall: 'top', pos: 200, width: 90, hinge: 'end', name: 'Entrance' },
        { type: 'balcony', wall: 'bottom', pos: 40, width: 100, hinge: 'start' },
        { type: 'window', wall: 'bottom', pos: 180, width: 110 },
      ],
      fixtures: [{ type: 'block', x: 0, y: 0, w: 170, d: 210 }, { type: 'radiator', x: 190, y: 750, w: 90, d: 10 }],
    },
    furniture: [
      { id: 'bed', name: 'Bed', kind: 'bed', w: 140, d: 200, color: BED },
      { id: 'sofa', name: 'Sofa', kind: 'sofa', w: 180, d: 85, color: SEATING },
      { id: 'tv', name: 'TV on a media board', kind: 'television', w: 140, d: 40, h: 110, color: SCREEN },
      { id: 'desk', name: 'Desk', kind: 'table', w: 120, d: 60, color: WORK },
      { id: 'wardrobe', name: 'Wardrobe', kind: 'wardrobe', w: 100, d: 60, h: 220, doors: 2, mirror: false, color: STORE },
      { id: 'table', name: 'Dining table', kind: 'custom', w: 80, d: 80, h: 75, shape: 'round', color: WORK },
    ],
    layouts: [
      { name: 'Sleep at the back', idea: ['The bed hides behind the bathroom, living and dining take the light.'],
        place: { bed: [70, 310, 0], wardrobe: [290, 150, 90], desk: [290, 690, 90], sofa: [42.5, 520, 270], tv: [300, 520, 90],
          table: [190, 310, 0] } },
      { name: 'Bed under the window', idea: ['Wake up in daylight, the sofa and TV move to the middle of the room.'],
        place: { bed: [250, 650, 180], wardrobe: [290, 150, 90], desk: [290, 480, 90], sofa: [42.5, 330, 270], tv: [300, 330, 90],
          table: [60, 480, 0] } },
    ],
  },
])(DEMO_COLORS);

// A browser without any project starts with the first demo room
const STARTER_PROJECT = { ...DEMO_ROOMS[0], name: 'Starter room' };
