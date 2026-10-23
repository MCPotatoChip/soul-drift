# Soul Drift

A Bleach-themed metroidvania built with Phaser 3 from `bleach-metroidvania-spec.md`. Every piece of art, music and sound is generated in code: there are no asset files.

## Run it

Open `index.html` in a browser. No build step and no server needed (Phaser and the fonts load from CDNs, so you need to be online).

To serve it locally instead: `python3 -m http.server 8765`, then open http://localhost:8765.

## Controls

These are the defaults. Every action can be rebound under **Controls** on the title screen or in the pause menu: each action has a key, an alternate key or mouse button, and a gamepad button. Bindings are saved in your browser, and every hint in the game shows the input for the device you are using (keyboard and mouse, or the pad).

| Keyboard | Mouse | Pad (Xbox / PlayStation) | Action |
|---|---|---|---|
| ← → | | Left stick / d-pad | Move |
| Z / Space | | A / ✕ | Jump (hold for height). ↓ + jump drops through planks |
| X | Left click | X / □ | Zanpakutō slash. Hold ↑ or ↓ to aim. A down-slash in the air pogos off enemies and spikes. ↓ + slash on cracked ground strikes down into it. With Getsuga Tenshō, keep holding and release to fire it |
| A (hold) | | LB / L1 | Reiatsu Suppression: heals 1 mask for 33 Reiatsu (22 with the Kaidō seal) |
| C | | RB / R1 | Shunpo (flash step) |
| S | Right click | B / ○ | Kidō: Hadō #31 Shakkahō. ↑ + Kidō casts Bakudō #61 Rikujōkōrō. ↓ + Kidō casts Hadō #63 Raikōhō |
| D (hold) | | Y / △ | Konsō (soul burial with the hilt) |
| V (hold, then release) | | RT / R2 | Senkaimon Burst |
| F | | LT / L2 | Bankai (needs a full Reiatsu vessel) |
| Q | | RS / R3 | Hollow Mask |
| E or ↑ | | ↑ | Interact: rest, talk, shop, send Lost Pluses on |
| M / I / Esc | | View / LS / Menu | Map / Inventory / Pause |

In menus, Enter or the pad's A confirms and Esc or B goes back, whatever the bindings. In the Controls screen, pick a cell with the arrows or d-pad and press Enter or A, then press the new key, click the new mouse button, or press the new pad button. Backspace (or Y) clears an alternate or pad cell. Pads that support it rumble on hits, Bankai and boss blows (Settings, Controller rumble).

## Phones and tablets

The game detects a touch screen and shows an on-screen stick and buttons. Turn your device sideways, or add the page to your home screen for a full-screen app (the ⛶ button also goes full screen where the browser allows it).

- **Stick** (left): move, ↑ aims up and interacts, ↓ aims down and drops through planks.
- **Buttons** (right): Jump, Slash (hold for Getsuga), Shunpo, Kidō, Heal, Konsō, Burst, Bankai, Mask, Use. Map, Bag and Pause sit in the corners. Any number of fingers work at once.
- **Menus**: tap an entry to pick it. A small pad (▲ ▼ OK BACK) appears for menus. In dialogs, tap anywhere to continue.
- **Remap everything**: the ⚙ button (or Pause, then Controls, then Edit touch layout) opens the layout editor. Drag any button to move it, tap it to change what it does or how big it is, add or remove buttons, mirror the layout for left-handed play, and change size and opacity. The layout is saved on the device. Touch buttons press whatever key their action is bound to, so keyboard remapping and touch remapping work together.
- Force the overlay on a desktop with `?touch=1`, or off with `?touch=0`.

## Saves

There are three save slots (**Journeys** on the title screen). Each shows where you are, how complete it is, the time played and deaths, with 討 once the story is finished and 真 once the true ending has been seen. From a slot you can continue, start New Game+, start over or erase it (both ask twice). **Continue** on the title screen picks up the slot played last. A save from before slots existed loads as slot 1.

