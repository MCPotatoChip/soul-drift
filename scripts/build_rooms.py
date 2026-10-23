#!/usr/bin/env python3
"""Builds src/rooms.js: the room grids, doors, NPC lines and pickups of Soul Drift.

New rooms are carved out of blank canvases with small drawing helpers, so their rows always
have the right length; the older rooms are kept as text. Run it after editing, then
`node scripts/check_world.js` to make sure every room can still be crossed:

    python3 scripts/build_rooms.py && node scripts/check_world.js
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'rooms.js')


class Grid:
    def __init__(self, w, h, fill='.'):
        self.w, self.h = w, h
        self.c = [[fill] * w for _ in range(h)]

    @classmethod
    def of(cls, rows):
        g = cls(max(len(r) for r in rows), len(rows))
        for y, r in enumerate(rows):
            for x, ch in enumerate(r.ljust(g.w, '.')):
                g.c[y][x] = ch
        return g

    def rect(self, x0, y0, x1, y1, ch):
        """Fill the inclusive rectangle (x0, y0)..(x1, y1)."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < self.w and 0 <= y < self.h:
                    self.c[y][x] = ch
        return self

    def put(self, x, y, ch):
        self.c[y][x] = ch
        return self

    def rows(self):
        return [''.join(r) for r in self.c]


def arena(w, h=23, door='left', floor=19, planks=(), lock=True, ceiling=2):
    """A sealed boss room: walls, a ceiling, a flat floor and the door on one side."""
    g = Grid(w, h, '#')
    g.rect(1, ceiling, w - 2, floor - 1, '.')
    for (x0, x1, y) in planks:
        g.rect(x0, y, x1, y, '=')
    dx = 0 if door == 'left' else w - 1
    g.put(dx, floor - 1, '1')
    if lock:
        g.rect(dx, floor - 4, dx, floor - 2, 'L')
    return g


# The older rooms, kept as text grids (scripts/rooms_base.json) and edited below
OLD = json.load(open(os.path.join(HERE, 'rooms_base.json')))


def old(rid):
    return Grid.of(OLD[rid]['tiles'])


R = {}

# =========================================================================== Karakura Town
g = old('kar_hub')
R['kar_hub'] = dict(
    name='Karakura Town', region='kar', pos=[18, 10],
    doors={'1': ['kar_alley', '1'], '2': ['kar_river', '1'], '3': ['kar_roof', '1'], '4': ['end_1', '1']},
    npcs=[
        {'name': 'Rukia Kuchiki', 'gives': 'konso', 'lines': [
            'You can see me? Then you can see them too: the souls who never crossed over.',
            'I am Rukia Kuchiki, a Shinigami. Or I was, until I gave you my power to save your family.',
            'So you are the Shinigami of Karakura now. Your first duty is Konso, the Soul Burial.',
            'Hold {konso} beside a lost soul to send it on to Soul Society. Strike a Hollow with the hilt the same way and you will hear who it used to be.'],
         'after': ['Grand Fisher has been sighted at the hillside cemetery past the river. He hunts with a lure shaped like a girl.',
                   'Do not trust anything that looks helpless out there. Go east, cross the bridge, and climb the stairs.']},
        {'name': 'Kon', 'lines': [
            'Oi, Ichigo! While you run around as a Shinigami, I am stuck in this stuffed lion. Do you know how humiliating that is?',
            'Strike things with {attack} and your Reiatsu swells. Hold {heal} while standing still to press it into your wounds.',
            'Urahara\'s shop is right there. He sells seals, if you have the reishi. Do not let him talk you into anything weird.',
            'That shaft between the towers? Only someone who can grip a wall with their spirit could climb it. And the tunnel under the planks is sealed by a Senkaimon.',
            'Past that gate is some sort of sideways city inside your own head, Ichigo. Urahara says its last door only opens for someone who has every power there is. Every one. Even the mask you will not talk about.']},
    ],
    tiles=None)
g.put(14, 18, '.').put(27, 18, 'N').put(40, 18, 'N')
R['kar_hub']['tiles'] = g.rows()

g = old('kar_alley')
R['kar_alley'] = dict(name='Back Alley', region='kar', pos=[14, 10],
    doors={'1': ['kar_hub', '1'], '2': ['dangai_1', '1']},
    npcs=[{'name': 'Ururu Tsumugiya', 'lines': [
        'Um. That violet glow back there is a Kido seal. Mr. Urahara says something precious is locked behind it.',
        'Seals like that only break to Kido. The Menos haunting the far end of Rukongai is said to guard an incantation.',
        'And the gate floating over the rooftops is a Senkaimon to the Dangai. Only someone who can walk on air could reach it.']}],
    tiles=g.rows())

g = old('kar_roof')
g.put(19, 18, 'i')   # an Acidwire on the rooftops instead of a Rukongai thug
R['kar_roof'] = dict(name='Rooftops', region='kar', pos=[20, 7.7],
    doors={'1': ['kar_hub', '3'], '2': ['sei_2', '2']}, seals=['edge'], tiles=g.rows())

