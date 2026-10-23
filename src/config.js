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
  kaidoDiscount: 11,      // Kaidō seal: Reiatsu saved per heal
  bellStep: 0.15,         // Bell of the Eleventh: damage added per quick follow-up strike
  bellMax: 0.6,
  genteiMul: 1.5,         // Gentei Kaijo seal: Bankai lasts this much longer
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
  dash:   { name: 'Shunpo', key: '{dash}', desc: 'Flash Step: a burst of speed too quick for the eye. Usable once in midair, refreshed when you land or grip a wall.' },
  hado:   { name: 'Hadō #31: Shakkahō', key: '{kido}', desc: 'Red Fire Cannon. Spend 33 Reiatsu to hurl a crimson blast that pierces enemies and shatters violet Kidō seals.' },
  raiko:  { name: 'Hadō #63: Raikōhō', key: '{down} + {kido}', desc: 'Thunder Roar Cannon. Spend 66 Reiatsu to loose a great bolt that bursts on impact, hurting everything around it.' },
  grip:   { name: 'Reiatsu Grip', key: 'Hold {left} or {right} against a wall', desc: 'Cling to walls with spiritual pressure. Hold {up} to climb, press {jump} to leap away.' },
  bakudo: { name: 'Bakudō #61: Rikujōkōrō', key: '{up} + {kido}', desc: 'Six Rods Prison of Light. Spend 33 Reiatsu to pin the nearest enemy or moving platform in bars of golden light.' },
  wings:  { name: 'Hirenkyaku', key: '{jump} in midair', desc: 'Gather reishi under your feet and step off the air itself for a second jump.' },
  getsuga: { name: 'Getsuga Tenshō', key: 'Hold {attack}, then release', desc: 'Moon Fang Heaven-Piercer. Pour Reiatsu into the blade and loose it as a crescent that cuts through everything in a line. Costs 22 Reiatsu.' },
  konso:  { name: 'Konsō', key: 'Hold {konso}', desc: 'Soul Burial. Strike with the hilt to read the memories of the dead, send lost souls on, and draw out Reiatsu. Unseen things show themselves.' },
  burst:  { name: 'Senkaimon Burst', key: 'Hold {burst} on ground or wall, then release', desc: 'Tear the air open like a Garganta and rocket forward. Smashes sealed Senkaimon. Press {jump} to stop early.' },
  bankai: { name: 'Bankai: Tensa Zangetsu', key: '{bankai} with a full Reiatsu vessel', desc: 'The final release. A black blade, faster and longer strikes that throw crescent waves, and Reiatsu that refills on its own.' },
  hollow: { name: 'Hollow Mask', key: '{mask}', desc: 'Hollowfication. Don the mask for raw power and speed. Something inside you is keeping count.' },
};
const ABILITY_ORDER = ['konso', 'dash', 'hado', 'grip', 'bakudo', 'wings', 'raiko', 'burst', 'bankai', 'getsuga', 'hollow'];

const SEALS = {
  edge:    { name: 'Whetted Edge', cost: 2, desc: 'Slash damage +40%.' },
  swift:   { name: 'Shunpo Mastery', cost: 1, desc: 'Shunpo recovers twice as fast.' },
  harvest: { name: 'Spirit Harvest', cost: 1, desc: 'Gain 50% more Reiatsu from strikes.' },
  focus:   { name: 'Kidō Focus', cost: 2, desc: 'Kidō damage +50%. Bakudō binds for longer.' },
  quick:   { name: 'Quick Suppression', cost: 2, desc: 'Heal almost twice as fast.' },
  magnet:  { name: 'Reishi Magnet', cost: 1, desc: 'Reishi shards drift toward you.' },
  long:    { name: 'Long Reach', cost: 2, desc: 'Slash range +35%.' },
  grace:   { name: 'Grace of the Departed', cost: 2, desc: 'Standing still slowly restores health.' },
  moonfang: { name: 'Moon Fang', cost: 1, desc: 'Getsuga Tenshō charges faster and costs less Reiatsu.' },
  phantom: { name: 'Utsusemi', cost: 2, desc: 'Leave only an afterimage behind: nothing can touch you during Shunpo.' },
  will:    { name: 'Unbreakable Will', cost: 3, desc: 'One extra mask of health while equipped.' },
  recall:  { name: 'Soul Recall', cost: 1, desc: 'Konsō works faster and draws out more Reiatsu.' },
  kaido:   { name: 'Kaidō', cost: 1, desc: 'The Fourth Division\'s healing arts: each mask you heal costs 11 less Reiatsu.' },
  bell:    { name: 'Bell of the Eleventh', cost: 2, desc: 'Strikes landed in quick succession hit harder, up to +60%.' },
  shunko:  { name: 'Shunkō', cost: 2, desc: 'Flash War Cry: Shunpo cuts through every enemy in its path.' },
  hierro:  { name: 'Hierro', cost: 2, desc: 'Skin of steel: blows no longer knock you back, and every fourth one is shrugged off.' },
  gentei:  { name: 'Gentei Kaijo', cost: 2, desc: 'Limit release: Bankai lasts half again as long.' },
};