## Settings and assist

Pause menu or title screen, **Settings**: sound effects and music volume, screen shake (a slider), screen flashes, particle density, damage numbers, controller rumble and a **speedrun timer**. They save in your browser. Touch devices start with particles on low.

**Assist and accessibility** (from Settings) makes the game gentler or harder, and nothing is locked away for using it:

- Damage taken: normal, half (every second blow costs a mask), none (blows still knock you back) or double
- Recovery after a hit: how long you stay untouchable
- Reiatsu from strikes: 1×, 1.5× or 2×
- Game speed: 100% down to 70% (the whole world slows; menus do not)
- Attack warnings: bold puts a red mark over every foe while it winds up an attack

With the timer on, a clock sits under the location in the top right, and each boss's split appears when it first falls, green when it beats the best ever recorded. **Records** in the pause menu lists this journey's splits against the best ones (over every journey and slot), every favour asked, and the trials of the Soul King Palace.

## What's in the game

Ichigo's story, roughly: a night in Karakura Town, the road into Soul Society, the Sōkyoku, Hueco Mundo and Las Noches, and at the end the world inside your own soul.

- **36 rooms in 10 regions**: Karakura Town (空座町), Rukongai (流魂街), the Seireitei (瀞霊廷), Sōkyoku Hill (双殛の丘), Hueco Mundo (虚圏), the Inner World (精神世界), the optional Dangai (断界) and Forest of Menos (大虚の森), Urahara's Study Room (勉強部屋) under the shop, and the Soul King Palace (霊王宮), which opens at 100%.
- **The powers, in the order you earn them** (each one a few rooms and usually a boss after the last):

  | Power | Where | Opens |
  |---|---|---|
  | Konsō | Rukia, at the start | Reads memories, sends Lost Pluses on, reveals what hides |
  | Shunpo | Grand Fisher | 8-tile ravines |
  | Hadō #31 Shakkahō | Menos Grande | Violet Kidō seals |
  | Reiatsu Grip | Seireitei Courtyard | Tall shafts |
  | Bakudō #61 Rikujōkōrō | Renji Abarai | The fast platform over the spikes; binds enemies |
  | Hirenkyaku (and Hadō #63 Raikōhō) | Byakuya Kuchiki | Free-floating ledges, the crossing into Hueco Mundo, the Senkaimon above the Back Alley |
  | Senkaimon Burst | Grimmjow Jaegerjaquez | Sealed Senkaimon gates |
  | Bankai: Tensa Zangetsu | Vasto Lorde | The seal door into the Inner World, and the way up to the dome of Las Noches |
  | Getsuga Tenshō | Zangetsu, at the end of the Dangai (optional) | |
  | Hollow Mask | Shinji Hirako's shrine (optional) | |

- **People**: Rukia Kuchiki, Kon, Kisuke Urahara (the shop, and the Study Room), Ururu, Yasutora Sado, the old man of Junrinan, a swordsmith, Ganju Shiba, Uryū Ishida, Jidanbō at the West Gate, Hanatarō Yamada (gives Kaidō), Yoruichi (gives Shunkō), Nel Tu, Orihime Inoue (heals you, in Las Noches), Shinji Hirako, Zangetsu, Ashido Kanō and Ichibē Hyōsube of the Royal Guard.
- **Favours** (five quests, listed under Records once asked):
  - *Names of the Dead*: the old man of Junrinan wants to hear the memories of a ruffian, a corrupted Shinigami and a Hollow (Konsō them). Reward: 200 reishi, the Soul Recall seal.
  - *A Body for Kon*: once you can grip walls, Kon asks for his spare Gikongan, locked in the Hall of Lanterns under the Fourth Division. Reward: the Lion's Pride seal.
  - *The Study Room*: after Bakudō, the shop has a trapdoor. Urahara's "light exercise" is three waves of foes. Reward: the Kodachi form and 200 reishi.
  - *Ganju's Rematch*: after Shakkahō, Ganju fights you for real in Inuzuri (club combos, lobbed fireworks, a leaping slam). Reward: the Shiba Crest seal.
  - *The Six Flowers*: five spirits of Orihime's hairpin are scattered across the worlds (the dunes above Hueco Mundo, the Pressure Shrine, the Forest of Menos, the Las Noches corridor, the Precipice Shrine). Reward: Sōten Kisshun, every heal a quarter quicker.
- **Region puzzles** (three optional side rooms, each with a fragment and something for a favour):
  - *Hall of Lanterns* (Seireitei, down a broken grate in the Fourth Division Sewers): strike a lantern and for 6.5 seconds the gold barriers open and a blue wall of light rises that you can grip. A barrier never closes on you.
  - *Sinking Dunes* (Hueco Mundo, up the bone steps from the first room): quicksand slows you, weakens your jump and swallows you if you stand still. Hop between the bone pillars.
  - *Pressure Shrine* (Sōkyoku Hill, a gap high in the west wall of the Ascent): air heavy with a captain's spirit pressure drags you down, shortens your jumps, lets no wall be held and drains Reiatsu; with the vessel empty it crushes. Jump and Shunpo across.
- **Enemies**: Lesser Hollows, Acidwire crawlers that spit acid, Rukongai ruffians, corrupted Shinigami, Kidō renegades, Onmitsukidō agents who vanish and strike from behind, Eleventh Division brawlers who charge (sometimes off a ledge), Pale Hollows on the ceilings, Adjuchas, Numeros Arrancar, Exequias executioners, and Gillian. Flying enemies follow the shortest open path to you around walls instead of pressing into them.
- **10 bosses** (three optional), each with its own weapon and phases:
  - Grand Fisher: burrows under you, lashes with its lure, then sends the bait itself
  - Menos Grande: stomps, Cero, a Cero dragged across the floor, summoned Hollows
  - Renji Abarai: Zabimaru lashes and sweeps the length of the bridge, Higa Zekkō, then Bankai: a bone serpent that slithers, bites and breathes Hikotsu Taihō
  - Byakuya Kuchiki: Senbonzakura petals hunt you and roll along the floor, Byakurai, Rikujōkōrō, then Bankai: blades rising from the floor, Gōkei
  - Kenpachi Zaraki (optional): never stops walking at you, shrugs off weak cuts, and takes off the eyepatch
  - Grimmjow Jaegerjaquez: pounces, wall kicks, claws, then Pantera: Desgarrón, Garra de la Pantera, Gran Rey Cero
  - Vasto Lorde: sonido dives, claw rushes, a sweeping Cero over a collapsing throne
  - Ulquiorra Cifer (optional): Cero, Sonído, then Murciélago in the air: the Lanza del Relámpago and Cero Oscuras
  - Aaroniero Arruruerie (optional): unseen until struck with the Konsō hilt, Nejibana's water, then Glotonería
  - Hollow Ichigo (final): Getsuga, a blade thrown on its cloth like a boomerang, and he punishes a heal in front of him
  - Every boss weighs its attacks by distance rather than choosing by it, rarely repeats itself, picks the attacks that reach you if you stand still, and comes to you when you keep away
  - The music climbs with each phase: a faster pulse, then a bass line, then a trembling high string
- **Elite enemies**: some foes carry a trait, marked by a kanji over the head: Armoured (鋼, takes a third less damage), Hasty (速, winds up and recovers faster), Volatile (爆, bursts when it falls) and Undying (再, mends when left alone). They have more health and drop twice the reishi. A first journey meets them only in Hueco Mundo and the Forest of Menos; New Game+ meets them everywhere, more each cycle. The same placement is always the same elite.
- **Progression and economy**:
  - 19 Zanpakutō seals with slot costs, equipped at rest gates (Lion's Pride and the Shiba Crest come from favours)
  - 16 soul fragments (every four add one mask of health), 9 Lost Pluses (they reward seal slots, two seals and reishi)
  - The swordsmith in Rukongai sharpens your Zanpakutō through three levels with reishi and reishi ore
  - **Zanpakutō forms**, switched at rest gates: Zangetsu (balanced), Ōdachi (slow, long, heavy; the swordsmith forges it after the first sharpening for 400 reishi and an ore) and Kodachi (quick, short, lighter; Urahara's reward)
  - Urahara's shop, the Pin Compass, Lingering Reiatsu where you die, the old man's quest for memories
  - **New Game+** after the ending
- **Rest gates** save, heal and fast travel. None sits inside a boss arena: the gate is always in the room before.
- **Map pins**: on the map, move the cursor with the arrows or stick (or click a spot) and press confirm to drop a pin: ★, then !, ?, ✕, and a fifth press clears it.

### The Soul King Palace and the true ending

At 100% completion (every power, seal, fragment, Lost Plus, boss, forge level, form and favour), a Hell Butterfly brings word from Ichibē Hyōsube of the Royal Guard, and every rest gate can carry you to the Soul King Palace. Its altar holds the trials:

- **The Trial of the Ten**: every boss in order, from Grand Fisher to Hollow Ichigo. Healing works as normal and your health carries between fights; after the third, sixth and eighth a respite heals you. Win it, however many tries it takes, and the true ending plays.
- **Single duels** with any boss you have beaten.
- **Bindings**, like Godhome's, chosen alone or together: Blade (刃, the sword at its first edge, no forge levels), Shell (殻, four masks at most), Seals (封, none may be worn) and Spirit (霊, the vessel holds a third of its Reiatsu and Bankai will not answer).

A trial plays on a copy of your save: falling, leaving it from the pause menu or quitting sends you back to the palace with nothing lost. The altar remembers the best time of the Trial of the Ten, each binding it was won with (lit kanji), and each duel's best time and bindings.
- **Journal**: every enemy you have met, how many you have sent on, and the memory Konsō let you hear.

### The optional regions

- **The Dangai**: reached through the floating Senkaimon above the Back Alley (needs Hirenkyaku). The first room is a chase from the Kōtotsu. Zangetsu waits at the shrine at the end with Getsuga Tenshō.
- **The Forest of Menos**: the sand at the far east of Hueco Mundo is cracked; strike down into it. Ashido Kanō lives there, and something hides in the dark below.

## Checking the world

`scripts/build_rooms.py` writes `src/rooms.js`: new rooms are carved out with small drawing helpers, so their rows always line up. After editing it, run:

```
python3 scripts/build_rooms.py && node scripts/check_world.js
```

`check_world.js` simulates the player's movement (jump arcs, Shunpo, the second jump, the wall grip, Burst) with the game's own constants, works out what each room lets you reach from each door, then plays the whole journey from a new game. It prints the order you earn every power, the route between them and a rough number of minutes for each gap, and anything that can never be reached. `node scripts/check_world.js sei_ward` shows one room with every set of powers.

The model treats quicksand as deadly (a route must jump or dash over it), models spirit pressure (heavier fall, shorter jumps, slower running, no wall grip) and checks lantern rooms as if the lantern were lit. It does not check whether the lantern run fits in its 6.5 seconds. The older room grids live in `scripts/rooms_base.json` and the generator edits them from there.

## Deploying

The site is static: `index.html`, `src/`, the icons and `manifest.webmanifest`. There is no build step, so Vercel serves the repository root as is (`vercel.json` pins that).

`scripts/autopush.sh` commits and pushes any changes to GitHub. Vercel's Git integration deploys every push to the production branch, so a push is a deploy. In Claude Code, the hooks in `.claude/settings.json` run it a few seconds after each file edit (debounced, so bursts become one commit) and once more when a turn ends. Set `AUTOPUSH=off` in the environment to pause it.

## Files

```
index.html            page + script order
src/config.js         tuning constants, abilities, seals, regions, bosses, memories, the Journal
src/controls.js       remappable input: keys (physical codes), mouse buttons, gamepads, saved bindings, device-aware names
src/touch.js          touch overlay: stick, buttons, layout editor, saved layout
src/settings.js       saved player settings (volumes, shake, flashes, particles, rumble)
src/state.js          GS: the single game-state object (saved data + per-life run state, save migration)
src/rooms.js          room layouts, generated by scripts/build_rooms.py
src/textures.js       tilesets, the four-layer backgrounds, effects, icons and UI brushwork
src/art.js            pixel-art rig: characters, poses, eased in-between frames, creatures
src/audio.js          WebAudio synth: sound effects, footsteps, and the generated music
src/objects.js        effects helper (Fx), pickups, rest gates, NPCs, platforms, projectiles, hazards
src/nav.js            flow fields: shortest open paths for flying enemies
src/ambience.js       per-region particles, light shafts, glows
src/player.js         player state machine (movement, abilities, seals, damage)
src/enemies.js        enemy types
src/bosses.js         the boss director and every boss, scripted with generator coroutines
src/scenes/game.js    room building, collisions, combat, transitions, boss arenas, death
src/scenes/ui.js      HUD, titles, dialog with portraits, popups, boss bar
src/scenes/menu.js    pause, rest gate (seals, forms, travel), shop, forge, map and pins, inventory, Journal, Records,
                      controls, settings and assist, save slots, the altar of trials
src/scenes/title.js   boot, title, the endings (the story's and the true one)
src/main.js           Phaser config + console test helpers
scripts/build_rooms.py  builds src/rooms.js (the older grids come from scripts/rooms_base.json)
scripts/check_world.js  reachability and pacing check for the whole world
```

## Editing rooms

Each room is an ASCII grid; the legend sits at the top of `src/rooms.js`. Doors are digits on a room's edge, and the opening must be at least two tiles tall (the player is a little more than one). A room's `doors` map pairs each digit with a door in another room, so `'2': ['ruk_1', '1']` means door 2 leads to door 1 of `ruk_1`. Pickups, NPCs and platforms take their data from the room's `abilities`, `seals`, `npcs` and `platforms` lists, in reading order. An NPC can also hand over a power (`gives`) or a seal (`seal`) once, heal you (`heals`), and say different lines afterward (`after`).

Jump reach is about 4.7 tiles up and 6 across. Jump plus Shunpo clears 8 tiles. A double jump reaches about 8 tiles up.

## Testing from the browser console

```js
SD.give('all')        // unlock every ability
SD.goto('hm_boss')    // jump to any room (ids are the keys in ROOMS)
SD.heal(); SD.rich()  // full health and Reiatsu / +1000 reishi
SD.step(60)           // advance the game 60 frames by hand (a background tab stalls its own frames)
SD.bossTest('sok_boss')  // fight a room's boss as a player who stands still and cannot be hurt; reports phases and moves
SD.scene.startTrial('single', ['renji'], { blade: true })  // start a palace trial from anywhere
```

## Art and animation

All character art is drawn by code in `src/art.js`. A humanoid is a **style** (palette, hair, outfit, weapon) plus a list of **poses** (lean, crouch, foot and hand positions, sword angle). Key poses are written by hand and `tween()` eases the frames between them, so idle breathing, running, landing and every swing move in small even steps; fast swings get a translucent smear. The same rig draws Ichigo (Shikai, Bankai and both masked forms), every Shinigami, Arrancar and Espada, and every NPC; creatures (Hollows, Adjuchas, Menos, Grand Fisher, Kon, the cat) are drawn by hand on the same pen. To change how a character looks, edit its entry in `STYLES`. To change an animation, edit its poses in `humanoidAnimsBase`.