# Onose Riverbank: a street, a bridge over the river, and two ways on
g = Grid(70, 26)
g.rect(0, 19, 15, 25, '#')                      # west street
g.rect(16, 20, 17, 25, '#').rect(18, 21, 19, 25, '#').rect(20, 22, 21, 25, '#')   # steps down
g.rect(22, 23, 48, 25, '#')                     # the riverbed
g.rect(38, 23, 41, 23, '^')                     # a drain full of broken rebar
g.rect(49, 22, 50, 25, '#').rect(51, 21, 52, 25, '#').rect(53, 20, 54, 25, '#')   # steps up
g.rect(55, 19, 69, 25, '#')                     # east street
g.rect(14, 9, 69, 10, '#')                      # the bridge deck
g.rect(34, 9, 37, 9, '=').rect(34, 10, 37, 10, '.')   # a gap in the railing to drop through
g.rect(26, 11, 27, 15, '#').rect(44, 11, 45, 15, '#') # bridge piers
g.rect(0, 0, 0, 16, '#')                        # the wall of the last house
g.rect(7, 15, 11, 15, '=').rect(9, 12, 12, 12, '=')   # stairs up to the bridge
g.rect(3, 4, 7, 4, '#').put(5, 3, 'f')          # a fragment on a ledge only grip or wings reach
g.rect(69, 0, 69, 6, '#').rect(69, 11, 69, 16, '#')
g.put(0, 18, '1').put(69, 18, '2').put(69, 8, '3')
g.put(5, 18, 'N').put(30, 22, 'l')
g.put(25, 22, 'i').put(45, 22, 'i').put(60, 18, 'i').put(40, 5, 'h')
R['kar_river'] = dict(name='Onose Riverbank', region='kar', pos=[24, 10],
    doors={'1': ['kar_hub', '2'], '2': ['ruk_1', '1'], '3': ['kar_grave', '1']},
    npcs=[{'name': 'Yasutora Sado', 'lines': [
        '...Ichigo.', 'Something hunts along this river at night. The spirits that drift here say it wears a little girl as bait.',
        'Up the stairs and over the bridge is the hillside cemetery. Your mother is buried there, isn\'t she.',
        'Under the bridge, the old road runs east into Rukongai. It is a long way across. You will need to be faster than you are now.']}],
    tiles=g.rows())

# The hillside cemetery: Grand Fisher's hunting ground
g = arena(48, planks=[(6, 10, 14), (37, 41, 14)])
g.put(30, 18, 'B')
R['kar_grave'] = dict(name='Hillside Cemetery', region='kar', pos=[31, 7.6],
    doors={'1': ['kar_river', '3']}, boss='fisher', reward='dash', tiles=g.rows())

# =========================================================================== Rukongai
g = old('ruk_1')
g.put(47, 18, '.')   # Shunpo now comes from Grand Fisher
R['ruk_1'] = dict(name='Junrinan, West District 1', region='ruk', pos=[31, 10],
    doors={'1': ['kar_river', '2'], '2': ['ruk_2', '1']},
    npcs=[{'name': 'Old Man of Junrinan', 'lines': [
        'Careful, the ruffians here will beat a soul for a crust of bread. This is the first district, and still it is like this.',
        'The ravine past the shrine is too wide to jump. Only Shunpo, the flash step, gets you across.']}],
    tiles=g.rows())

g = old('ruk_2')
R['ruk_2'] = dict(name='Rukongai Outskirts', region='ruk', pos=[38, 10],
    doors={'1': ['ruk_1', '2'], '2': ['ruk_3', '1'], '3': ['sei_gate', '1']}, seals=['harvest'], tiles=g.rows())

# Inuzuri, District 78: shacks on stilts, a plateau, a cracked floor hiding ore
g = Grid(64, 25)
g.rect(0, 19, 63, 24, '#')
g.rect(12, 19, 14, 19, '^')                     # a pit of nails
g.rect(26, 15, 37, 18, '#')                     # the plateau
g.rect(23, 17, 25, 18, '#').rect(38, 17, 40, 18, '#')
g.rect(4, 14, 9, 14, '=').rect(40, 13, 44, 13, '=').rect(46, 10, 49, 10, '=')
g.rect(58, 6, 63, 6, '#').put(61, 5, 'f')       # a fragment one Shunpo-leap past the roofs
g.rect(63, 0, 63, 4, '#').rect(63, 7, 63, 16, '#')
g.rect(18, 19, 19, 19, 'O').rect(16, 20, 21, 21, '.').put(17, 21, 'o')   # cracked floor over a hollow with ore
g.put(0, 18, '1').put(63, 18, '2')
g.put(8, 18, 'l').put(33, 14, 'N')
g.put(21, 18, 'e').put(45, 18, 'e').put(52, 18, 'g').put(47, 9, 'q')
R['ruk_3'] = dict(name='Inuzuri, District 78', region='ruk', pos=[44, 10],
    doors={'1': ['ruk_2', '2'], '2': ['ruk_boss', '1']},
    npcs=[{'name': 'Ganju Shiba', 'lines': [
        'Who are you calling a thug? I am Ganju Shiba, the number one delinquent of West Rukongai!',
        'You want into the Seireitei? Then you will need to blast through that violet seal in the Outskirts. No Kido, no entry.',
        'A Menos has been howling in the ravine east of here. They say whoever brings it down will learn a real incantation from what is left.',
        'If you get in, find my sister Kukaku. On second thought, do not. She will put you in a cannon.']}],
    tiles=g.rows())

g = old('ruk_boss')
R['ruk_boss'] = dict(name='Hollow Ravine', region='ruk', pos=[50.4, 10],
    doors={'1': ['ruk_3', '2']}, boss='menos', reward='hado', tiles=g.rows())

