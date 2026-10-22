# Soul Drift

A Bleach-themed metroidvania built with Phaser 3 from `bleach-metroidvania-spec.md`. All spec phases 0–12 are in, using procedural placeholder art.

## Run it

Open `index.html` in a browser. No build step and no server needed (Phaser and the fonts load from CDNs, so you need to be online).

To serve it locally instead: `python3 -m http.server 8765`, then open http://localhost:8765.

## Controls

These are the defaults. Every action can be rebound under **Controls** on the title screen or in the pause menu. Bindings are saved in your browser, and every key hint in the game shows your current keys.


| Key | Action |
|---|---|
| ← → | Move |
| Z / Space | Jump (hold for height). ↓ + Z drops through planks |
| X | Zanpakuto slash. Hold ↑ or ↓ to aim. A down-slash in the air pogos off enemies and spikes. ↓ + X while standing on cracked ground strikes down into it. Once you have Getsuga Tenshō, keep holding X and release to fire it |
| A (hold) | Reiatsu Suppression: heals 1 mask for 33 Reiatsu. Moving or taking damage cancels it |
| C | Black Step dash |
| S | Kido: Hado. ↑ + S casts Kido: Bakudo. ↓ + S casts Hado #63: Raikōhō (66 Reiatsu, learned from the Rogue Captain) |
| D (hold) | Konso Blade |
| V (hold, then release) | Senkaimon Burst |
| F | Bankai (needs a full Reiatsu vessel) |
| Q | Hollow Mask |
| E or ↑ | Interact: rest, talk, shop, send Lost Pluses on |
| M / I / Esc | Map / Inventory / Pause |

## Phones and tablets

The game detects a touch screen and shows an on-screen stick and buttons. Turn your device sideways, or add the page to your home screen for a full-screen app (the ⛶ button also goes full screen where the browser allows it).

- **Stick** (left): move, ↑ aims up and interacts, ↓ aims down and drops through planks.
- **Buttons** (right): Jump, Slash (hold for Getsuga), Black Step, Kido, Heal, Konso, Burst, Bankai, Mask, Use. Map, Bag and Pause sit in the corners. Any number of fingers work at once.
- **Menus**: tap an entry to pick it. A small pad (▲ ▼ OK BACK) appears for menus. In dialogs, tap anywhere to continue.
- **Remap everything**: the ⚙ button (or Pause, then Controls, then Edit touch layout) opens the layout editor. Drag any button to move it, tap it to change what it does or how big it is, add or remove buttons, mirror the layout for left-handed play, and change size and opacity. The layout is saved on the device. Touch buttons press whatever key their action is bound to, so keyboard remapping and touch remapping work together.
- Force the overlay on a desktop with `?touch=1`, or off with `?touch=0`.

## Settings

Pause menu or title screen, **Settings**: sound effects and music volume, screen shake, screen flashes, particle density and damage numbers. They save in your browser. Touch devices start with particles on low.

## What's in the game

- **20 rooms in 8 regions**: Karakura Town (hub), Rukongai, Seireitei, Sokyoku Hill, Hueco Mundo, Silbern Endpoint, and two optional regions: the Dangai and the Forest of Menos. They link hub-and-spoke with backtracking shortcuts (rooftops to the Towers, the tunnel under Karakura to the final area).
- **10 abilities**, each gating a different obstacle:

  | Ability | Gate |
  |---|---|
  | Black Step | 8-tile ravines |
  | Hado | Violet Kido seals |
  | Reiatsu Grip | Tall shafts |
  | Bakudo | Fast moving platform over spikes; it also binds enemies |
  | Hirenkyaku Wings | Free-floating ledges, and the Senkaimon above the Back Alley |
  | Getsuga Tenshō | Optional; found at the end of the Dangai |
  | Konso Blade | True sight of hidden platforms and Shade Arrancars |
  | Senkaimon Burst | Senkaimon gates |
  | Bankai | The seal door to the final area |
  | Hollow Mask | Optional |

- **Combat**: slash combos with hit-stop and knockback, pogo, Reiatsu gain per hit, healing, Kido, Bankai crescent waves, and Hollowfication. The Hollow meter is hidden: only the edges of the screen redden, and maxing it out shatters the mask, stuns you and costs a mask of health.
- **Enemies**:
  - Rukongai thugs (patrol)
  - Corrupted Shinigami (block from the front, open after their lunge)
  - Lesser Hollow swarms
  - Adjuchas (telegraphed charge)
  - Shade Arrancars (invisible without Konso)
  - Gillians (lesser Menos that aim and fire a Cero)
  - Kido Casters (keep their distance and fire aimed bala)
  - Pale Hollow Divers (hang from ceilings, then drop on you)
- **Hazards**: reishi geysers (warning rumble, then a blast upward) and stalactites that shake loose when you pass beneath
- **Atmosphere**: each region has its own drifting particles and light, seals and gates glow, and the music, ambience and footsteps change with the region. Bosses add a pulse to the music and each ends in its own way
- **5 bosses**, each with phase changes:
  - Menos Grande: stomp shockwaves, Cero, summons
  - Rogue Captain: Bankai preview at 50%
  - Vasto Lorde: the arena floor collapses into spikes mid-fight
  - The Fallen Vizard: shikai, then mask, then Bankai
  - Espada of the Unseen (optional): invisible until you strike it with the Konso Blade, then releases its Resurrección at half health
