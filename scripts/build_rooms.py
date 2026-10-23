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


OLD = json.load(open('/tmp/claude-1000/-home-hamza-Desktop-soulDrift/03a4ef70-f662-4ffa-a1d6-5f5df8fa597d/scratchpad/rooms_old.json')) \
    if os.path.exists('/tmp/claude-1000/-home-hamza-Desktop-soulDrift/03a4ef70-f662-4ffa-a1d6-5f5df8fa597d/scratchpad/rooms_old.json') else None
if OLD is None:
    raise SystemExit('rooms_old.json missing: export the current rooms first')


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
            'That shaft between the towers? Only someone who can grip a wall with their spirit could climb it. And the tunnel under the planks is sealed by a Senkaimon.']},
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
g.rect(69, 0, 69, 6, '#').rect(69, 11, 69, 17, '#')
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
g.rect(63, 0, 63, 5, '#').rect(63, 7, 63, 17, '#')
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
g.rect(0, 0, 0, 6, '#').rect(0, 10, 0, 23, '#')
g.rect(11, 20, 14, 20, '=').rect(6, 16, 9, 16, '=').rect(11, 12, 14, 12, '=')   # the way back up
g.rect(28, 2, 37, 3, '#').rect(30, 4, 35, 19, '#')   # the gate, lifted
g.rect(42, 18, 47, 18, '=')
g.rect(51, 0, 51, 22, '#')
g.put(0, 7, '1').put(51, 23, '2')
g.put(17, 23, 'R').put(21, 23, 'N').put(26, 23, 'N')
g.put(39, 23, 'g').put(45, 17, 'm').put(48, 23, 'm')
R['sei_gate'] = dict(name='Hakutomon, the West Gate', region='sei', pos=[44, 7.2],
    doors={'1': ['ruk_2', '3'], '2': ['sei_1', '1']},
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

g = old('sei_1')
for y in range(0, 23):
    g.put(1, y, '#')
g.put(0, 8, '3').put(0, 7, '.').put(1, 7, 'G').put(1, 8, 'G')   # a sealed Senkaimon in the west wall
g.rect(2, 9, 8, 9, '#')                         # the ledge in front of it
g.rect(13, 14, 17, 14, '=')
R['sei_1'] = dict(name='Seireitei Courtyard', region='sei', pos=[49.2, 6.4],
    doors={'1': ['sei_gate', '2'], '2': ['sei_2', '1'], '3': ['sei_11', '1']}, abilities=['grip'], tiles=g.rows())

# Eleventh Division training grounds: Kenpachi waits for someone worth the trouble
g = arena(48, door='right', planks=[(6, 10, 14), (37, 41, 14)])
g.put(14, 18, 'B')
R['sei_11'] = dict(name='Eleventh Division Grounds', region='sei', pos=[44.4, 4.8],
    doors={'1': ['sei_1', '3']}, boss='kenpachi', rewardItems=['seal:bell', 'fragment'], tiles=g.rows())

g = old('sei_2')
g.put(14, 12, '.')            # Bakudo now comes from Renji
g.put(19, 12, 'm')            # the Stealth Force instead of a Rukongai thug
g.put(25, 18, '.').put(25, 22, 'b')
g.put(47, 22, '4').put(47, 21, '.')
R['sei_2'] = dict(name='Seireitei Towers', region='sei', pos=[53.2, 1.8],
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
R['sei_4'] = dict(name='Fourth Division Sewers', region='sei', pos=[58, 2.1],
    doors={'1': ['sei_2', '4'], '2': ['sei_renji', '1']},
    npcs=[{'name': 'Hanatarō Yamada', 'seal': 'kaido', 'lines': [
        'Ah! Please do not hurt me! I am only Hanataro Yamada, Seventh Seat of the Fourth Division. We clean the sewers.',
        'You are going to the Senzaikyu? To Rukia-san? Then the lieutenant of the Sixth Division is waiting on the bridge. Renji Abarai.',
        'Here, take this. It is only a little Kaido, the healing arts of my division, but it helps you mend for less Reiatsu.'],
     'after': ['The bridge is past the end of this tunnel. Renji-san\'s Zabimaru reaches much farther than a sword should. Please be careful!']}],
    tiles=g.rows())

# Senzaikyu Bridge: the long white span to the Tower of Penitence
g = arena(52, planks=[(8, 12, 14), (39, 43, 14)])
g.put(34, 18, 'B')
R['sei_renji'] = dict(name='Senzaikyu Bridge', region='sei', pos=[63.6, 2.1],
    doors={'1': ['sei_4', '2']}, boss='renji', reward='bakudo', tiles=g.rows())

# =========================================================================== Sokyoku Hill
g = old('sok_1')
g.put(8, 36, 'N')
R['sok_1'] = dict(name='Sokyoku Ascent', region='sok', pos=[58, -2.0],
    doors={'1': ['sei_2', '3'], '2': ['sok_boss', '1']},
    npcs=[{'name': 'Yoruichi', 'seal': 'shunko', 'lines': [
        'Do not look so surprised. A cat can talk. It is the Shinigami who listen that are rare.',
        'Byakuya Kuchiki waits at the top of the hill. He will not hold back, and Senbonzakura does not miss.',
        'Here: Shunko, a trick of mine. Pour your Reiatsu into your back and shoulders, and your Shunpo will cut whatever it passes through.'],
     'after': ['When the petals come, do not stand still. Byakuya is patient. You must not be.']}],
    tiles=g.rows())

g = old('sok_boss')
R['sok_boss'] = dict(name='Sokyoku Hill', region='sok', pos=[62.8, -3.1],
    doors={'1': ['sok_1', '2'], '2': ['hm_1', '1']}, boss='byakuya', reward='wings', tiles=g.rows())

# =========================================================================== Hueco Mundo
g = old('hm_1')
g.put(11, 18, '.').put(15, 18, 'N')
for (x, y) in [(31, 14), (32, 14), (33, 14), (24, 16), (25, 16), (26, 16), (38, 16), (39, 16), (40, 16)]:
    g.put(x, y, '.')
g.rect(26, 12, 29, 12, '=').rect(36, 12, 39, 12, '=')   # sand ledges only Hirenkyaku reaches
R['hm_1'] = dict(name='Hueco Mundo', region='hm', pos=[66.8, -4.6],
    doors={'1': ['sok_boss', '2'], '2': ['hm_2', '1'], '3': ['forest_1', '1']},
    npcs=[{'name': 'Nel Tu', 'lines': [
        'Itsygo! Nel knew it was you! Nel smelled your Reiatsu from all the way over the dunes!',
        'That big white palace is Las Noches. The Espada live there. They are scary. Nel does not go there. Mostly.',
        'The sand at the far east rings hollow. Hit it hard from above and it falls into the Forest of Menos. Nel fell in once. It was not fun.']}],
    tiles=g.rows())

g = old('hm_2')
g.put(36, 26, '.')            # Senkaimon Burst now comes from Grimmjow
g.rect(44, 8, 55, 10, '.').put(55, 10, '4')
g.rect(36, 22, 40, 22, '=').rect(39, 18, 43, 18, '=').rect(38, 14, 42, 14, '=')
R['hm_2'] = dict(name='Las Noches Corridor', region='hm', pos=[73.2, -5.4],
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
R['hm_3'] = dict(name='Las Noches Halls', region='hm', pos=[78.8, -5.4],
    doors={'1': ['hm_2', '4'], '2': ['hm_grimm', '1'], '3': ['hm_dome', '1']},
    npcs=[{'name': 'Orihime Inoue', 'heals': True, 'lines': [
        'Kurosaki-kun! You came all this way... Hold still. Soten Kisshun: I reject.',
        'There. All your wounds are gone. Come back whenever you are hurt. I am not going anywhere, it seems.',
        'Grimmjow is in the Sixth Palace, past the east hall. And Ulquiorra keeps to the top of the dome. Please, do not go up there yet.']}],
    tiles=g.rows())

# The Sixth Palace: Grimmjow's hall
g = arena(52, planks=[(8, 12, 13), (39, 43, 13)])
g.put(34, 18, 'B')
R['hm_grimm'] = dict(name='Sixth Palace', region='hm', pos=[84.8, -4.6],
    doors={'1': ['hm_3', '2']}, boss='grimmjow', reward='burst', tiles=g.rows())

g = old('hm_side')
R['hm_side'] = dict(name='Mask Shrine', region='hm', pos=[73.2, -7.7],
    doors={'1': ['hm_2', '3']}, abilities=['hollow'], seals=['long'],
    npcs=[{'name': 'Shinji Hirako', 'lines': [
        'Yo. Shinji Hirako, Vizard. You smell like a Shinigami who looked into the dark and liked it.',
        'Take the mask if you want. It will make you strong. Every second you wear it, the thing inside gets louder.',
        'When the edges of your sight turn red, take it off. Or don\'t, and find out who you really are.']}],
    tiles=g.rows())

g = old('hm_boss')
g.put(3, 18, '.')             # no rest gate inside the arena
R['hm_boss'] = dict(name='Throne of Sand', region='hm', pos=[78.8, -2.4],
    doors={'1': ['hm_2', '2']}, boss='vasto', reward='bankai', tiles=g.rows())

# The top of the dome of Las Noches, under the false sky: Ulquiorra
g = Grid(52, 28, '.')
g.rect(0, 22, 51, 27, '#')
g.rect(0, 0, 0, 21, '#').rect(51, 0, 51, 21, '#')
g.rect(25, 22, 27, 26, '.').put(26, 27, '1')
g.rect(25, 22, 27, 22, 'L')
g.rect(6, 16, 10, 16, '=').rect(41, 16, 45, 16, '=').rect(22, 11, 30, 11, '=')
g.put(40, 21, 'B')
R['hm_dome'] = dict(name='Dome of Las Noches', region='hm', pos=[79.2, -8.2],
    doors={'1': ['hm_3', '3']}, boss='ulquiorra', rewardItems=['seal:hierro', 'ore'], tiles=g.rows())

# =========================================================================== the Forest of Menos
g = old('forest_1')
R['forest_1'] = dict(name='Forest of Menos', region='for', pos=[70.3, -2.3],
    doors={'1': ['hm_1', '3'], '2': ['forest_2', '1']}, seals=['phantom'],
    npcs=[{'name': 'Ashido Kanō', 'lines': [
        'A Shinigami? Here? I am Ashido Kano. I have lived in this forest longer than I can count, wearing what I have killed.',
        'The Gillian here are not hunting you. They are hiding from something deeper in, something that eats Hollows and hates the light.',
        'Nobody has ever seen it. Strike what you cannot see with the Konso hilt, and it may answer.']}],
    tiles=g.rows())

g = old('forest_2')
g.put(3, 18, '.')             # no rest gate inside the arena
R['forest_2'] = dict(name='Hollow Clearing', region='for', pos=[74.7, 0.1],
    doors={'1': ['forest_1', '2']}, boss='espada', rewardItems=['ore', 'fragment'], tiles=g.rows())

# =========================================================================== the Dangai
g = old('dangai_1')
R['dangai_1'] = dict(name='The Dangai', region='dan', pos=[-1.5, 5.6],
    doors={'1': ['kar_alley', '2'], '2': ['dangai_2', '1']}, chase=True, tiles=g.rows())

g = old('dangai_2')
R['dangai_2'] = dict(name='Precipice Shrine', region='dan', pos=[-5.5, 5.6],
    doors={'1': ['dangai_1', '2']}, abilities=['getsuga'], seals=['moonfang'],
    npcs=[{'name': 'Zangetsu', 'lines': [
        'You outran the Kototsu. Good. Those who stop moving in the Dangai become part of its walls.',
        'Do you not know my name? I am Zangetsu. I am your power, and I have waited a long time for you to come this far.',
        'Hold {attack} and let your Reiatsu pour into me. Then let it go. That is Getsuga Tensho: the Moon Fang that pierces the heavens.']}],
    tiles=g.rows())

# =========================================================================== the Inner World
g = old('end_1')
R['end_1'] = dict(name='Sideways City', region='end', pos=[12, 12.4],
    doors={'1': ['kar_hub', '4'], '2': ['end_boss', '1']}, tiles=g.rows())

g = old('end_boss')
R['end_boss'] = dict(name='Heart of the Inner World', region='end', pos=[7.2, 12.4],
    doors={'1': ['end_1', '2']}, boss='final', tiles=g.rows())


# --------------------------------------------------------------------------- write
ORDER = ['kar_hub', 'kar_alley', 'kar_roof', 'kar_river', 'kar_grave',
         'ruk_1', 'ruk_2', 'ruk_3', 'ruk_boss',
         'sei_gate', 'sei_1', 'sei_11', 'sei_2', 'sei_4', 'sei_renji',
         'sok_1', 'sok_boss',
         'hm_1', 'hm_2', 'hm_3', 'hm_grimm', 'hm_side', 'hm_boss', 'hm_dome',
         'forest_1', 'forest_2', 'dangai_1', 'dangai_2', 'end_1', 'end_boss']
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
        for k in ['name', 'region', 'pos', 'doors', 'boss', 'reward', 'rewardItems', 'chase', 'abilities', 'seals', 'platforms', 'npcs']:
            if k in r and r[k] is not None:
                f.write('    %s: %s,\n' % (k, js(r[k], 4)))
        f.write('    tiles: [\n')
        for row in rows:
            f.write("      '%s',\n" % row)
        f.write('    ],\n  },\n')
    f.write('};\n')
print('wrote', OUT, len(ORDER), 'rooms')