# =========================================================================== Seireitei
# Hakutomon, the West Gate, held open by Jidanbo
g = Grid(52, 28)
g.rect(0, 24, 51, 27, '#')
g.rect(0, 8, 9, 9, '#')                         # the wall-walk you arrive on
g.rect(0, 0, 0, 5, '#').rect(0, 10, 0, 23, '#')
g.rect(11, 20, 14, 20, '=').rect(6, 16, 9, 16, '=').rect(11, 12, 14, 12, '=')   # the way back up
g.rect(28, 2, 37, 3, '#').rect(30, 4, 35, 19, '#')   # the gate, lifted
g.rect(42, 18, 47, 18, '=')
g.rect(51, 0, 51, 21, '#')
g.put(0, 7, '1').put(51, 23, '2')
g.put(17, 23, 'R').put(21, 23, 'N').put(26, 23, 'N')
g.put(39, 23, 'g').put(45, 17, 'm').put(48, 23, 'm')
R['sei_gate'] = dict(name='Hakutomon, the West Gate', region='sei', pos=[44, 7.2],
    doors={'1': ['ruk_2', '3'], '2': ['sei_ward', '1']},
    npcs=[
        {'name': 'Uryū Ishida', 'lines': [
            'Kurosaki. I came to rescue Kuchiki-san, not to help you. Remember that.',
            'Past this gate is the Seireitei, the court of the Gotei 13. The walls are sekkiseki: they swallow spiritual pressure whole.',
            'Somewhere inside, a wall waits that only a Shinigami who can grip with their Reiatsu could climb. Look for it before you look for trouble.']},
        {'name': 'Jidanbō', 'lines': [
            'You beat a Menos to get here? Then you have earned the right to pass, little Shinigami. Jidanbo keeps his word.',
            'I will hold the White Way Gate open. Inside, the captains do not keep words. Mind the Stealth Force: they strike from behind.',
            'And the Eleventh Division. They do not care who you are. They only care how hard you hit.']},
    ],
    tiles=g.rows())

# The outer ward: over the white walls, across the moat, through a Kido-sealed gate
g = Grid(64, 26)
g.rect(0, 22, 63, 25, '#')
g.rect(9, 18, 12, 18, '=')                      # crates up onto the first wall
g.rect(14, 16, 17, 21, '#')                     # the first white wall
g.rect(18, 21, 25, 21, '^')                     # a moat of spikes: a Shunpo leap across
g.rect(26, 16, 30, 21, '#')                     # the second wall
g.rect(40, 0, 40, 9, '#').rect(40, 10, 40, 21, 'X')   # a sealed gate in the ward wall
g.rect(33, 17, 37, 17, '=').rect(47, 17, 52, 17, '=')
g.put(0, 21, '1').put(63, 21, '2')
g.put(35, 21, 'm').put(32, 21, 'b').put(50, 16, 'q').put(45, 21, 'g').put(56, 21, 'm')
R['sei_ward'] = dict(name='Outer Ward Rooftops', region='sei', pos=[49.2, 7.4],
    doors={'1': ['sei_gate', '2'], '2': ['sei_1', '1']}, tiles=g.rows())

g = old('sei_1')
for y in range(0, 23):
    g.put(1, y, '#')
g.put(0, 8, '3').put(0, 7, '.').put(1, 7, 'G').put(1, 8, 'G')   # a sealed Senkaimon in the west wall
g.rect(2, 9, 8, 9, '#')                         # the ledge in front of it
g.rect(13, 14, 17, 14, '=')
R['sei_1'] = dict(name='Seireitei Courtyard', region='sei', pos=[55.6, 6.4],
    doors={'1': ['sei_ward', '2'], '2': ['sei_2', '1'], '3': ['sei_11', '1']}, abilities=['grip'], tiles=g.rows())

# Eleventh Division training grounds: Kenpachi waits for someone worth the trouble
g = arena(48, door='right', planks=[(6, 10, 14), (37, 41, 14)])
g.put(14, 18, 'B')
R['sei_11'] = dict(name='Eleventh Division Grounds', region='sei', pos=[50.8, 4.8],
    doors={'1': ['sei_1', '3']}, boss='kenpachi', rewardItems=['seal:bell', 'fragment'], tiles=g.rows())

g = old('sei_2')
g.put(14, 12, '.')            # Bakudo now comes from Renji
g.put(19, 12, 'm')            # the Stealth Force instead of a Rukongai thug
g.put(25, 18, '.').put(25, 22, 'b')
g.put(47, 22, '4').put(47, 21, '.')
R['sei_2'] = dict(name='Seireitei Towers', region='sei', pos=[59.6, 1.8],
    doors={'1': ['sei_1', '2'], '2': ['kar_roof', '2'], '3': ['sok_1', '1'], '4': ['sei_4', '1']},
    seals=['focus'], platforms=[{'w': 3, 'dy': 6, 'period': 1.25}], tiles=g.rows())

