'use strict';
// ---------------------------------------------------------------------------
// SOUL DRIFT — shared constants and data tables
// ---------------------------------------------------------------------------

const TILE = 16;
const ZOOM = 2;                       // world pixels are drawn 2x; UI is drawn 1:1
const VIEW_W = 640, VIEW_H = 360;     // visible world area in world pixels
const GAME_W = VIEW_W * ZOOM, GAME_H = VIEW_H * ZOOM;

const FONT_DISPLAY = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';
const FONT_BODY = '"Zen Kaku Gothic New", "Hiragino Sans", "Segoe UI", system-ui, sans-serif';

// Tile indices inside every generated tileset
const T = { SOLID: 0, TOP: 1, ONEWAY: 2, SPIKE: 3, KIDO: 4, GATE: 5, CRACK: 6, BANKAI: 7, HIDDEN: 8, LOCK: 9, COLLAPSE: 10 };
const SOLID_INDEXES = [T.SOLID, T.TOP, T.KIDO, T.GATE, T.CRACK, T.BANKAI, T.LOCK, T.COLLAPSE];

// Movement tuning (pixels / seconds). Jump ≈ 4.6 tiles high, ≈ 6.5 tiles long.
const PHYS = {
  gravity: 1500,
  maxFall: 520,
  runSpeed: 150,
  accelGround: 1700,
  decelGround: 2200,
  accelAir: 1150,
  jumpVel: 490,
  jumpCut: 0.42,          // velocity multiplier when jump is released early
  coyote: 0.1,
  jumpBuffer: 0.13,
  dashSpeed: 420,
  dashTime: 0.17,
  dashCooldown: 0.42,
  wallSlide: 150,
  wallClimb: 85,
  wallJumpX: 190,
  wallJumpY: 430,
  wallJumpLock: 0.16,
  doubleJumpVel: 455,
  burstSpeed: 560,
  burstCharge: 0.55,
  popUp: 600,             // upward boost when entering a room from below
};

const COMBAT = {
  slashDamage: 5,
  slashCooldown: 0.34,
  bankaiSlashCooldown: 0.22,
  reiatsuPerHit: 11,
  maxReiatsu: 99,
  spellCost: 33,
  hadoDamage: 15,
  bakudoDamage: 6,
  healTime: 0.95,
  quickHealTime: 0.55,
  bankaiDuration: 22,
  bankaiRegen: 6,
  hollowRise: 5.5,        // hidden meter per second while the mask is on
  hollowPerHit: 3,
  hollowDecay: 7,
  shardValue: 5,
  getsugaCost: 22,
  getsugaCharge: 0.55,
  raikoCost: 66,          // Hado #63 costs two thirds of the vessel
  raikoDamage: 42,
  raikoRadius: 58,
  getsugaDamage: 18,
  swordBonus: 2,          // extra slash damage per forge level
};

// Swordsmith upgrades: cost of each level of the Zanpakuto's edge
// What enemies do to each other: melee swings, projectiles, charges and beams
const FRIENDLY = { melee: 9, shot: 16, charge: 14, beam: 18 };

const FORGE = [
  { reishi: 120, ore: 0 },
  { reishi: 250, ore: 1 },
  { reishi: 450, ore: 2 },
];

const ABILITIES = {
  dash:   { name: 'Black Step', key: '{dash}', desc: 'A burst of flash-step speed. Usable once in midair, refreshed when you land or grip a wall.' },
  hado:   { name: 'Kido: Hado', key: '{kido}', desc: 'Spend 33 Reiatsu to hurl a crimson blast that pierces enemies and shatters violet Kido seals.' },
  raiko:  { name: 'Hado #63: Raikōhō', key: '{down} + {kido}', desc: 'Spend 66 Reiatsu to loose a great bolt that bursts on impact, hurting everything around it. Learned by facing the Rogue Captain.' },
  grip:   { name: 'Reiatsu Grip', key: 'Hold {left} or {right} against a wall', desc: 'Cling to walls with spiritual pressure. Hold {up} to climb, press {jump} to leap away.' },
  bakudo: { name: 'Kido: Bakudo', key: '{up} + {kido}', desc: 'Spend 33 Reiatsu to bind the nearest enemy or moving platform in golden chains.' },
  wings:  { name: 'Hirenkyaku Wings', key: '{jump} in midair', desc: 'Step on condensed reishi for a second jump.' },
  getsuga: { name: 'Getsuga Tenshō', key: 'Hold {attack}, then release', desc: 'Pour Reiatsu into the blade and loose it as a crescent that cuts through everything in a line. Costs 22 Reiatsu.' },
  konso:  { name: 'Konso Blade', key: 'Hold {konso}', desc: 'Strike with the hilt to read memories and draw out Reiatsu. Grants true sight: hidden platforms appear.' },
  burst:  { name: 'Senkaimon Burst', key: 'Hold {burst} on ground or wall, then release', desc: 'Tear a gate open and rocket forward. Smashes Senkaimon barriers. Press {jump} to stop early.' },
  bankai: { name: 'Bankai', key: '{bankai} with a full Reiatsu vessel', desc: 'Release your final form: faster, longer strikes that throw crescent waves, and Reiatsu that refills on its own.' },
  hollow: { name: 'Hollow Mask', key: '{mask}', desc: 'Don the mask for raw power and speed. Something inside you is keeping count.' },
};
const ABILITY_ORDER = ['dash', 'hado', 'raiko', 'grip', 'bakudo', 'wings', 'getsuga', 'konso', 'burst', 'bankai', 'hollow'];

