# Boss comparison

Every boss in Soul Drift compared on three things: how original its attacks are (mechanics nobody else in the game uses), how different it plays from the other bosses, and how close it is to the character in Bleach. Scores are out of 5. The last column says what changed in world 5 because of this review.

All bosses share one director (`Boss.pickMove` in `src/bosses.js`): weighted moves, distance tilts the odds, recent moves are unlikely, a camping player draws the moves that reach them, and a boss kept at range comes to you. So the differences below are in the moves themselves.

## The shared building blocks

These helpers are reused across bosses. Reuse is fine when the move is canon for both characters (Shunpo and Sonído are the same idea in Bleach), but it is where bosses start to feel alike.

| Building block | Used by |
|---|---|
| Flash step behind you and cut (`flashStep`) | Byakuya, Ulquiorra, Aaroniero, Urahara, Nnoitra, Hollow Ichigo |
| Aimed beam that locks on (`cero`, `beam`) | Menos, Grimmjow, Ulquiorra, Nnoitra, Yammy, Urahara (Sōkatsui), Vasto Lorde, Hollow Ichigo, Yhwach (the eyes) |
| Shock wave along the floor (`shock`) | Grand Fisher, Menos, Kenpachi, Vasto Lorde, Nnoitra, Yammy, Hollow Ichigo, Aizen, Yhwach |
| Stepping melee combo (`combo`) | Renji, Grimmjow, Hollow Ichigo, Aizen |
| Fan of needles or arrows | Grand Fisher, Grimmjow (Garra), Aizen (feathers), Yhwach (Heilig Pfeil) |
| Columns from the floor | Byakuya (Kageyoshi), Yammy (Ira columns), Kenpachi (Reiatsu pillar) |
| Dive from above at an angle | Vasto Lorde, Ulquiorra, Grimmjow (wall kick), Aizen (last form) |
| Summons | Menos, Aaroniero |

## Boss by boss