# The sewers under the Fourth Division: a channel of broken grates and Hanataro's shortcut
g = Grid(56, 25, '#')
g.rect(1, 4, 54, 19, '.')
g.put(0, 18, '.').put(0, 19, '1').put(55, 18, '.').put(55, 19, '2')
g.rect(18, 20, 33, 21, '.').rect(18, 21, 33, 21, '^')
g.rect(23, 20, 24, 21, '#').rect(28, 20, 29, 21, '#')   # stepping stones
g.rect(8, 15, 13, 15, '=').rect(36, 15, 41, 15, '=')
g.rect(48, 8, 53, 8, '#').put(50, 7, 'f')        # climb the east wall for this one
g.put(4, 19, 'R').put(8, 19, 'N')
g.put(16, 19, 'm').put(31, 14, '.').put(38, 14, 'q').put(44, 19, 'b').put(30, 4, 'v')
g.rect(48, 20, 49, 24, '.').put(48, 24, '3').put(49, 24, '3')   # a broken grate: down to the Hall of Lanterns
R['sei_4'] = dict(name='Fourth Division Sewers', region='sei', pos=[64.4, 2.1],
    doors={'1': ['sei_2', '4'], '2': ['sei_renji', '1'], '3': ['sei_lantern', '1']},
    npcs=[{'name': 'Hanatarō Yamada', 'seal': 'kaido', 'lines': [
        'Ah! Please do not hurt me! I am only Hanataro Yamada, Seventh Seat of the Fourth Division. We clean the sewers.',
        'You are going to the Senzaikyu? To Rukia-san? Then the lieutenant of the Sixth Division is waiting on the bridge. Renji Abarai.',
        'Here, take this. It is only a little Kaido, the healing arts of my division, but it helps you mend for less Reiatsu.'],
     'after': ['The bridge is past the end of this tunnel. Renji-san\'s Zabimaru reaches much farther than a sword should. Please be careful!']}],
    tiles=g.rows())

# Senzaikyu Bridge: the long white span to the Tower of Penitence
g = arena(52, planks=[(8, 12, 14), (39, 43, 14)])
g.put(34, 18, 'B')
R['sei_renji'] = dict(name='Senzaikyu Bridge', region='sei', pos=[70, 2.1],
    doors={'1': ['sei_4', '2']}, boss='renji', reward='bakudo', tiles=g.rows())

# =========================================================================== Sokyoku Hill
g = old('sok_1')
g.put(8, 36, 'N')
g.put(0, 2, '.').put(0, 3, '3')   # a gap in the west wall, near the top: the Pressure Shrine
g.rect(34, 8, 38, 8, '=').rect(24, 7, 28, 7, '=').rect(14, 6, 18, 6, '=').rect(5, 5, 9, 5, '=').rect(1, 4, 3, 4, '=')   # planks across to it
R['sok_1'] = dict(name='Sokyoku Ascent', region='sok', pos=[64.4, -2.0],
    doors={'1': ['sei_2', '3'], '2': ['sok_boss', '1'], '3': ['sok_shrine', '1']},
    npcs=[{'name': 'Yoruichi', 'seal': 'shunko', 'lines': [
        'Do not look so surprised. A cat can talk. It is the Shinigami who listen that are rare.',
        'Byakuya Kuchiki waits at the top of the hill. He will not hold back, and Senbonzakura does not miss.',
        'Here: Shunko, a trick of mine. Pour your Reiatsu into your back and shoulders, and your Shunpo will cut whatever it passes through.'],
     'after': ['When the petals come, do not stand still. Byakuya is patient. You must not be.']}],
    tiles=g.rows())

g = old('sok_boss')
R['sok_boss'] = dict(name='Sokyoku Hill', region='sok', pos=[69.2, -3.1],
    doors={'1': ['sok_1', '2'], '2': ['hm_1', '1']}, boss='byakuya', reward='wings', tiles=g.rows())

# =========================================================================== Hueco Mundo
g = old('hm_1')
g.put(11, 18, '.').put(15, 18, 'N')
for (x, y) in [(31, 14), (32, 14), (33, 14), (24, 16), (25, 16), (26, 16), (38, 16), (39, 16), (40, 16)]:
    g.put(x, y, '.')
g.rect(26, 12, 29, 12, '=').rect(36, 12, 39, 12, '=')   # sand ledges only Hirenkyaku reaches
g.rect(55, 14, 59, 14, '=').rect(58, 10, 62, 10, '=').rect(53, 6, 57, 6, '=').rect(57, 2, 61, 2, '=')   # bone steps into the sky
g.put(59, 0, '4').put(60, 0, '4')
R['hm_1'] = dict(name='Hueco Mundo', region='hm', pos=[73.2, -4.6],
    doors={'1': ['sok_boss', '2'], '2': ['hm_2', '1'], '3': ['forest_1', '1'], '4': ['hm_sand', '1']},
    npcs=[{'name': 'Nel Tu', 'lines': [
        'Itsygo! Nel knew it was you! Nel smelled your Reiatsu from all the way over the dunes!',
        'That big white palace is Las Noches. The Espada live there. They are scary. Nel does not go there. Mostly.',
        'The sand at the far east rings hollow. Hit it hard from above and it falls into the Forest of Menos. Nel fell in once. It was not fun.']}],
    tiles=g.rows())

g = old('hm_2')
g.put(8, 5, 'r')              # a petal of Orihime's hairpin
g.put(36, 26, '.')            # Senkaimon Burst now comes from Grimmjow
g.rect(44, 8, 55, 10, '.').put(55, 10, '4')
g.rect(36, 22, 40, 22, '=').rect(39, 18, 43, 18, '=').rect(38, 14, 42, 14, '=')
R['hm_2'] = dict(name='Las Noches Corridor', region='hm', pos=[79.6, -5.4],
    doors={'1': ['hm_1', '2'], '2': ['hm_boss', '1'], '3': ['hm_side', '1'], '4': ['hm_3', '1']}, tiles=g.rows())