const SEALS = {
  edge:    { name: 'Whetted Edge', cost: 2, desc: 'Slash damage +40%.' },
  swift:   { name: 'Swift Step', cost: 1, desc: 'Black Step recovers twice as fast.' },
  harvest: { name: 'Spirit Harvest', cost: 1, desc: 'Gain 50% more Reiatsu from strikes.' },
  focus:   { name: 'Kido Focus', cost: 2, desc: 'Kido damage +50%. Bakudo binds for longer.' },
  quick:   { name: 'Quick Suppression', cost: 2, desc: 'Heal almost twice as fast.' },
  magnet:  { name: 'Reishi Magnet', cost: 1, desc: 'Reishi shards drift toward you.' },
  long:    { name: 'Long Reach', cost: 2, desc: 'Slash range +35%.' },
  grace:   { name: 'Grace of the Departed', cost: 2, desc: 'Standing still slowly restores health.' },
  moonfang: { name: 'Moon Fang', cost: 1, desc: 'Getsuga Tenshō charges faster and costs less Reiatsu.' },
  phantom: { name: 'Phantom Step', cost: 2, desc: 'Nothing can touch you during a Black Step.' },
  will:    { name: 'Unbreakable Will', cost: 3, desc: 'One extra mask of health while equipped.' },
  recall:  { name: 'Soul Recall', cost: 1, desc: 'The Konso Blade works faster and draws out more Reiatsu.' },
};

// Things the shop sells that are neither seals nor fragments
const TOOLS = {
  compass: { name: 'Pin Compass', desc: 'Marks every power, seal, fragment, ore and Lost Plus you have not found yet on the map, in every room you have visited.' },
};

const SHOP_STOCK = [
  { type: 'seal', id: 'magnet', price: 80 },
  { type: 'seal', id: 'swift', price: 150 },
  { type: 'seal', id: 'quick', price: 220 },
  { type: 'tool', id: 'compass', price: 180 },
  { type: 'fragment', id: 'shop', price: 300 },
];

const REGIONS = {
  kar: { name: 'Karakura Town', sub: 'Where the living walk unaware', color: 0x8d7bd6, dark: 0 },
  ruk: { name: 'Rukongai', sub: 'The forgotten districts of the dead', color: 0xd8a35a, dark: 0 },
  sei: { name: 'Seireitei Depths', sub: 'Barracks of the Court Guard', color: 0xe8e2d0, dark: 0 },
  sok: { name: 'Sokyoku Hill', sub: 'The execution grounds', color: 0xd0504a, dark: 0 },
  hm:  { name: 'Hueco Mundo', sub: 'Endless night, white sand', color: 0xb8c4dc, dark: 0.85 },
  end: { name: 'Silbern Endpoint', sub: 'Where the drift ends', color: 0x7fd4ff, dark: 0.35 },
  dan: { name: 'The Dangai', sub: 'The Precipice World between worlds', color: 0x9a7ad8, dark: 0.3 },
  for: { name: 'Forest of Menos', sub: 'Beneath the white sand', color: 0x6a8a7a, dark: 0.72 },
};

// What the ground sounds like underfoot in each region
const REGION_SURFACE = { kar: 'stone', ruk: 'dirt', sei: 'stone', sok: 'dirt', hm: 'sand', end: 'crystal', dan: 'ether', for: 'sand' };


// notches: health fractions where the fight changes phase (drawn on the boss bar)
const BOSSES = {
  menos:   { name: 'Menos Grande', title: 'Hollow of a Thousand Faces', notches: [0.5] },
  captain: { name: 'Rogue Captain Kurogane', title: 'Deserter of the Ninth Division', notches: [0.5] },
  vasto:   { name: 'Vasto Lorde', title: 'Sovereign of the Sand', notches: [0.6, 0.25] },
  final:   { name: 'The Fallen Vizard', title: 'What You Could Become', notches: [0.66, 0.33] },
  espada:  { name: 'Espada of the Unseen', title: 'Hidden Among the Menos', notches: [0.5] },
};

const MEMORIES = {
  thug: ['"Just one more meal. Just one more day."', '"Nobody remembers my name, so I took theirs."'],
  shini: ['"I swore an oath. Then the orders stopped making sense."', '"My captain left. I stayed. I am still waiting."'],
  hollow: ['"So hungry. Why is my chest so empty?"', '"I was a baker. I think. Bread smelled warm."'],
  adjuchas: ['"I ate the others so they could not eat me. Now I cannot stop."'],
  arrancar: ['"I tore off my mask to become more. I am still nothing."', '"Do you see me? Most never do."'],
  menos: ['"We are many. We remember being many people."'],
  captain: ['"I left the Gotei to find something worth protecting. I found only you."'],
  vasto: ['"I devoured my way to the top. The top is silent."'],
  final: ['"I am the one who never took the mask off."'],
  gillian: ['"We were hundreds once. Now we are one, and still hungry."', '"Do not look up. The light hurts."'],
  espada: ['"I hid here so long I forgot what I was hiding from."'],
  caster: ['"I wrote the incantations. Now they write me."', '"Every word I spoke, I meant. That was the mistake."'],
  diver: ['"I only ever wanted to hang quietly, and be forgotten."'],
};

// The old man in Rukongai wants to hear what the dead remember
const QUEST_NAMES = { npc: 'Old Rukongai Resident', need: ['thug', 'shini', 'hollow'], reishi: 200, seal: 'recall' };