| Boss | Signature attacks | Original | Different | Canon | Notes and changes |
|---|---|---|---|---|---|
| Grand Fisher | Burrows and erupts under you, the lure lashes along the floor, the bait walks out and bursts, fur needles | 4 | 4 | 4 | The only burrower and the only boss with a decoy. Canon: the lure shaped like a girl, the hair needles. Unchanged. |
| Menos Grande | Stomp with shock waves, aimed Cero, a Cero dragged across the floor, summoned Hollows | 2 | 3 | 4 | Plain by design (the first Cero you see). Unchanged. |
| Renji Abarai | Zabimaru lashes and sweeps, Higa Zekkō (segments hang, then fire), Bankai: a bone serpent that slithers, bites and breathes Hikotsu Taihō | 5 | 5 | 5 | The serpent is unlike anything else in the game, and every move has a canon name. Unchanged. |
| Kenpachi Zaraki | Never stops walking, overhead, wide swing, Kendō wave, yellow Reiatsu pillar, takes a quarter less from every blow | 3 | 4 | 5 | Plays as pressure, not patterns, which is exactly him. Unchanged. |
| Byakuya Kuchiki | Senbonzakura swarm that hunts you, petal walls along the floor, Byakurai, Rikujōkōrō, Bankai: Kageyoshi blades, Senkei, Gōkei | 5 | 5 | 5 | The first boss whose weapon fights for him. Rikujōkōrō was copied line for line into Urahara: now only Byakuya has it. |
| Kisuke Urahara | Shakkahō volley, Sōkatsui, Benihime crescents, **Shibari Benihime** net, **Kamisori Benihime** razors, **Juzutsunagi** beads that burst in a chain, **Chikasumi no Tate** shield | was 2, now 4 | was 2, now 4 | was 3, now 5 | Before: a copy of Byakuya's Rikujōkōrō, Kageyoshi-style blades from the floor, and "Akahime web", which was two plain Ceros. All three replaced with Benihime's real techniques from the manga, each with its own mechanic (the net binds, the beads go off along a line across the room, the shield eats Kidō and Getsuga so you must close in). |
| Grimmjow Jaegerjaquez | Pounce, wall kick dive, claw combos, Desgarrón (five raking blades), Garra de la Pantera (needle fan), Gran Rey Cero | 4 | 4 | 5 | All canon. Overlaps with Ulquiorra on the dive, but his comes off a wall. Unchanged. |
| Yammy Llargo | Hammer fist with a wave, quake both ways, a huge slow Cero, body rush, Ira: Reiatsu columns where you stood, three-fist tantrum | 3 | 3 | 4 | Never staggers, which sets him apart more than the moves do. Unchanged. |
| Aaroniero Arruruerie | Hidden until struck with the Konsō hilt, Nejibana thrust and whirlpool, water wave, Glotonería: spits up Hollows and acid | 4 | 4 | 3 | The reveal is unique. The acid rain is invented (Glotonería devours rather than spits). Unchanged. |
| Ulquiorra Cifer | Green Cero, Sonído cuts, bala fan, Murciélago in flight: Lanza del Relámpago, dive, tail, Segunda Etapa: Cero Oscuras | 4 | 5 | 5 | The first boss that takes the fight into the air. Unchanged. |
| Nnoitra Gilga | Scythe sweeps with the longest reach, two crescent waves, vault over you, Santa Teresa: four arms, paired Sonído, wide Cero | 3 | 3 | 4 | The reach is his identity. Shares a lot with Kenpachi (melee plus floor waves). Unchanged. |
| Vasto Lorde | Sonído dive, claw rush across the room, claw combos, Cero burst, Cero Grande sweep over a collapsing throne | 3 | 4 | 2 | Generic ("a Vasto Lorde"), but the collapsing floor is unique. Unchanged. |
| Hollow Ichigo | Getsuga, Zangetsu thrown on its cloth, Getsuga rain, white Cero and sweep, mirror steps, Tensa flurry, **Getsuga Jūjishō**, Hollow nova, the final storm | was 3, now 4 | 4 | 5 | "King's spire" (black blades rising from the floor) was a third copy of Kageyoshi. Replaced with Getsuga Jūjishō: an X of two crossed crescents that crawls across the room, and you get through it at the crossing or over it. |
| **Sōsuke Aizen** (new) | Kyōka Suigetsu feint (an Aizen runs at you, the real one cuts from behind), complete hypnosis (four of him chanting, only the real one casts a shadow, strike him before Hadō #90 lands), Hadō #90 Kurohitsugi (a black coffin you must leave before it seals), one finger (blocks any blade and counters, Kidō gets through), Hōgyoku: Hadō #91 Senjū Kōten Taihō, two coffins at once; last form: six wings, feathers, a dive | 5 | 5 | 5 | Built around the thing Aizen is: you cannot trust what you see. The shadow rule keeps it fair. |
| **Yhwach** (new, secret) | Broad sword of reishi, Heilig Pfeil (a fan of arrows), a wall of arrows with one gap, Schatten (rises out of the shadow under you), Auswählen (rays that take back power: Reiatsu drained, Bankai and the mask end), Blut Vene (blades glance off, Kidō pierces), the Almighty (he strikes where you are going to be; a burning Bankai breaks when he opens his eyes) | 5 | 5 | 5 | The only boss that predicts your movement and the only one that takes your powers away. |

## What makes the bosses different from each other

- **Space**: Grand Fisher is under the floor, Ulquiorra and Vasto Lorde and Aizen (last form) are in the air, Renji and Byakuya fill the room with their weapons, Kenpachi and Yammy and Nnoitra stand in front of you.
- **What they punish**: Hollow Ichigo punishes healing in front of him. Aizen punishes trusting your eyes and swinging into his finger. Yhwach punishes moving in a straight line. Kenpachi punishes running (he never stops). Urahara's shield punishes fighting from range.
- **What they take from you**: Byakuya, Urahara and Ganju's rematch can hold you in place, Aizen's coffin takes two masks if you fail his test, Yhwach takes your Reiatsu, your Bankai and your mask.

## Difficulty (scripted duel, plain edge, Normal)

See the README for the full table measured with `SD.duelTest`.