# The halls inside Las Noches: Exequias on patrol, and Orihime held in a white room
g = Grid(60, 30, '#')
g.rect(1, 3, 58, 26, '.')
g.rect(0, 9, 0, 10, '.').put(0, 10, '1')
g.rect(1, 11, 10, 11, '#')
g.rect(10, 22, 13, 22, '=').rect(4, 18, 8, 18, '=').rect(9, 14, 12, 14, '=')
g.rect(14, 3, 15, 16, '#').rect(44, 3, 45, 16, '#')   # columns hung from the ceiling
g.rect(24, 19, 28, 19, '=').rect(28, 12, 32, 12, '=').rect(27, 6, 33, 6, '#')
g.rect(29, 0, 31, 2, '.').rect(29, 2, 31, 2, 'D').put(30, 0, '3')   # sealed by the Bankai door
g.rect(48, 21, 53, 21, '=')
g.put(59, 25, '.').put(59, 26, '2')
g.put(8, 10, 'l').put(36, 26, 'N')
g.put(22, 26, 'x').put(41, 26, 'x').put(50, 20, 'a').put(54, 26, 'j')
R['hm_3'] = dict(name='Las Noches Halls', region='hm', pos=[85.2, -5.4],
    doors={'1': ['hm_2', '4'], '2': ['hm_grimm', '1'], '3': ['hm_dome', '1']},
    npcs=[{'name': 'Orihime Inoue', 'heals': True, 'lines': [
        'Kurosaki-kun! You came all this way... Hold still. Soten Kisshun: I reject.',
        'There. All your wounds are gone. Come back whenever you are hurt. I am not going anywhere, it seems.',
        'Grimmjow is in the Sixth Palace, past the east hall. And Ulquiorra keeps to the top of the dome. Please, do not go up there yet.']}],
    tiles=g.rows())

# The Sixth Palace: Grimmjow's hall
g = arena(52, planks=[(8, 12, 13), (39, 43, 13)])
g.put(34, 18, 'B')
R['hm_grimm'] = dict(name='Sixth Palace', region='hm', pos=[91.2, -4.6],
    doors={'1': ['hm_3', '2']}, boss='grimmjow', reward='burst', tiles=g.rows())

g = old('hm_side')
R['hm_side'] = dict(name='Mask Shrine', region='hm', pos=[79.6, -7.7],
    doors={'1': ['hm_2', '3']}, abilities=['hollow'], seals=['long'],
    npcs=[{'name': 'Shinji Hirako', 'lines': [
        'Yo. Shinji Hirako, Vizard. You smell like a Shinigami who looked into the dark and liked it.',
        'Take the mask if you want. It will make you strong. Every second you wear it, the thing inside gets louder.',
        'When the edges of your sight turn red, take it off. Or don\'t, and find out who you really are.']}],
    tiles=g.rows())

g = old('hm_boss')
g.put(3, 18, '.')             # no rest gate inside the arena
R['hm_boss'] = dict(name='Throne of Sand', region='hm', pos=[85.2, -2.4],
    doors={'1': ['hm_2', '2']}, boss='vasto', reward='bankai', tiles=g.rows())

# The top of the dome of Las Noches, under the false sky: Ulquiorra
g = Grid(52, 28, '.')
g.rect(0, 22, 51, 27, '#')
g.rect(0, 0, 0, 21, '#').rect(51, 0, 51, 21, '#')
g.rect(25, 22, 27, 26, '.').put(26, 27, '1')
g.rect(25, 22, 27, 22, 'L')
g.rect(6, 16, 10, 16, '=').rect(41, 16, 45, 16, '=').rect(22, 11, 30, 11, '=')
g.put(40, 21, 'B')
R['hm_dome'] = dict(name='Dome of Las Noches', region='hm', pos=[85.6, -8.2],
    doors={'1': ['hm_3', '3']}, boss='ulquiorra', rewardItems=['seal:hierro', 'ore'], tiles=g.rows())

# =========================================================================== the Forest of Menos
g = old('forest_1')
g.put(22, 6, 'r')   # a petal of Orihime's hairpin, over the long ledge
R['forest_1'] = dict(name='Forest of Menos', region='for', pos=[76.7, -2.3],
    doors={'1': ['hm_1', '3'], '2': ['forest_2', '1']}, seals=['phantom'],
    npcs=[{'name': 'Ashido Kanō', 'lines': [
        'A Shinigami? Here? I am Ashido Kano. I have lived in this forest longer than I can count, wearing what I have killed.',
        'The Gillian here are not hunting you. They are hiding from something deeper in, something that eats Hollows and hates the light.',
        'Nobody has ever seen it. Strike what you cannot see with the Konso hilt, and it may answer.']}],
    tiles=g.rows())

g = old('forest_2')
g.put(3, 18, '.')             # no rest gate inside the arena
R['forest_2'] = dict(name='Hollow Clearing', region='for', pos=[81.1, 0.1],
    doors={'1': ['forest_1', '2']}, boss='espada', rewardItems=['ore', 'fragment'], tiles=g.rows())

# =========================================================================== the Dangai
g = old('dangai_1')
R['dangai_1'] = dict(name='The Dangai', region='dan', pos=[-1.5, 5.6],
    doors={'1': ['kar_alley', '2'], '2': ['dangai_2', '1']}, chase=True, tiles=g.rows())

g = old('dangai_2')
g.put(12, 13, 'r')            # a petal of Orihime's hairpin
R['dangai_2'] = dict(name='Precipice Shrine', region='dan', pos=[-5.5, 5.6],
    doors={'1': ['dangai_1', '2']}, abilities=['getsuga'], seals=['moonfang'],
    npcs=[{'name': 'Zangetsu', 'lines': [
        'You outran the Kototsu. Good. Those who stop moving in the Dangai become part of its walls.',
        'Do you not know my name? I am Zangetsu. I am your power, and I have waited a long time for you to come this far.',
        'Hold {attack} and let your Reiatsu pour into me. Then let it go. That is Getsuga Tensho: the Moon Fang that pierces the heavens.']}],
    tiles=g.rows())