// Things the shop sells that are neither seals nor fragments
const TOOLS = {
  compass: { name: 'Pin Compass', desc: 'Marks every power, seal, fragment, ore and Lost Plus you have not found yet on the map, in every room you have visited.' },
};

const SHOP_STOCK = [
  { type: 'seal', id: 'magnet', price: 80 },
  { type: 'seal', id: 'swift', price: 150 },
  { type: 'tool', id: 'compass', price: 180 },
  { type: 'seal', id: 'quick', price: 220 },
  { type: 'fragment', id: 'shop', price: 300 },
  { type: 'seal', id: 'gentei', price: 650 },
];

// kanji: the region's name in Japanese, shown on its title card and on the map
const REGIONS = {
  kar: { name: 'Karakura Town', sub: 'Where the living walk unaware', kanji: '空座町', color: 0x8d7bd6, dark: 0 },
  ruk: { name: 'Rukongai', sub: 'The wandering souls\' districts', kanji: '流魂街', color: 0xd8a35a, dark: 0 },
  sei: { name: 'Seireitei', sub: 'Court of Pure Souls, home of the Gotei 13', kanji: '瀞霊廷', color: 0xe8e2d0, dark: 0 },
  sok: { name: 'Sōkyoku Hill', sub: 'The execution grounds', kanji: '双殛の丘', color: 0xd0504a, dark: 0 },
  hm:  { name: 'Hueco Mundo', sub: 'Endless night, white sand', kanji: '虚圏', color: 0xb8c4dc, dark: 0.85 },
  end: { name: 'The Inner World', sub: 'Sideways towers under an endless sky', kanji: '精神世界', color: 0x7fb4e8, dark: 0 },
  dan: { name: 'The Dangai', sub: 'The Precipice World between worlds', kanji: '断界', color: 0x9a7ad8, dark: 0.3 },
  for: { name: 'Forest of Menos', sub: 'Beneath the white sand', kanji: '大虚の森', color: 0x6a8a7a, dark: 0.72 },
};

// What the ground sounds like underfoot in each region
const REGION_SURFACE = { kar: 'stone', ruk: 'dirt', sei: 'stone', sok: 'dirt', hm: 'sand', end: 'crystal', dan: 'ether', for: 'sand' };


// notches: health fractions where the fight changes phase (drawn on the boss bar). jp: the name in Japanese.
// `espada` is Aaroniero and `final` the Hollow within: those ids are kept so old saves still know them.
const BOSSES = {
  fisher:    { name: 'Grand Fisher', title: 'The Hollow Who Hunts With a Lure', jp: 'グランドフィッシャー', notches: [0.5] },
  menos:     { name: 'Menos Grande', title: 'Hollow of a Thousand Faces', jp: '大虚', notches: [0.5] },
  renji:     { name: 'Renji Abarai', title: 'Lieutenant of the Sixth Division', jp: '阿散井恋次', notches: [0.5] },
  kenpachi:  { name: 'Kenpachi Zaraki', title: 'Captain of the Eleventh Division', jp: '更木剣八', notches: [0.5] },
  byakuya:   { name: 'Byakuya Kuchiki', title: 'Captain of the Sixth Division', jp: '朽木白哉', notches: [0.55, 0.22] },
  grimmjow:  { name: 'Grimmjow Jaegerjaquez', title: 'Sexta Espada', jp: 'グリムジョー', notches: [0.5] },
  vasto:     { name: 'Vasto Lorde', title: 'Sovereign of the Sand', jp: '最上級大虚', notches: [0.6, 0.25] },
  ulquiorra: { name: 'Ulquiorra Cifer', title: 'Cuarta Espada', jp: 'ウルキオラ', notches: [0.6, 0.3] },
  espada:    { name: 'Aaroniero Arruruerie', title: 'Noveno Espada, Hidden Among the Menos', jp: 'アーロニーロ', notches: [0.5] },
  final:     { name: 'Hollow Ichigo', title: 'The White One Within', jp: '内なる虚', notches: [0.66, 0.33] },
};

