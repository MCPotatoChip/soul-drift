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
| V (hold, then release) | | RT / R2 | Senkaimon Burst (it flies on through doorways into the next room until a wall stops it; jump to stop early) |
| F | | LT / L2 | Bankai: needs a full Reiatsu vessel **and** 5 strikes in a row without being hit (the 卍 pips under the reishi count fill, then turn red). Once it fades it rests for 35 s (25 on Easy, 45 on Hard, a third less with Gentei Kaijo) |
| Q | | RS / R3 | Hollow Mask |
| E or ↑ | | ↑ | Interact: rest, talk, shop, send Lost Pluses on |
| M / I / Esc | | View / LS / Menu | Map / Inventory / Pause. On the map: **W A S D** or the arrows pan, **+ / −** or the wheel zoom, **R** centres on you, Enter or a click drops a pin |

In menus, Enter or the pad's A confirms and Esc or B goes back, whatever the bindings. In the Controls screen, pick a cell with the arrows or d-pad and press Enter or A, then press the new key, click the new mouse button, or press the new pad button. Backspace (or Y) clears an alternate or pad cell. Pads that support it rumble on hits, Bankai and boss blows (Settings, Controller rumble).

## Phones and tablets

The game detects a touch screen and shows an on-screen stick and buttons. Turn your device sideways, or add the page to your home screen for a full-screen app (the ⛶ button also goes full screen where the browser allows it).

- **Stick** (left): move, ↑ aims up and interacts, ↓ aims down and drops through planks.
- **Buttons** (right): Jump, Slash (hold for Getsuga), Shunpo, Kidō, Heal, Konsō, Burst, Bankai, Mask, Use. Map, Bag and Pause sit in the corners. Any number of fingers work at once.
- **Menus**: tap an entry to pick it. A small pad (▲ ▼ OK BACK) appears for menus. In dialogs, tap anywhere to continue.
- **Remap everything**: the ⚙ button (or Pause, then Controls, then Edit touch layout) opens the layout editor. Drag any button to move it, tap it to change what it does or how big it is, add or remove buttons, mirror the layout for left-handed play, and change size and opacity. The layout is saved on the device. Touch buttons press whatever key their action is bound to, so keyboard remapping and touch remapping work together.
- Force the overlay on a desktop with `?touch=1`, or off with `?touch=0`.

## Saves

There are three save slots (**Journeys** on the title screen). Each shows where you are, how complete it is, its difficulty, the time played and deaths, with 討 once the story is finished and 真 once the true ending has been seen. From a slot you can continue, start New Game+, start over or erase it (both ask twice). **Continue** on the title screen picks up the slot played last. A save from before slots existed loads as slot 1.

Every new journey (and every New Game+) first asks for a **difficulty**. **New Game+ on an empty slot**: once any journey has reached the story's end (Aizen), an empty slot offers New Game+ from it, or, if that slot was erased since, from the last journey that finished (remembered apart from the slots).