# =========================================================================== the Inner World
g = old('end_1')
R['end_1'] = dict(name='Sideways City', region='end', pos=[12, 12.4], sealAll=True,
    doors={'1': ['kar_hub', '4'], '2': ['end_boss', '1']}, tiles=g.rows())

g = old('end_boss')
R['end_boss'] = dict(name='Heart of the Inner World', region='end', pos=[7.2, 12.4],
    doors={'1': ['end_1', '2']}, boss='final', tiles=g.rows())



# =========================================================================== puzzle rooms
# Hall of Lanterns, under the Fourth Division: strike a lantern and the gold barriers (Q) open while
# blue ones (K) rise as walls of light, until the flame dies. The way up is a wall that is only
# there while the lantern burns; the way out is the lantern at the far end.
g = Grid(52, 22, '#')
g.rect(1, 2, 50, 18, '.')
g.rect(49, 0, 50, 1, '.').put(49, 0, '1').put(50, 0, '1')   # the grate from the sewers
g.rect(1, 1, 30, 3, '#')                        # the gallery roof
g.rect(1, 8, 30, 8, '#')                        # the gallery floor
g.rect(31, 8, 31, 18, 'K')                      # a wall of light that rises while the flame burns
g.rect(24, 4, 24, 7, 'Q').rect(16, 4, 16, 7, 'Q')   # gold barriers across the gallery
g.put(44, 18, 't').put(7, 7, 't')               # lanterns: one by the grate, one past the barriers
g.put(3, 7, 'C').put(11, 7, 'f')                # Kon's spare Gikongan, and a fragment
g.put(20, 18, 'm').put(11, 18, 'q').put(38, 18, 'g')
R['sei_lantern'] = dict(name='Hall of Lanterns', region='sei', pos=[64.4, 4.7],
    doors={'1': ['sei_4', '3']}, tiles=g.rows())

# The Sinking Dunes, above Hueco Mundo: white sand that swallows whatever stands still on it.
# Bone pillars stick out of it; the far shelf holds a petal and a fragment.
g = Grid(60, 23)
g.rect(0, 0, 0, 22, '#')
g.rect(0, 19, 59, 22, '#')
g.rect(6, 19, 45, 20, 's')                      # quicksand, two tiles deep, over bedrock
g.rect(1, 14, 5, 18, '#')                       # the far shelf
g.rect(13, 15, 14, 18, '#').rect(22, 13, 23, 18, '#').rect(31, 15, 32, 18, '#').rect(39, 12, 40, 18, '#')   # bone pillars
g.rect(52, 19, 53, 22, '.').put(52, 22, '1').put(53, 22, '1')   # the way down to Hueco Mundo
g.put(2, 13, 'r').put(4, 13, 'f')
g.put(49, 18, 'a').put(20, 6, 'h').put(35, 7, 'h')
R['hm_sand'] = dict(name='Sinking Dunes', region='hm', pos=[73.4, -6.9],
    doors={'1': ['hm_1', '4']}, tiles=g.rows())

# The Pressure Shrine, beside the Sokyoku: a tunnel where a captain's spirit pressure still lies
# heavy (p). It drags you down, slows you, and drains your Reiatsu; Shunpo is the way across.
g = Grid(50, 38, '#')
g.rect(1, 2, 48, 33, '.')
g.put(49, 2, '.').put(49, 3, '1')                 # the gap from the Sokyoku Ascent
g.rect(1, 2, 40, 21, '#')                       # the cliff above the tunnel
g.rect(44, 4, 48, 4, '=')                       # the ledge you arrive on
g.rect(4, 33, 40, 33, '^')                      # the tunnel floor: spikes
for x in (36, 29, 22, 15, 8):
    g.rect(x, 32, x + 1, 33, '#')               # stepping stones
g.rect(1, 31, 3, 33, '#')                       # the shrine at the far end
g.rect(4, 22, 40, 31, 'p').rect(4, 32, 7, 32, 'p').rect(10, 32, 14, 32, 'p').rect(17, 32, 21, 32, 'p').rect(24, 32, 28, 32, 'p').rect(31, 32, 35, 32, 'p').rect(38, 32, 40, 32, 'p')
g.put(2, 30, 'r').put(1, 30, 'f')
g.put(44, 16, 'h').put(46, 32, 'g')
R['sok_shrine'] = dict(name='Pressure Shrine', region='sok', pos=[59.4, -2.0],
    doors={'1': ['sok_1', '3']}, tiles=g.rows())

# =========================================================================== hidden places
# Urahara's Study Room: a vast cavern under the shop with a painted sky. Reached through the shop;
# the ladder (U) climbs back up. Urahara runs his "light exercise" here.
g = Grid(60, 24, '#')
g.rect(1, 1, 58, 19, '.')
g.rect(10, 15, 14, 15, '=').rect(45, 15, 49, 15, '=').rect(26, 11, 33, 11, '=')
g.rect(20, 17, 22, 19, '#').rect(37, 17, 39, 19, '#')   # boulders
g.put(4, 19, 'P').put(2, 19, 'U').put(8, 19, 'N')
g.put(30, 10, 'f')   # a fragment on the high ledge (Urahara does not say who left it)
R['kar_study'] = dict(name='The Study Room', region='stu', pos=[18.2, 12.6], doors={},
    npcs=[{'name': 'Kisuke Urahara', 'study': True, 'lines': [
        'Welcome to my little study room! I dug it out myself. Well, Tessai did. Mostly Tessai.',
        'The sky is painted on. Please do not tell anyone.']}],
    tiles=g.rows())