const MEMORIES = {
  thug: ['"Just one more meal. Just one more day."', '"Nobody remembers my name, so I took theirs."'],
  shini: ['"I swore an oath. Then the orders stopped making sense."', '"My captain left. I stayed. I am still waiting."'],
  hollow: ['"So hungry. Why is my chest so empty?"', '"I was a baker. I think. Bread smelled warm."'],
  adjuchas: ['"I ate the others so they could not eat me. Now I cannot stop."'],
  arrancar: ['"I tore off my mask to become more. I am still nothing."', '"Do you see me? Most never do."'],
  menos: ['"We are many. We remember being many people."'],
  vasto: ['"I devoured my way to the top. The top is silent."'],
  final: ['"I am the one who never took the mask off."', '"King and horse. Which one are you?"'],
  gillian: ['"We were hundreds once. Now we are one, and still hungry."', '"Do not look up. The light hurts."'],
  espada: ['"I wear a dead man\'s face because I forgot my own."', '"The light never reaches my palace. I made sure of it."'],
  caster: ['"I wrote the incantations. Now they write me."', '"Every word I spoke, I meant. That was the mistake."'],
  diver: ['"I only ever wanted to hang quietly, and be forgotten."'],
  crawler: ['"The river kept my body. I kept the cold."', '"I spit because I can no longer speak."'],
  onmitsu: ['"No name, no face, no grave. That was the contract."', '"I was ordered to watch you. I never stopped."'],
  exequias: ['"We clean up after the Espada. Someone has to."', '"Behind the skull, I am still afraid."'],
  brawler: ['"The captain said a real fight is the only prayer that counts."', '"I lost the fight. I would lose it again, gladly."'],
  fisher: ['"I wore her face to lure them in. I never knew her name."', '"Fifty-four years of hunting. I only ever wanted to be full."'],
  renji: ['"I chased one back for half my life. I will not stop now."', '"Rukia. I am sorry I was too slow."'],
  kenpachi: ['"A fight that ends too soon is the worst kind of loss."'],
  byakuya: ['"I made a promise to the law and a promise to my wife. I kept the wrong one."', '"Pride is a cold blade."'],
  grimmjow: ['"I am the King. I will crush anyone who stands above me."', '"Look at me. LOOK at me."'],
  ulquiorra: ['"The heart. Is that what is in this hand?"', '"I see now. That is what it was."'],
};

// The enemies the Journal keeps a page for, in the order you meet them: [kind, name, what it does]
const BESTIARY = [
  ['hollow', 'Lesser Hollow', 'Winged Hollows that hunt in flocks. They follow the open air around walls to reach you.'],
  ['crawler', 'Acidwire', 'A lizard-shaped Hollow of the riverbanks. It spits a burning arc of acid where you stand.'],
  ['thug', 'Rukongai Ruffian', 'A soul turned hard by hunger. It swings its club once you are close.'],
  ['shini', 'Corrupted Shinigami', 'It guards from the front and is only open after its lunge.'],
  ['caster', 'Kidō Renegade', 'A deserter of the Kidō Corps. It keeps its distance and fires aimed bala.'],
  ['onmitsu', 'Onmitsukidō Agent', 'The Stealth Force. It throws kunai, vanishes, and strikes from behind.'],
  ['brawler', 'Eleventh Division Brawler', 'It only knows forward. Its rush can carry it straight off a ledge.'],
  ['diver', 'Pale Hollow', 'It hangs from ceilings and drops on anything that passes beneath.'],
  ['adjuchas', 'Adjuchas', 'A beast that lowers its head, then charges along the ground.'],
  ['arrancar', 'Numeros Arrancar', 'An Arrancar that fires bala, then steps away with Sonído.'],
  ['exequias', 'Exequias', 'The executioners of Las Noches. They cut through you with Sonído.'],
  ['gillian', 'Gillian', 'A lesser Menos. Slow, sturdy, and its Cero cuts a straight line.'],
  ['fisher', 'Grand Fisher', 'Burrows beneath you, and hunts with the lure on its brow.'],
  ['menos', 'Menos Grande', 'A Gillian of a thousand faces. Stomps, Cero, and a swarm of lesser Hollows.'],
  ['renji', 'Renji Abarai', 'Zabimaru stretches the whole arena. In Bankai, a great bone serpent.'],
  ['kenpachi', 'Kenpachi Zaraki', 'He never stops walking toward you. With the eyepatch off, nothing holds him.'],
  ['byakuya', 'Byakuya Kuchiki', 'Senbonzakura: a storm of blade petals. In Bankai, a thousand blades rise.'],
  ['grimmjow', 'Grimmjow Jaegerjaquez', 'Pounces, claws and Cero. Released, Pantera\'s Desgarrón tears the air.'],
  ['vasto', 'Vasto Lorde', 'Sonído dives, claw rushes and a sweeping Cero over a crumbling throne.'],
  ['ulquiorra', 'Ulquiorra Cifer', 'Cero, Sonído and the Lanza del Relámpago. Released, he takes to the sky.'],
  ['espada', 'Aaroniero Arruruerie', 'Hidden in the dark with a stolen trident. Released, he spits up what he devoured.'],
  ['final', 'Hollow Ichigo', 'Everything you can do, turned against you, and a blade thrown on a chain.'],
];
const BOSS_KINDS = ['fisher', 'menos', 'renji', 'kenpachi', 'byakuya', 'grimmjow', 'vasto', 'ulquiorra', 'espada', 'final'];

// The old man in Rukongai wants to hear what the dead remember
const QUEST_NAMES = { npc: 'Old Man of Junrinan', need: ['thug', 'shini', 'hollow'], reishi: 200, seal: 'recall' };