**Old saves carry over** (the save has a layout version, now 5, and an older one is upgraded when it loads). World 5: a save takes the difficulty closest to the old assist settings it was played with (hard bosses: Hard; less damage, longer recovery, more Reiatsu or a slower game: Easy) and says so once. Seals that now cost more slots are taken off, last equipped first, until the rest fit, and the game says which. Nothing you found is lost or found twice: seals and powers are remembered by what you own, so the ones that moved (Raikōhō now sits in the Kidō Corps Shrine, Yoruichi's Shunkō in the Barracks Yard, Long Reach in the Atrium, Moon Fang past the Precipice Shrine) are not handed out again. Map pins move with the rooms they were placed in. A Pin Compass bought before the story's end is taken back and refunded (180 reishi), since it now goes on sale after the Hollow within has fallen.

## Settings and difficulty

Pause menu or title screen, **Settings**: sound effects and music volume, screen shake (a slider), screen flashes, particle density, damage numbers, controller rumble and a **speedrun timer**. They save in your browser. Touch devices start with particles on low.

**Difficulty** belongs to each journey. It is chosen when the journey begins and can be changed afterwards **only at a rest gate** (Settings shows it but does not change it). Nothing is locked away by any choice:

| | Easy (易) | Normal (常) | Hard (難) |
|---|---|---|---|
| Blows | every second one costs a mask | a mask each | a mask each |
| Recovery after a blow | 1.5× longer | normal | 0.8× |
| Reiatsu from strikes | 1.5× | 1× | 0.85× |
| Foe health | 80% | 100% | 130% |
| Boss health / speed | 80% / 92% | 100% / 100% | 135% / 112% |
| Attack warnings (a red mark while a foe winds up) | on | off | off |
| Bankai cooldown | 25 s | 35 s | 45 s |

With the timer on, a clock sits under the location in the top right, and each boss's split appears when it first falls, green when it beats the best ever recorded. **Records** in the pause menu lists this journey's splits against the best ones (over every journey and slot), every favour asked, and the trials of the Soul King Palace.

## What's in the game

Ichigo's story, roughly: a night in Karakura Town, the road into Soul Society, the Sōkyoku, Hueco Mundo and Las Noches, and at the end the world inside your own soul.

- **Wide doorways**: every room with a doorway on its edge has a 9-tile run-up beside it (`widen` in `scripts/build_rooms.py`). Boss arenas keep their size. Saves from before this (world 3) have their map pins carried along.
- **Foe placement** (`place_foes` in `scripts/build_rooms.py`, checked by `scripts/check_placement.js`): a walker stands at least 14 tiles from every way in (doors, rest gates, the start; height counts half again), a Hollow swarm at least 16 tiles of open air from one (it wakes at 11), foes on one floor stand at least 6 tiles apart and any two at least 5, a swarm hangs no more than 8 rows above a floor you can walk on (none sits at the roof), and a Pale Hollow hangs only over somewhere you pass. A foe already in a good spot stays; one that is not moves to the nearest good spot. Foes still hold still for 1.6 seconds after you arrive anywhere. The Adjuchas, which charges along the floor, is placed as a walker (it used to be placed like a flyer).
- **Planks with a purpose**: every plank holds something, takes you somewhere you could not otherwise reach, shortens the way there (checked with every set of powers a room is visited with over the journey), catches you over a doorway in the floor, or is kept on purpose as part of a stair, a bridge or stepping stones over spikes (`KEEP` in `scripts/check_placement.js`, with the reason for each). Fourteen planks that led nowhere were taken out (`PLANK_CUTS` in `scripts/build_rooms.py`): a stair to empty sky in Karakura, the three floating planks of the palace hall, a bone step the run-up had stretched to 14 tiles, and others. Four rooms you enter by coming up through the floor (the Fourth Division Sewers, the Sinking Dunes, the Bone Vault, the Dome of Las Noches) got the ledge the older rooms have, so you land instead of dropping straight back out (`CATCH_PLANKS`). Boss arenas and the Study Room keep their planks to fight on.
- **Wall grip** holds only while you press toward the wall; let go and you drop. The map marks every exit into a room you have never entered with a gold `?`, and the compass also lists what is left in rooms you know a way into. Travel lists its gates in two columns.
- **Tempers**: once the edge is fully sharpened, the swordsmith spends spare reishi ore on Keen (+8% slash damage, ×3), Quick (6% less time between slashes, ×2) and Long (+8% slash reach, ×2). The world holds 7 ore: 3 go to the edge and 1 to the Ōdachi, so the rest is a choice.
- **Beams and dives track you, then lock**: the aim line of every Cero, Byakurai, Cero Oscuras and the diving dashes (Ulquiorra's swoop, Grimmjow's wall kick) follows the player and freezes for the last 0.16 to 0.3 seconds, turning solid. The shot goes exactly where the frozen line pointed, the band drawn is as wide as the beam, and dives travel as far as you stood. Beams hurt only inside their drawn width plus a little of the body.
- **Hard** difficulty: +35% boss health and 12% faster, +30% foe health. **Study**: sending on 15 of a kind and hearing its memory each add 5% damage against it (Journal). **The map marks the next step of every favour** with a gold `!`, whether or not you own the compass.
- **Touch**: layout presets (default, left-handed, compact, big) and a "tap to toggle" option for Heal, Konsō and Burst, in the layout editor.
- **Travel** lists gates in journey order: region by region, west to east.
- **Records** spells out every favour: what is done, what is left and the room each step is in.
- **Touch controls**: buttons for powers you do not own yet stay hidden, and hints in dialogue and prompts name the on-screen button (USE, KONSŌ) instead of a keyboard key.
- **51 rooms in 10 regions**: Karakura Town (空座町), Rukongai (流魂街), the Seireitei (瀞霊廷), Sōkyoku Hill (双殛の丘), Hueco Mundo (虚圏), the Inner World (精神世界), the optional Dangai (断界) and Forest of Menos (大虚の森), Urahara's Study Room (勉強部屋) under the shop, and the Soul King Palace (霊王宮), which opens at 100%.
- **The powers, in the order you earn them** (each one a few rooms and usually a boss after the last):

  | Power | Where | Opens |
  |---|---|---|
  | Konsō | Rukia, at the start | Reads memories, sends Lost Pluses on, reveals what hides |
  | Shunpo | Grand Fisher | 8-tile ravines |
  | Hadō #31 Shakkahō | Menos Grande | Violet Kidō seals |
  | Hadō #63 Raikōhō | The Kidō Corps Shrine, behind a violet seal off Junrinan, West District 3 | Bursts that hurt everything around them |
  | Reiatsu Grip | Seireitei Courtyard | Tall shafts |
  | Bakudō #61 Rikujōkōrō | Renji Abarai | The fast platform over the spikes; binds enemies |
  | Hirenkyaku | Byakuya Kuchiki | Free-floating ledges, the crossing into Hueco Mundo, the Senkaimon above the Back Alley |
  | Senkaimon Burst | Grimmjow Jaegerjaquez | Sealed Senkaimon gates |
  | Bankai: Tensa Zangetsu | Vasto Lorde | The way up to the dome of Las Noches (calling it needs a full vessel and 5 strikes in a row without being hit; it rests after) |
  | Getsuga Tenshō | Zangetsu, at the end of the Dangai (optional) | |
  | Hollow Mask | Shinji Hirako's shrine (optional) | The last door of the Inner World |

  **The Inner World** is reached from Karakura Town: drop through the planks to the tunnel under the street, break the Senkaimon gate there with **Senkaimon Burst**, and walk on into Sideways City. At its far end a red seal door answers **only to someone who holds every power**, the Hollow Mask and Raikōhō included (11 in all). Come close with one missing and it names what is lacking. When the Hollow within falls, Aizen speaks, and the west wall of the arena tears open onto **Fake Karakura Town** (偽空座町), where he waits. The story ends when he falls. Dying to him wakes you at the last rest gate; the Garganta stays open.

- **People**: Rukia Kuchiki, Kon, Kisuke Urahara (the shop, and the Study Room), Ururu, Yasutora Sado, the old man of Junrinan, a swordsmith, Ganju Shiba, Uryū Ishida, Jidanbō at the West Gate, Hanatarō Yamada (gives Kaidō), Yoruichi (gives Shunkō), Nel Tu, Orihime Inoue (heals you, in Las Noches), Shinji Hirako, Zangetsu, Ashido Kanō and Ichibē Hyōsube of the Royal Guard.
- **Favours** (five quests, listed under Records once asked):
  - *Names of the Dead*: the old man of Junrinan wants to hear the memories of a ruffian, a corrupted Shinigami and a Hollow (Konsō them). Reward: 200 reishi, the Soul Recall seal.
  - *A Body for Kon*: once you can grip walls, Kon asks for his spare Gikongan, locked in the Hall of Lanterns under the Fourth Division. Reward: the Lion's Pride seal.
  - *The Study Room*: after Bakudō, the shop has a trapdoor. Urahara's "light exercise" is three waves of foes. Reward: the Kodachi form and 200 reishi. Then he offers the real lesson: **Kisuke Urahara as a boss** (Hadō volleys, Bakudō, flash steps, and Benihime's red crescents once the hat comes off). Reward: a seal slot, 300 reishi and reishi ore.
  - *Ganju's Rematch*: after Shakkahō, Ganju fights you for real in Inuzuri (club combos, lobbed fireworks, a leaping slam). Reward: the Shiba Crest seal.
  - *The Six Flowers*: five spirits of Orihime's hairpin are scattered across the worlds (the dunes above Hueco Mundo, the Pressure Shrine, the Forest of Menos, the Las Noches corridor, the Precipice Shrine). Reward: Sōten Kisshun, every heal a quarter quicker.