# The Soul King Palace: Ichibē Hyōsube of the Royal Guard waits by the altar of the trials (A)
g = Grid(56, 24, '#')
g.rect(1, 1, 54, 19, '.')
g.rect(0, 0, 55, 0, '.')
g.rect(9, 14, 14, 14, '=').rect(41, 14, 46, 14, '=').rect(22, 10, 33, 10, '=')
g.put(6, 19, 'R').put(28, 19, 'A').put(20, 19, 'N')
R['palace'] = dict(name='Hall of the Royal Guard', region='rei', pos=[18, 4.5], doors={},
    npcs=[{'name': 'Ichibē Hyōsube', 'lines': [
        'Ho! So you are the one who learned every name in the three worlds. I am Ichibe Hyosube of the Royal Guard. I name things.',
        'This altar holds the memory of every fight you have won. Touch it, and fight them again, one after another, as they were.',
        'Carry all of it through to the end, and you will see what lies under the last name. Bind yourself, if you want a harder road. The altar remembers both.']}],
    tiles=g.rows())

# =========================================================================== world 3
from new_rooms import add_rooms
NEW_ROOMS = add_rooms(R, Grid)


# --------------------------------------------------------------------------- entrances
# World 4: rooms grow a run-up beside every doorway on their edge, and no foe stands within reach of a way in.
PAD = 9            # tiles added beside an edge doorway
SAFE = 22          # tiles of distance foes keep from every doorway
GROUND_FOES = set('eganiqmxb')
FLYING_FOES = set('hj')
CEILING_FOES = set('v')
FOES = GROUND_FOES | FLYING_FOES | CEILING_FOES
STRUCTURAL = set('#=.^sp')   # may be copied into the new run-up as they are; everything else becomes air there


def widen(R):
    pads = {}
    for rid, r in R.items():
        rows = [list(x) for x in r['tiles']]
        w = len(rows[0])
        if r.get('boss') or rid in ('end_boss', 'hm_grimm', 'dangai_1'):
            pads[rid] = 0
            continue
        left = any(row[0] in '123456789' for row in rows)
        right = any(row[w - 1] in '123456789' for row in rows)
        out = []
        for row in rows:
            blank = lambda c: c if c in STRUCTURAL else '.'
            new = ([row[0]] + [blank(row[1])] * PAD + row[1:]) if left else list(row)
            if right:
                new = new[:-1] + [blank(new[-2])] * PAD + [new[-1]]
            out.append(new)
        r['tiles'] = [''.join(x) for x in out]
        pads[rid] = PAD if left else 0
    return pads


def steer_foes(R):
    """Move foes out of the doorway zone toward the middle of their room (same row, nearest legal spot)."""
    moved = 0
    for rid, r in R.items():
        rows = [list(x) for x in r['tiles']]
        h, w = len(rows), len(rows[0])
        doors = [(x, y) for y in range(h) for x in range(w) if rows[y][x] in '123456789']
        if not doors:
            continue

        def near(x, y):
            return min((abs(x - dx) for dx, dy in doors if abs(y - dy) < 8), default=999)

        def legal(c, x, y):
            if not (1 <= x < w - 1) or rows[y][x] != '.':
                return False
            if y < 1 or rows[y - 1][x] != '.':          # foes are two tiles tall
                return False
            below = rows[y + 1][x] if y + 1 < h else '#'
            if c in GROUND_FOES:
                return below in '#=' and rows[y][x - 1] != '^' and rows[y][x + 1] != '^'
            return True
        for y in range(h):
            for x in range(w):
                c = rows[y][x]
                if c not in FOES or c in CEILING_FOES or near(x, y) >= SAFE:
                    continue
                for nx in sorted(range(1, w - 1), key=lambda v: abs(v - x)):
                    if near(nx, y) >= SAFE and legal(c, nx, y):
                        rows[y][x] = '.'
                        rows[y][nx] = c
                        moved += 1
                        break
        r['tiles'] = [''.join(x) for x in rows]
    return moved


PADS = widen(R)
print('foes steered', steer_foes(R))

# Where each room sits on the map (top-left corner, in map units: a room's box is its size in tiles divided by ten).
# Rooms stand beside the door that leads to them, with a gap between neighbours so names and marks never crowd.
LAYOUT = {
    # Karakura, and the worlds beside it
    'kar_alley': (-5.0, 0.0), 'kar_hub': (0.0, 0.0), 'kar_study': (2.2, 3.2), 'end_1': (-6.8, 3.4), 'end_boss': (-12.4, 3.4),
    'kar_roof': (3.8, -3.2), 'kar_river': (6.9, 0.0), 'kar_canal': (14.7, 0.0), 'kar_grave': (14.7, -3.2),
    'dangai_1': (-16.0, -8.0), 'dangai_2': (-0.2, -8.0), 'dangai_3': (4.6, -8.0),
    # Rukongai
    'ruk_1': (22.7, 0.0), 'ruk_orchard': (30.5, -0.7), 'ruk_kido_hall': (30.5, -3.9), 'ruk_2': (38.3, 0.0), 'ruk_3': (45.1, 0.0),
    'ruk_ravine_edge': (52.3, 0.0), 'ruk_boss': (59.1, 0.0),
    # the Seireitei
    'sei_gate': (44.5, -6.4), 'sei_canal': (50.5, -6.4), 'sei_ward': (57.7, -6.4), 'sei_barracks': (64.9, -6.4),
    'sei_11': (66.6, -3.4), 'sei_1': (71.7, -7.0), 'sei_2': (75.6, -12.5), 'sei_infirmary': (81.2, -10.3), 'sei_4': (87.6, -10.3),
    'sei_renji': (94.0, -10.3), 'sei_lantern': (87.5, -6.9),
    # Sokyoku Hill
    'sok_1': (81.3, -15.3), 'sok_shrine': (75.4, -19.5), 'sok_stair': (87.0, -14.9), 'sok_boss': (93.9, -14.9),
    # Hueco Mundo
    'hm_1': (98.8, -16.4), 'hm_sand': (99.5, -20.3), 'hm_dunes': (106.0, -17.1), 'hm_vault': (110.8, -20.3),
    'hm_2': (115.3, -17.2), 'hm_side': (116.4, -20.4), 'hm_3': (121.8, -17.2), 'hm_dome': (122.2, -20.9), 'hm_boss': (121.8, -12.5),
    'hm_hall2': (128.7, -16.4), 'hm_grimm': (136.0, -16.4),
    'forest_1': (102.3, -13.2), 'forest_depths': (107.6, -11.1), 'forest_2': (115.7, -10.8),
    'palace': (6.0, -14.0),
}