- **Progression and economy**:
  - 11 Zanpakuto Seals with slot costs, equipped at rest gates
  - 8 Soul Fragments (every four add one mask of max health)
  - 6 Lost Pluses (they reward seal slots and two seals)
  - A swordsmith in Rukongai who sharpens your Zanpakuto through three levels for reishi and Reishi Ore (3 ore in the optional regions)
  - A shop that takes reishi
  - Lingering Reiatsu: your reishi drops where you die and you can win it back
  - Pin Compass (shop): marks every power, seal, fragment, ore and Lost Plus you have not found on the map
  - A quest from the old man in Rukongai: bring him the memories of a thug, a Shinigami and a Hollow, read with the Konso Blade
  - **New Game+** after the ending: keep your powers, seals and blade, face tougher foes that pay more
- **Rest gates** save, heal and fast travel. Progress is saved to `localStorage`.

### The optional regions

- **The Dangai**: reached through the floating Senkaimon above the Back Alley (needs Wings). The first room is a chase. The Kōtotsu, a wall of light, sweeps the corridor behind you and never falls more than about 15 tiles back. If it catches you, you lose a mask and start the corridor again. The shrine at the end holds Getsuga Tenshō, the Moon Fang seal, a fragment, ore and a Lost Plus.
- **The Forest of Menos**: the sand at the far east of Hueco Mundo is cracked; strike down into it (↓ + X). The forest is a vertical descent past Gillians to a clearing where something invisible waits.

## Deploying

The site is static: `index.html`, `src/`, the icons and `manifest.webmanifest`. There is no build step, so Vercel serves the repository root as is (`vercel.json` pins that).

`scripts/autopush.sh` commits and pushes any changes to GitHub. Vercel's Git integration deploys every push to the production branch, so a push is a deploy. In Claude Code, the hooks in `.claude/settings.json` run it a few seconds after each file edit (debounced, so bursts become one commit) and once more when a turn ends. Set `AUTOPUSH=off` in the environment to pause it.

## Files

```
index.html            page + script order
src/config.js         tuning constants, abilities, seals, regions, bosses
src/controls.js       remappable input (physical key codes), saved bindings, key-name formatting, virtual keys
src/touch.js          touch overlay: stick, buttons, layout editor, saved layout
src/settings.js       saved player settings (volumes, shake, flashes, particle density)
src/state.js          GS: the single game-state object (saved data + per-life run state)
src/rooms.js          room layouts as ASCII grids + doors, NPC lines, pickups
src/textures.js       tilesets, backgrounds, effects and props
src/art.js            pixel-art rig: characters, poses, animations, creatures
src/audio.js          WebAudio synth: sound effects, footsteps, and the generated music
src/objects.js        effects helper (Fx), pickups, rest gates, NPCs, platforms, projectiles, hazards
src/ambience.js       per-region particles, light shafts, glows
src/player.js         player state machine (movement, abilities, damage)
src/enemies.js        enemy types
src/bosses.js         bosses, scripted with generator coroutines
src/scenes/game.js    room building, collisions, combat, transitions, boss arenas, death
src/scenes/ui.js      HUD, titles, dialog, popups, boss bar
src/scenes/menu.js    pause, rest gate (seals and travel), shop, map, inventory
src/scenes/title.js   boot, title and ending scenes
src/main.js           Phaser config + console test helpers
```

## Editing rooms

Each room in `src/rooms.js` is an ASCII grid. The legend sits at the top of that file. Doors are digits on a room's edge. A room's `doors` map pairs each digit with a door in another room, so `'2': ['ruk_1', '1']` means door 2 leads to door 1 of `ruk_1`. Pickups, NPCs and platforms take their data from the room's `abilities`, `seals`, `npcs` and `platforms` lists, in reading order.

Jump reach is about 4.7 tiles up and 6 across. Jump plus Black Step clears 8 tiles. A double jump reaches about 8 tiles up.

## Testing from the browser console

```js
SD.give('all')        // unlock every ability
SD.goto('hm_boss')    // jump to any room (ids are the keys in ROOMS)
SD.heal(); SD.rich()  // full health and Reiatsu / +1000 reishi
```

## Art and animation

All character art is drawn by code in `src/art.js`. A humanoid is a **style** (palette, hair, outfit, weapon) plus a list of **poses** (lean, crouch, foot and hand positions, sword angle). Frames between key poses are interpolated, and fast swings get a translucent smear. The same rig draws Ichigo (Shikai, Bankai and both masked forms), the Shinigami, Arrancar, thugs, the Captain, the Vasto Lorde, the white mirror boss and every NPC. To change how a character looks, edit its entry in `STYLES`. To change an animation, edit its poses in `humanoidAnimsBase`.

## Next steps

- **Hand-drawn art**: every sprite sheet is a texture key with named frames (`ichigo` → `idle0`, `run3` and so on). Load a sprite sheet under the same key and frame names and the animations keep working.
- **Tiled maps (spec phase 2)**: the ASCII grids stand in for Tiled JSON. To move to Tiled, export the rooms as JSON and replace the loop in `GameScene.buildMap()` with tilemap layers that use the same tile indices (`T` in `config.js`).