- **Region puzzles** (three optional side rooms, each with a fragment and something for a favour):
  - *Hall of Lanterns* (Seireitei, down a broken grate in the Fourth Division Sewers): strike a lantern and for 6.5 seconds the gold barriers open and a blue wall of light rises that you can grip. A barrier never closes on you.
  - *Sinking Dunes* (Hueco Mundo, up the bone steps from the first room): quicksand slows you, weakens your jump and swallows you if you stand still. Hop between the bone pillars.
  - *Pressure Shrine* (Sōkyoku Hill, a gap high in the west wall of the Ascent): air heavy with a captain's spirit pressure drags you down, shortens your jumps, lets no wall be held and drains Reiatsu; with the vessel empty it crushes. Jump and Shunpo across.
- **Enemies**: Lesser Hollows, Acidwire crawlers that spit acid, Rukongai ruffians, corrupted Shinigami, Kidō renegades, Onmitsukidō agents who vanish and strike from behind, Eleventh Division brawlers who charge (sometimes off a ledge), Pale Hollows on the ceilings, Adjuchas, Numeros Arrancar, Exequias executioners, and Gillian. Flying enemies follow the shortest open path to you around walls instead of pressing into them.
- **15 bosses** (five optional, one secret), each with its own weapon and phases. `BOSSES.md` compares every boss's attacks: how original they are, how different from the others, and how close to Bleach. Their health grows with the forge: every forge level adds a third of a boss's base health, so a sharper Zanpakutō never makes a fight a formality (the sword's strike rises by 40% of the first, per level). The ones that used to fall to a held slash button have a lot more health than they did.
  - Grand Fisher: burrows under you, lashes with its lure, then sends the bait itself
  - Menos Grande: stomps, Cero, a Cero dragged across the floor, summoned Hollows
  - Renji Abarai: Zabimaru lashes and sweeps the length of the bridge, Higa Zekkō, then Bankai: a bone serpent that slithers, bites and breathes Hikotsu Taihō
  - Byakuya Kuchiki: Senbonzakura petals hunt you and roll along the floor, Byakurai, Rikujōkōrō, then Bankai: blades rising from the floor, Gōkei
  - Kenpachi Zaraki (optional): never stops walking at you, shrugs off weak cuts, and takes off the eyepatch
  - Grimmjow Jaegerjaquez: pounces, wall kicks, claws, then Pantera: Desgarrón, Garra de la Pantera, Gran Rey Cero
  - Vasto Lorde: sonido dives, claw rushes, a sweeping Cero over a collapsing throne
  - Ulquiorra Cifer (optional): Cero, Sonído, then Murciélago in the air: the Lanza del Relámpago and Cero Oscuras
  - Aaroniero Arruruerie (optional): unseen until struck with the Konsō hilt, Nejibana's water, then Glotonería
  - Kisuke Urahara (optional, Study Room): Hadō volleys, Sōkatsui, flash steps, Benihime's crescents; once the hat comes off, Benihime's own techniques: Shibari Benihime (a red net that holds you), Kamisori Benihime (a spray of razor crescents), Hiasobi Benihime Juzutsunagi (beads strung across the room that burst one after another) and Chikasumi no Tate (a shield of blood mist that stops Kidō and the Getsuga: close in)
  - Nnoitra Gilga (optional, past the east wall of the Mask Shrine): a scythe taller than he is: sweeps, two crescent waves, a vault over you, then Santa Teresa and four arms. Reward: Tesla's Charm (a hit leaves you untouchable 40% longer) and ore
  - Yammy Llargo (optional, past the east wall of the Bone Vault): huge, never staggered: fists, quakes, a slow wide Cero, then Ira, with columns of Reiatsu where you stood. Reward: Llargo's Might (+20% slash damage) and a soul fragment
  - Hollow Ichigo: four phases. Getsuga, a blade thrown on its cloth (twice, later), Getsuga rain from the roof, a sweeping Cero, a flurry of Tensa dashes, Getsuga Jūjishō (two crossed crescents that crawl across the room: through the crossing or over it) and, with a fifth of his strength left, nothing held back at all. He punishes a heal in front of him
  - **Sōsuke Aizen** (the last boss of the story, in Fake Karakura Town): Kyōka Suigetsu. An Aizen runs at you from the front and the real one cuts from behind; four of him chant at once and only the real one casts a shadow (strike him before the incantation ends, or the full Hadō #90 falls, two masks). Hadō #90 Kurohitsugi closes a black coffin where you stand: be out of it before the walls rise. With one raised finger he stops any blade and cuts back (Kidō and the Getsuga still reach him). At 60% the Hōgyoku: Hadō #91 Senjū Kōten Taihō, two coffins at once. At 30% six wings, feathers of light, and dives from above
  - **Yhwach** (secret): found only at the end of the Grand Trial, at the Soul King's throne. A broad sword of reishi, Heilig Pfeil, a wall of arrows with one gap in it, Schatten (he rises out of the shadow under you). At 65%, Auswählen: rays that take back power (a ray that finds you drains your Reiatsu and ends Bankai and the mask) and Blut Vene (blades glance off, Kidō does not). At 35%, the Almighty: he strikes where you are about to be, eyes along the ceiling fire where you are heading, and a Bankai still burning when his eyes open breaks
  - Every boss weighs its attacks by distance rather than choosing by it, rarely repeats itself, picks the attacks that reach you if you stand still, and comes to you when you keep away
  - The music climbs with each phase: a faster pulse, then a bass line, then a trembling high string
- **Boss difficulty, easiest to hardest** (measured with `SD.duelTest`: a scripted player that swings and steps back from wind-ups, no healing, no Kidō; "blows taken" is how many hits it ate before the boss fell, at the plain edge. Base health in brackets; each forge level adds a third of it):
  1. Menos Grande (340): 63 blows. Big, slow, telegraphed
  2. Renji Abarai (440): 94
  3. Grand Fisher (320): 104. Burrows, so staying still is punished
  4. Grimmjow (600): 123
  5. Kenpachi (640, takes a quarter less from every blow): 166
  6. Byakuya (560): 169. The petals are what hurt
  7. Kisuke Urahara (640, optional): about 170. Fewer blows in melee, many more at range
  8. Yammy Llargo (860, optional): 241. Never staggered, slow and heavy
  9. Aaroniero (600, optional): 245
  10. Ulquiorra (680, optional): about 260, and hard to reach once he takes flight
  11. Nnoitra Gilga (720, optional): 297. The longest reach in the game, then four arms
  12. Vasto Lorde (600): about 335, also airborne
  13. Hollow Ichigo (1700): about 380, over three times the health he used to have and four phases
  14. Sōsuke Aizen (1500): about as hard as Hollow Ichigo, and fought right after him. In ten minutes the reactive bot takes half his health and 19 blows a minute (Hollow Ichigo: half, 20 a minute)
  15. Yhwach (1650, secret): the hardest. In ten minutes the reactive bot takes a third of his health and 23 blows a minute
  Held-slash spam alone, with no dodging at all, takes 70 to 90 seconds on the easiest of them while eating a blow every 1.5 seconds, and about five minutes on the last.
- **Elite enemies**: some foes carry a trait, marked by a kanji over the head: Armoured (鋼, takes a third less damage), Hasty (速, winds up and recovers faster), Volatile (爆, bursts when it falls) and Undying (再, mends when left alone). They have more health and drop twice the reishi. A first journey meets them only in Hueco Mundo and the Forest of Menos; New Game+ meets them everywhere, more each cycle. The same placement is always the same elite.
- **Progression and economy**:
  - 21 Zanpakutō seals (all fit on one screen, in two columns) with slot costs, equipped at rest gates (Lion's Pride and the Shiba Crest come from favours). Costs follow what a seal is worth (world 5): 1 for a convenience or a narrow edge, 2 for a lasting gain in a fight, 3 for one that changes every fight. Rebalanced: Spirit Harvest 1→2 (+50% Reiatsu is a lasting gain), Utsusemi 2→3 (nothing can touch you during Shunpo), Unbreakable Will 3→2, Grace of the Departed 2→1 and a mask every 4 s instead of 5, Llargo's Might 2→1 (it gave half of Whetted Edge for the same slots), Kaidō saves 8 Reiatsu a heal instead of 11 (it out-healed Spirit Harvest for one slot), Reishi Magnet also makes foes drop a quarter more reishi, Soul Recall also draws 11 Reiatsu from foes you have heard before, Gentei Kaijo also brings Bankai back a third sooner
  - 19 soul fragments (every four add one mask of health), 9 Lost Pluses (they reward seal slots, two seals and reishi)
  - **17 power upgrades** (the four newest tracks are **Shunpo Edge** ×2: Shunpo recovers 15% faster and carries further; **Mask Mastery** ×2: the mask takes 15% longer to overwhelm you; **Bankai Span** ×2: Bankai lasts 20% longer; **Burst Drive** ×2: Burst charges 15% faster and flies 12% quicker. Each pickup sits on a plank in one room: Shunpo in West District 2 and the Courtyard, Burst in the Atrium and West Hueco Mundo 3, the Mask in the Forest depths and Sideways City, Bankai in the Dune Sea and Hueco Mundo 2). The first nine (one pickup each, spread across the regions, some behind seals or walls only a power can climb): **Kidō Mastery** ×3 (+20% damage on every Kidō per level), **Kidō Reach** ×3 (bigger bolts, wider Raikōhō blasts and a longer Bakudō per level), **Moon Fang Edge** ×2 (Getsuga cuts 25% deeper and grows wider) and **Reiatsu Flow** ×1 (+25% Reiatsu from strikes). They show in the Inventory
  - The swordsmith in Rukongai sharpens your Zanpakutō through three levels with reishi and reishi ore
  - **Zanpakutō forms**, switched at rest gates: Zangetsu (balanced), Ōdachi (slow, long, heavy; the swordsmith forges it after the first sharpening for 400 reishi and an ore) and Kodachi (quick, short, lighter; Urahara's reward)
  - Urahara's shop, the Pin Compass (**on the shelf only once the story has ended**: it marks every power, seal, upgrade, fragment, ore and Lost Plus you have not found yet), Lingering Reiatsu where you die, the old man's quest for memories
  - **New Game+** after the ending
- **Rest gates** save, heal and fast travel. None sits inside a boss arena: the gate is always in the room before. There are rooms and gates between the old ones now (West District 3, Ravine Edge, the Infirmary, the Sōkyoku Stairs, the Dune Sea, the Atrium, the far side of the Dangai), so gates and rewards are further apart.
- **Map pins**: on the map, pan so the cross in the middle is over the spot (or click it) and press confirm to drop a pin: ★, then !, ?, ✕, and a fifth press clears it. Room names are written outside their boxes, bigger as you zoom, and the name of the room under the cross is always written under the map.

### The Soul King Palace and the true ending

At 100% completion (every power, seal, fragment, Lost Plus, boss, forge level, form and favour), a Hell Butterfly brings word from Ichibē Hyōsube of the Royal Guard, and every rest gate can carry you to the Soul King Palace. Its altar holds the trials:

- **The Grand Trial**: every boss of the journey in order, from Grand Fisher to Aizen (14 now: Urahara, Yammy and Nnoitra included). The list is `RUSH_ORDER` in `src/config.js`, built from `BOSSES`: a boss added there with a `rush` number joins the trial by itself. Healing works as normal and your health carries between fights; after every third fight a respite heals you. When the last one falls, the lights go out and **Yhwach** comes for the Soul King: beat him too, however many tries it takes, and the true ending plays. He is never offered as a single duel and does not count toward completion.
- **Single duels** with any boss you have beaten (Urahara fights in the Study Room).
- **Bindings**, like Godhome's, chosen alone or together: Blade (刃, the sword at its first edge, no forge levels), Shell (殻, four masks at most), Seals (封, none may be worn) and Spirit (霊, the vessel holds a third of its Reiatsu and Bankai will not answer).

A trial plays on a copy of your save: falling, leaving it from the pause menu or quitting sends you back to the palace with nothing lost. The altar remembers the best time of the Grand Trial, each binding it was won with (lit kanji), and each duel's best time and bindings.
- **Journal**: every enemy you have met, how many you have sent on, and the memory Konsō let you hear.

### The optional regions

- **The Dangai**: reached through the floating Senkaimon above the Back Alley (needs Hirenkyaku). The first room is a chase from the Kōtotsu. Zangetsu waits at the shrine at the end with Getsuga Tenshō.
- **The Forest of Menos**: the sand at the far east of Hueco Mundo is cracked; strike down into it. Ashido Kanō lives there, and something hides in the dark below.

## Checking the world

`scripts/build_rooms.py` writes `src/rooms.js`: new rooms are carved out with small drawing helpers, so their rows always line up. After editing it, run:

```
python3 scripts/build_rooms.py && node scripts/check_world.js && node scripts/check_placement.js
```

`check_placement.js` (about 10 minutes for every room, or give it a room id) reports foes too close to a way in, foes crowded together, swarms and divers nobody will ever meet, walkers on ledges you never reach, and planks that lead nowhere; `--cuts` also lists the planks that can go, taken away one at a time so of two planks that stand in for each other one stays.

The thirteen rooms added with world version 3 are drawn in `scripts/new_rooms.py` (also run by `build_rooms.py`, which holds the map layout table `LAYOUT`: it refuses to build if two rooms' map boxes touch).

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
src/scenes/menu.js    pause, rest gate (seals, forms, difficulty, travel), shop, forge, map and pins, inventory, Journal, Records,
                      controls, settings, difficulty, save slots, the altar of trials
src/scenes/title.js   boot, title, the endings (the story's and the true one)
src/main.js           Phaser config + console test helpers
scripts/build_rooms.py  builds src/rooms.js (the older grids come from scripts/rooms_base.json) and lays the rooms out on the map
scripts/new_rooms.py    the rooms added in world version 3, and the doors that lead to them
scripts/check_world.js  reachability and pacing check for the whole world
scripts/check_placement.js  where foes stand and what planks are for, room by room
BOSSES.md               every boss's attacks compared: originality, overlap, faithfulness to Bleach
```

## Editing rooms

Each room is an ASCII grid; the legend sits at the top of `src/rooms.js`. Doors are digits on a room's edge, and the opening must be at least two tiles tall (the player is a little more than one). A room's `doors` map pairs each digit with a door in another room, so `'2': ['ruk_1', '1']` means door 2 leads to door 1 of `ruk_1`. Pickups, NPCs and platforms take their data from the room's `abilities`, `seals`, `upgrades` (for `w`), `npcs` and `platforms` lists, in reading order. A room with `sealAll` has Bankai seal doors that open only to someone who holds every power. An NPC can also hand over a power (`gives`) or a seal (`seal`) once, heal you (`heals`), and say different lines afterward (`after`).

Jump reach is about 4.7 tiles up and 6 across. Jump plus Shunpo clears 8 tiles. A double jump reaches about 8 tiles up.

## Testing from the browser console

```js
SD.give('all')        // unlock every ability
SD.goto('hm_boss')    // jump to any room (ids are the keys in ROOMS)
SD.heal(); SD.rich()  // full health and Reiatsu / +1000 reishi
SD.god(true)          // blows cost nothing while you test (SD.god(false) after)
SD.step(60)           // advance the game 60 frames by hand (a background tab stalls its own frames)
SD.bossTest('sok_boss')  // fight a room's boss as a player who stands still and cannot be hurt; reports phases and moves
SD.duelTest('hm_boss', { sword: 0, bot: 'reactive' })  // fight it with a scripted player (swings, or swings and steps back from wind-ups); reports time to kill and blows taken. Set SD.game.scene.render = () => {} first to run it ~9x faster
SD.scene.startTrial('single', ['renji'], { blade: true })  // start a palace trial from anywhere
```

## Art and animation

All character art is drawn by code in `src/art.js`. A humanoid is a **style** (palette, hair, outfit, weapon) plus a list of **poses** (lean, crouch, foot and hand positions, sword angle). Key poses are written by hand and `tween()` eases the frames between them, so idle breathing, running, landing and every swing move in small even steps; fast swings get a translucent smear. The same rig draws Ichigo (Shikai, Bankai and both masked forms), every Shinigami, Arrancar and Espada, and every NPC; creatures (Hollows, Adjuchas, Menos, Grand Fisher, Kon, the cat) are drawn by hand on the same pen. To change how a character looks, edit its entry in `STYLES`. To change an animation, edit its poses in `humanoidAnimsBase`.