XSCALE = 1.45      # the map spreads sideways as rooms grow


def apply_layout(R):
    boxes = {}
    for rid, r in R.items():
        x, y = LAYOUT[rid]
        x = round(x * XSCALE, 1)
        r['pos'] = [x, y]
        boxes[rid] = (x, y, len(r['tiles'][0]) / 10, len(r['tiles']) / 10)
    ids = sorted(boxes)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ax, ay, aw, ah = boxes[a]
            bx, by, bw, bh = boxes[b]
            assert not (ax < bx + bw + 0.3 and bx < ax + aw + 0.3 and ay < by + bh + 0.3 and by < ay + ah + 0.3), ('map boxes touch', a, b)


assert set(LAYOUT) == set(R), set(LAYOUT) ^ set(R)
apply_layout(R)

# --------------------------------------------------------------------------- write
ORDER = ['kar_hub', 'kar_alley', 'kar_roof', 'kar_river', 'kar_grave',
         'ruk_1', 'ruk_2', 'ruk_3', 'ruk_boss',
         'sei_gate', 'sei_ward', 'sei_1', 'sei_11', 'sei_2', 'sei_4', 'sei_renji',
         'sok_1', 'sok_boss',
         'hm_1', 'hm_2', 'hm_3', 'hm_grimm', 'hm_side', 'hm_boss', 'hm_dome',
         'forest_1', 'forest_2', 'dangai_1', 'dangai_2', 'end_1', 'end_boss',
         'sei_lantern', 'hm_sand', 'sok_shrine', 'kar_study', 'palace'] + NEW_ROOMS
assert sorted(ORDER) == sorted(R), set(R) ^ set(ORDER)

HEADER = '''// Room layouts, generated by scripts/build_rooms.py (edit that file, then run it).
// Every row of `tiles` is one row of 16px tiles.
// Legend:  # solid   = one-way platform   ^ spikes   X Kido seal (break with Hado)
//          G Senkaimon gate (break with Burst)   O cracked wall (slash it)   D Bankai seal door
//          H hidden platform (Konso true sight)  ~ collapsing floor (boss phase)   L boss-lock cell
//          P new-game start   R rest gate   S shop   N npc   B boss   k ability   c seal
//          f soul fragment    l lost plus   e thug   g corrupted shinigami   h lesser hollow swarm
//          j adjuchas         a shade arrancar   n gillian   M bindable moving platform   1-9 doors (on room edges)
//          W swordsmith       o reishi ore       Z Senkaimon portal (decoration)
//          q kido caster      v ceiling diver (put it on the row under a ceiling)
//          u reishi geyser (on the floor)        y stalactite (on the row under a ceiling)
//          i acidwire crawler m onmitsukido agent  x exequias   b eleventh division brawler
//          t lantern (strike it)   Q gold barrier (open while a lantern burns)   K blue barrier (solid only then)
//          s quicksand   p spirit pressure (air that drags you down)   r Shun Shun Rikka petal   C Kon's Gikongan
//          U ladder up to the shop   A altar of the trials   w power upgrade (read from the room's `upgrades`)
// A room with sealAll: its Bankai seal doors open only to someone holding every power.
// NPC entries: name, lines, and optionally gives (an ability), seal (a seal they hand over once),
// heals (talking restores health) and after (what they say once they have given their gift).
'use strict';
const ROOMS = {
'''


def js(v, ind):
    return json.dumps(v, ensure_ascii=False)


with open(OUT, 'w') as f:
    f.write(HEADER)
    for rid in ORDER:
        r = R[rid]
        rows = r['tiles']
        w = max(len(x) for x in rows)
        assert all(len(x) == w for x in rows), (rid, [len(x) for x in rows])
        f.write('  %s: {\n' % rid)
        for k in ['name', 'region', 'pos', 'doors', 'boss', 'reward', 'rewardItems', 'chase', 'sealAll', 'abilities', 'seals', 'upgrades', 'platforms', 'npcs']:
            if k in r and r[k] is not None:
                f.write('    %s: %s,\n' % (k, js(r[k], 4)))
        f.write('    tiles: [\n')
        for row in rows:
            f.write("      '%s',\n" % row)
        f.write('    ],\n  },\n')
    f.write('};\n')
print('wrote', OUT, len(ORDER), 'rooms')
