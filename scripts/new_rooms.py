"""The rooms added when the world was spread out (world version 3), and the doors that lead to them.

Each room is carved from a blank hall with the same drawing helpers as build_rooms.py. `add_rooms(R, Grid)` is
called by build_rooms.py after the older rooms are defined: it adds the new rooms to R, splices them into the
links between old rooms (so a gate that used to open straight onto the next room now opens onto a new one) and
moves a few seals and powers out of the corners of the map where several of them used to pile up.

New pickups are placed by the same letters as everywhere else (k power, c seal, f fragment, o ore) plus `w`,
a power upgrade, read from the room's `upgrades` list in reading order.
"""


def add_rooms(R, Grid):
    def hall(w, h=23, floor=19, ceil=1):
        """Walls on both sides, a roof (none if ceil < 0), a solid floor from row `floor` down."""
        g = Grid(w, h, '.')
        if ceil >= 0:
            g.rect(0, 0, w - 1, ceil, '#')
        g.rect(0, 0, 0, h - 1, '#').rect(w - 1, 0, w - 1, h - 1, '#')
        g.rect(0, floor, w - 1, h - 1, '#')
        return g

    def door_l(g, d, y=18):
        return g.put(0, y, d).put(0, y - 1, '.')

    def door_r(g, d, y=18):
        return g.put(g.w - 1, y, d).put(g.w - 1, y - 1, '.')

    def link(a, da, b, db):
        """Doors of two rooms that lead to each other."""
        R[a]['doors'][da] = [b, db]
        R[b]['doors'][db] = [a, da]

    def drop(g, x0, x1, floor=19, deep=3, spikes=2):
        """A pit across the floor with spikes at the bottom of it."""
        g.rect(x0, floor, x1, floor + deep, '.')
        g.rect(x0, floor + deep - spikes + 1, x1, floor + deep, '^')

    new = []

    # ======================================================================= Karakura / Rukongai
    # Onose Canal: the drain under the old road, a long walk above it, and a ledge that wants a second jump
    g = hall(72)
    door_l(g, '1'); door_r(g, '2')
    drop(g, 30, 34)                                  # a drain full of rebar: a plain jump
    g.rect(8, 15, 12, 15, '=').rect(15, 11, 19, 11, '=').rect(22, 11, 60, 11, '=')   # up onto the high walk
    g.rect(38, 15, 42, 15, '=')
    g.put(58, 10, 'f')                               # the end of the walk
    g.rect(44, 5, 48, 5, '=').put(46, 4, 'w')        # six rows above the walk: only a second jump gets there
    g.put(22, 18, 'e').put(50, 18, 'e').put(66, 18, 'i').put(40, 8, 'h').put(26, 10, 'i')
    R['kar_canal'] = dict(name='Onose Canal', region='kar', pos=[0, 0], doors={}, upgrades=['moonEdge'], tiles=g.rows())
    new.append('kar_canal')

    # Junrinan, further on: an orchard of huts, a gate, and a road that climbs to the Kido Corps' old shrine
    g = hall(70, 30, floor=26)
    door_l(g, '1', 25); door_r(g, '2', 25)
    g.put(8, 25, 'R')
    g.rect(20, 22, 25, 25, '#').rect(36, 22, 40, 25, '#')            # huts
    g.rect(46, 22, 49, 22, '=').rect(52, 18, 55, 18, '=').rect(46, 14, 49, 14, '=').rect(52, 10, 55, 10, '=')   # up to the upper road
    g.rect(56, 9, 68, 9, '#').rect(56, 3, 68, 6, '#')                # the upper road: a corridor under a roof
    g.rect(62, 7, 62, 8, 'X')                                        # a Kido seal across it
    g.put(69, 8, '3').put(69, 7, '.')
    g.put(14, 25, 'e').put(30, 25, 'g').put(44, 25, 'e').put(22, 21, 'q').put(60, 25, 'e')
    R['ruk_orchard'] = dict(name='Junrinan, West District 3', region='ruk', pos=[0, 0], doors={}, tiles=g.rows())
    new.append('ruk_orchard')

    # The Kido Corps shrine: an old altar nobody has stood at for a hundred years (Hado #63 lives here)
    g = hall(44)
    door_l(g, '1')
    g.rect(10, 15, 14, 15, '=').rect(18, 12, 22, 12, '=').rect(26, 15, 30, 15, '=')
    g.rect(34, 16, 42, 18, '#')
    g.put(38, 15, 'k')
    g.put(12, 14, 'q').put(28, 14, 'q').put(22, 18, 'q').put(5, 18, 'N')
    R['ruk_kido_hall'] = dict(name='Kido Corps Shrine', region='ruk', pos=[0, 0], doors={}, abilities=['raiko'],
        npcs=[{'name': 'Wandering Plus', 'lines': [
            'You broke the seal? Nobody has come here since the Corps left. Please, mind the casters. They still think they are on duty.',
            'There is an altar at the far end. The Corps kept their heaviest incantation there: Hado #63, the Thunder Roar Cannon.',
            'It takes two thirds of a vessel to cast. It is worth it.']}], tiles=g.rows())
    new.append('ruk_kido_hall')

    # The edge of the ravine: a Kido seal before the Menos, and a cracked floor over ore
    g = hall(60)
    door_l(g, '1'); door_r(g, '2')
    g.put(6, 18, 'R')
    g.rect(40, 2, 40, 18, 'X')                       # a Kido seal across the road to the Menos
    g.rect(24, 14, 28, 14, '=').rect(35, 12, 39, 12, '=')
    g.rect(46, 19, 47, 19, 'O').rect(44, 20, 49, 21, '.').put(45, 21, 'o')
    g.put(14, 18, 'e').put(20, 18, 'e').put(42, 18, 'g').put(52, 18, 'j')
    R['ruk_ravine_edge'] = dict(name='Ravine Edge', region='ruk', pos=[0, 0], doors={}, upgrades=['flow'], tiles=g.rows())
    new.append('ruk_ravine_edge')

    # ======================================================================= Seireitei
    # The white canal: a stone channel along the wall, and a pillar that only a hand that can grip walls climbs
    g = hall(64, 26, floor=22)
    door_l(g, '1', 21); door_r(g, '2', 21)
    drop(g, 12, 17, floor=22)
    g.rect(30, 8, 32, 17, '#')                       # a tower over an archway: walk under it, or climb it
    g.put(31, 7, 'w')
    g.rect(44, 17, 48, 17, '=')
    g.put(22, 21, 'm').put(38, 21, 'm').put(54, 21, 'q').put(46, 16, 'q').put(26, 21, 'b')
    R['sei_canal'] = dict(name='White Canal', region='sei', pos=[0, 0], doors={}, upgrades=['kidoReach'], tiles=g.rows())
    new.append('sei_canal')

    # A barracks yard, where a black cat sits on a roof and has opinions about Byakuya
    g = hall(60)
    door_l(g, '1'); door_r(g, '2')
    g.rect(10, 16, 16, 18, '#').rect(40, 16, 47, 18, '#')            # barracks
    g.rect(20, 14, 24, 14, '=').rect(28, 11, 32, 11, '=')
    g.put(43, 15, 'N')
    g.put(24, 18, 'm').put(34, 18, 'b').put(52, 18, 'b').put(30, 10, 'q').put(7, 18, 'g')
    R['sei_barracks'] = dict(name='Barracks Yard', region='sei', pos=[0, 0], doors={},
        npcs=[{'name': 'Yoruichi', 'seal': 'shunko', 'lines': [
            'Do not look so surprised. A cat can talk. It is the Shinigami who listen that are rare.',
            'Byakuya Kuchiki waits at the top of the Sokyoku Hill. He will not hold back, and Senbonzakura does not miss.',
            'Here: Shunko, a trick of mine. Pour your Reiatsu into your back and shoulders, and your Shunpo will cut whatever it passes through.'],
         'after': ['When the petals come, do not stand still. Byakuya is patient. You must not be.']}], tiles=g.rows())
    new.append('sei_barracks')

    # The Fourth Division's infirmary: a gate, healers who have had enough, and a sealed store room
    g = hall(56)
    door_l(g, '1'); door_r(g, '2')
    g.put(6, 18, 'R')
    g.rect(20, 14, 24, 14, '=').rect(12, 11, 16, 11, '=')
    g.rect(36, 12, 54, 12, '#').rect(36, 13, 36, 18, 'X')            # the store room: its door is a Kido seal
    g.put(46, 18, 'w')
    g.put(18, 18, 'g').put(30, 18, 'q').put(22, 13, 'q').put(28, 18, 'g')
    R['sei_infirmary'] = dict(name='Fourth Division Infirmary', region='sei', pos=[0, 0], doors={}, upgrades=['kidoPower'], tiles=g.rows())
    new.append('sei_infirmary')

    # ======================================================================= Sokyoku Hill
    # The stairs: the last gate before Byakuya, and a fragment on top of a pillar
    g = hall(60)
    door_l(g, '1'); door_r(g, '2')
    g.put(6, 18, 'R')
    g.rect(40, 10, 42, 18, '#').put(41, 9, 'f')
    g.rect(16, 14, 20, 14, '=').rect(26, 11, 30, 11, '=').rect(46, 15, 50, 15, '=')
    g.put(24, 18, 'g').put(34, 18, 'm').put(50, 10, 'h').put(54, 18, 'b')
    R['sok_stair'] = dict(name='Sokyoku Stairs', region='sok', pos=[0, 0], doors={}, tiles=g.rows())
    new.append('sok_stair')

    # ======================================================================= Hueco Mundo
    # The dune sea: open sand, a gate in the middle, a mesa that wants two jumps and a stair to the Bone Vault
    g = hall(84, 30, floor=26, ceil=-1)
    door_l(g, '1', 25); door_r(g, '2', 25)
    g.put(42, 25, 'R')
    g.rect(13, 21, 16, 21, '=').rect(18, 17, 21, 17, '=')            # to the mesa
    g.rect(22, 12, 30, 25, '#').put(26, 11, 'w')                     # the mesa: a plank five rows below its top
    g.rect(52, 23, 58, 25, '#').rect(60, 22, 64, 25, '#')            # dunes
    g.rect(66, 22, 69, 22, '=').rect(70, 18, 73, 18, '=').rect(66, 14, 69, 14, '=').rect(70, 10, 73, 10, '=').rect(66, 6, 69, 6, '=')
    g.put(70, 0, '3').put(71, 0, '3')
    g.put(36, 25, 'j').put(48, 25, 'a').put(56, 22, 'j').put(76, 25, 'a').put(8, 25, 'a').put(34, 12, 'h')
    R['hm_dunes'] = dict(name='Dune Sea', region='hm', pos=[0, 0], doors={}, upgrades=['kidoPower'], tiles=g.rows())
    new.append('hm_dunes')

    # The Bone Vault: reached by climbing out of the dunes
    g = hall(48)
    g.rect(22, 19, 23, 22, '.').put(22, 22, '1').put(23, 22, '1')
    g.rect(8, 15, 12, 15, '=').rect(16, 11, 20, 11, '=').rect(30, 13, 34, 13, '=').rect(38, 8, 42, 8, '=')
    g.put(40, 7, 'w').put(10, 14, 'f')
    g.put(6, 18, 'a').put(36, 18, 'x').put(26, 10, 'h').put(14, 2, 'v')
    R['hm_vault'] = dict(name='Bone Vault', region='hm', pos=[0, 0], doors={}, upgrades=['moonEdge'], tiles=g.rows())
    new.append('hm_vault')

    # The atrium before the Sixth Palace: the last gate before Grimmjow, and a column that holds a seal
    g = hall(64)
    door_l(g, '1'); door_r(g, '2')
    g.put(6, 18, 'R')
    g.rect(14, 10, 15, 18, '#').rect(48, 10, 49, 18, '#')            # columns
    g.rect(22, 14, 26, 14, '=').rect(36, 14, 40, 14, '=').rect(26, 9, 36, 9, '=')
    g.put(31, 8, 'c')
    g.put(24, 18, 'x').put(40, 18, 'a').put(54, 18, 'x').put(32, 13, 'a')
    R['hm_hall2'] = dict(name='Las Noches Atrium', region='hm', pos=[0, 0], doors={}, seals=['long'], tiles=g.rows())
    new.append('hm_hall2')

    # ======================================================================= the Forest of Menos
    # Deeper under the sand: roots, a pit, a ledge for those who can fly, and ore under a cracked floor
    g = hall(72, 26, floor=22)
    door_l(g, '1', 21); door_r(g, '2', 21)
    drop(g, 28, 33, floor=22)
    g.rect(10, 18, 14, 18, '=').rect(18, 14, 22, 14, '=').rect(40, 17, 44, 17, '=').rect(46, 11, 50, 11, '=').put(48, 10, 'w')
    g.rect(58, 22, 59, 22, 'O').rect(56, 23, 61, 24, '.').put(57, 24, 'o')
    g.put(20, 21, 'n').put(40, 21, 'n').put(66, 21, 'j').put(14, 12, 'h').put(52, 8, 'h')
    R['forest_depths'] = dict(name='Deep Forest', region='for', pos=[0, 0], doors={}, upgrades=['kidoReach'], tiles=g.rows())
    new.append('forest_depths')

    # ======================================================================= the Dangai
    # Past the Precipice Shrine: the world's edge, a hard way over, a seal and an upgrade for it
    g = hall(80)
    door_l(g, '1')
    drop(g, 14, 21); drop(g, 34, 43); drop(g, 56, 61)
    g.rect(24, 14, 29, 14, '=').rect(46, 14, 52, 14, '=').rect(63, 14, 67, 14, '=').rect(70, 9, 76, 9, '=')
    g.put(73, 8, 'w').put(76, 18, 'c').put(70, 18, 'R')
    g.put(10, 18, 'j').put(48, 18, 'a').put(28, 13, 'q').put(65, 13, 'x')
    R['dangai_3'] = dict(name='The Cliff of the Dangai', region='dan', pos=[0, 0], doors={}, upgrades=['kidoReach'], seals=['moonfang'], tiles=g.rows())
    new.append('dangai_3')

    # ----------------------------------------------------------------------- the links
    # ruk_1 -> ruk_2 goes through the orchard, and the orchard has a door to the Kido shrine
    # kar_river -> ruk_1 goes through the canal
    link('kar_river', '2', 'kar_canal', '1'); link('kar_canal', '2', 'ruk_1', '1')
    link('ruk_1', '2', 'ruk_orchard', '1'); link('ruk_orchard', '2', 'ruk_2', '1')
    link('ruk_orchard', '3', 'ruk_kido_hall', '1')
    link('ruk_3', '2', 'ruk_ravine_edge', '1'); link('ruk_ravine_edge', '2', 'ruk_boss', '1')
    link('sei_gate', '2', 'sei_canal', '1'); link('sei_canal', '2', 'sei_ward', '1')
    link('sei_ward', '2', 'sei_barracks', '1'); link('sei_barracks', '2', 'sei_1', '1')
    link('sei_2', '4', 'sei_infirmary', '1'); link('sei_infirmary', '2', 'sei_4', '1')
    link('sok_1', '2', 'sok_stair', '1'); link('sok_stair', '2', 'sok_boss', '1')
    link('hm_1', '2', 'hm_dunes', '1'); link('hm_dunes', '2', 'hm_2', '1')
    link('hm_dunes', '3', 'hm_vault', '1')
    link('hm_3', '2', 'hm_hall2', '1'); link('hm_hall2', '2', 'hm_grimm', '1')
    link('forest_1', '2', 'forest_depths', '1'); link('forest_depths', '2', 'forest_2', '1')
    link('dangai_2', '2', 'dangai_3', '1')

    # ----------------------------------------------------------------------- the older rooms that change
    # dangai_2 gets a door on its east wall, and loses the Moon Fang seal (it lies beyond the new door)
    g = Grid.of(R['dangai_2']['tiles'])
    g.put(39, 17, '.').put(39, 18, '2')
    for y in range(g.h):
        for x in range(g.w):
            if g.c[y][x] == 'c':
                g.c[y][x] = '.'
    R['dangai_2']['tiles'] = g.rows()
    R['dangai_2']['seals'] = []

    # the Mask Shrine keeps the mask; Long Reach moves to the atrium
    g = Grid.of(R['hm_side']['tiles'])
    for y in range(g.h):
        for x in range(g.w):
            if g.c[y][x] == 'c':
                g.c[y][x] = '.'
    R['hm_side']['tiles'] = g.rows()
    R['hm_side']['seals'] = []

    # the Sokyoku Ascent no longer holds Yoruichi: she sits on a roof in the barracks yard, long before Byakuya
    g = Grid.of(R['sok_1']['tiles'])
    for y in range(g.h):
        for x in range(g.w):
            if g.c[y][x] == 'N':
                g.c[y][x] = '.'
    R['sok_1']['tiles'] = g.rows()
    R['sok_1']['npcs'] = []

    # the Sinking Dunes: an upgrade on the tallest bone pillar
    g = Grid.of(R['hm_sand']['tiles'])
    g.put(39, 11, 'w')
    R['hm_sand']['tiles'] = g.rows()
    R['hm_sand']['upgrades'] = ['kidoPower']

    # the Pressure Shrine gets a place to stand: a ledge halfway down the tunnel, so a fall is not a trip back to the top
    g = Grid.of(R['sok_shrine']['tiles'])
    R['sok_shrine']['tiles'] = g.rows()

    # ----------------------------------------------------------------------- world 4: two optional Espada
    # Nnoitra waits past the east wall of the Mask Shrine, Yammy past the east wall of the Bone Vault
    def espada_arena(rid, name, boss, items, planks, back):
        g = Grid(48, 23, '#')
        g.rect(1, 2, 46, 18, '.')
        for (x0, x1, y) in planks:
            g.rect(x0, y, x1, y, '=')
        g.put(0, 18, '1')
        g.rect(0, 15, 0, 17, 'L')   # sealed once the fight starts
        g.put(38, 18, 'B')
        R[rid] = dict(name=name, region='hm', pos=[0, 0], doors={}, boss=boss, rewardItems=items, tiles=g.rows())
        new.append(rid)
        door = '2'
        g2 = Grid.of(R[back]['tiles'])
        g2.put(g2.w - 1, 18, door).put(g2.w - 1, 17, '.')
        R[back]['tiles'] = g2.rows()
        link(back, door, rid, '1')
    espada_arena('hm_nnoitra', 'Scythe Hall', 'nnoitra', ['seal:tesla', 'ore'], [(8, 14, 14), (33, 39, 14)], 'hm_side')
    espada_arena('hm_yammy', 'Hall of Ten', 'yammy', ['seal:might', 'fragment'], [(6, 12, 14), (35, 41, 14)], 'hm_vault')

    return new
