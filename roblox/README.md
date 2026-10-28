# LYCAN for Roblox

A Roblox port of **LYCAN, the werewolf simulator**, written in strict Luau and synced into Roblox Studio with [Rojo](https://rojo.space). Every part of Greyhaven is generated in code when the server starts, so the project needs **no uploaded assets**. You can open it in Studio and press Play.

## Play it in Studio

**Option A: the ready-made place file (no tools needed).**
1. Open the latest **Roblox** workflow run under the repository's *Actions* tab.
2. Download the `LYCAN-Roblox-place` artifact and unzip it.
3. Double-click `LYCAN.rbxl` (or *File → Open* in Roblox Studio), then press **Play**.

**Option B: live-sync the source with Rojo (for development).**
1. Install the toolchain with [Rokit](https://github.com/rojo-rbx/rokit). Run `rokit install` in this folder, which reads `rokit.toml`.
2. Install the Rojo plugin in Studio. Either run `rojo plugin install` or get it from the Creator Store.
3. Run `rojo serve` in this folder.
4. In Studio, open a new **Baseplate**. Delete the `Baseplate` part, open the Rojo plugin and click **Connect**.
5. Press **Play**.

Saving progress between sessions needs DataStores. Publish the place, then turn on *Game Settings → Security → Enable Studio Access to API Services*. Without that the game still runs, but with a temporary profile.

To publish to Roblox, use *File → Publish to Roblox*. The R15 avatar type is recommended, because the transformation rescales the player's own avatar.

## What's in it

| System | What it does |
| --- | --- |
| **Three forms** | **Human**, **Hybrid** (half human, half wolf) and **Beast**. Your *own avatar* is rescaled, re-coloured in fur, and gets a welded wolf head: snout, jaw, fangs, ears and glowing eyes. You also get a fur ruff, claws and a tail, and the beast hunches. Each form has its own health, speed, jump, reach and damage. |
| **Full moon** | Every third night the moon forces everyone into the beast. Only *Moon's Leash* lets you change back. |
| **Traversal** | Beasts build momentum up to a gallop and leap while running. Monster forms also get: mid-air jumps, wall climbing with ledge mantles, wall jumps, wall-running and dashes. In the air, a heavy attack becomes a **ground-slam dive**. A **Flow** meter rewards chaining moves with extra speed. |
| **Combat** | A 3-hit claw combo whose last hit staggers, plus heavy blows. You can hold block, or tap it just before a hit to parry. Dash i-frames dodge attacks. **Finishers** work on weakened or staggered enemies. You can **grab** people, cars, dumpsters and benches and **throw** them. Explosive barrels blow up. **Howl** stuns and scatters. **Frenzy** triggers on full rage. Every hit is decided on the server. |
| **Greyhaven** | A 2,400-stud world. It has a downtown street grid of lit-window towers with rooftop water tanks, beacons and neon signs. Around the city are Lantern Plaza, a safehouse, Cathedral Hill, Ashgrove Cemetery, the Old Ruins with its Moon Shrine, Mirror Lake, the Hunter's Lodge, forest hills, the Ashen Peaks and Vargr's Den. |
| **The living city** | Civilians flee from monsters, and every witness raises your **heat**. Police arrive by squad car at two stars. Vampires prowl at night and feed on civilians, and they burn at sunrise. Ghouls rise in the cemetery and silver hunters roam the woods. You'll also meet rival werewolves, deer, and **the Alpha**, a boss with a pounce and a shockwave slam. |
| **Morality** | A Monster ↔ Protector scale that runs from *The Beast of Greyhaven* to *Guardian of Greyhaven*, driven by who you kill. |
| **Territory** | Vampire **nests** hold three districts. Destroy one to free its district. |
| **Story** | An objective chain: transform, sprint, climb, reach a vantage, howl, hunt vampires, destroy a nest, find the Moon Shrine, defeat the Alpha. A golden beacon marks each target. |
| **World** | A day/night cycle with a moon-phase calendar and lamps that switch on at dusk. **40 moonstones** are hidden on rooftops and in the woods, and every five gives a skill point. **8 vantage points** each reveal part of the map. The safehouse bed lets you sleep to the next dusk or dawn. Random **world events** include vampire ambushes and hunter patrols. |
| **Progression** | XP and levels, plus 9 skills: Swift Paws, Iron Hide, Bloodlust, Moon Leap, Terrible Howl, Silver Tolerance, Moon's Leash, Riposte and Blood Moon. Progress is saved with DataStores. |
| **Keen Senses** | Press **V** to grey out the world and see every heartbeat through walls, coloured by intent, plus moonstones nearby. |
| **HUD** | Health, rage, flow and XP bars, combo counter, clock and moon phase, district, heat stars, morality bar, objective, map (M), skills (Tab) and controls (H). |

## Controls

| Input | Action |
| --- | --- |
| **F**, or **1 / 2 / 3** | Transform (cycle, or pick human / hybrid / beast) |
| **Shift** | Sprint |
| **Space** | Jump; air-jump or wall-jump in monster forms |
| Run at a wall | Climb (hybrid / beast); top out to mantle |
| Sprint past a wall in the air | Wall-run |
| **C / Ctrl** | Dash (dodge window) |
| **Left click** | Claw / punch combo |
| **Right click** | Heavy blow; in the air: ground slam |
| **X** (hold) | Block; tap it right before a hit to parry |
| **G** | Grab; G or click again to throw |
| **R** | Finisher |
| **Q** | Howl |
| **Z** | Frenzy (when rage is full) |
| **V** | Keen Senses |
| **E** | Interact (vantages, Moon Shrine, safehouse bed) |
| **Tab / M / H** | Skills / map / controls |

Gamepad and touch are bound too; touch buttons appear on mobile.

## Project layout

```text
roblox/
├── default.project.json      Rojo mapping and Lighting / StarterPlayer settings
├── src/shared/               ReplicatedStorage.Shared (config, types, remotes, pure helpers)
│   ├── Config.luau           forms, skills, NPC archetypes, tuning
│   ├── Net.luau              the single remote folder (server creates, clients wait)
│   ├── Moon.luau             time of day and the moon-phase calendar
│   ├── Progression.luau      XP curve, titles, speed bonuses
│   └── WorldLayout.luau      map layout, districts, landmarks, nests
├── src/server/               ServerScriptService.Server
│   ├── init.server.luau      two-phase bootstrap in dependency order
│   ├── Lib/                  WorldGen, WerewolfLook, Bus, RateLimit
│   └── Systems/              Data, World, PlayerState, Reputation, DayNight,
│                             NPCs, Combat, Director, Spawning
└── src/client/               StarterPlayerScripts.Client
    ├── Lib/                  ClientState, Anim (procedural attack animation)
    └── Controllers/          Movement, Combat, CameraRig, Effects, Senses, HUD
```

### Security model

The client only *requests* actions: transform, attack, howl, grab and so on. Each remote handler on the server:
- applies per-player rate limits;
- type-checks and bounds every argument, rejecting NaN, infinity and wrong types;
- checks form, cooldowns and reach against **server-side positions**.

The server then computes all damage, XP, morality and rewards itself. Movement is client-simulated, as it is for every Roblox character. The server sets each form's base speeds, and nothing valuable depends on where a client claims to be.

## Custom sound

Roblox only plays audio you own or that is public. The built-in engine sounds (`rbxasset://sounds/...`) are used as fallbacks. To use your own howl, roar or ambience, upload it and paste its `rbxassetid://` into `Config.SOUNDS` in `src/shared/Config.luau`.

## Checks

The GitHub Actions workflow `.github/workflows/roblox.yml` runs these checks and uploads the resulting `LYCAN.rbxl`:
- every file must compile with `luau-compile`;
- `selene src` must pass;
- `stylua --check src` runs as an advisory check;
- `rojo build` must succeed.
