<p align="center"><img src="build/icon.png" width="128" alt="LYCAN icon" /></p>

<h1 align="center">LYCAN</h1>
<p align="center"><b>The Ultimate Werewolf Simulator</b></p>

<p align="center">
  <a href="https://github.com/NyteRyzer/lycangame/actions/workflows/build.yml"><img src="https://github.com/NyteRyzer/lycangame/actions/workflows/build.yml/badge.svg" alt="Build status" /></a>
  <img src="https://img.shields.io/badge/platforms-Linux%20%7C%20Windows%20%7C%20macOS-555" alt="Platforms: Linux, Windows, macOS" />
</p>

![The beast under the moon in downtown Greyhaven](docs/screenshots/beast.png)

A third-person open-world werewolf action game. You can shift between **human**, a half-human **hybrid** and the full **beast** whenever you want, and the full moon forces the change. You roam **Greyhaven**: downtown towers, suburbs, an industrial district, a lake, a forest and mountains. Every choice you make pushes you toward becoming the city's protector or its greatest threat.

The main design goal: **moving around as the werewolf should be fun on its own, even when you're not on a mission.**

## Screenshots

| | |
| --- | --- |
| ![The hybrid form](docs/screenshots/hybrid.png) <br> **The hybrid**: half human, half wolf. Fast, agile, and it can still pass in a crowd at a distance. | ![Human form with passives](docs/screenshots/human.png) <br> **Human form** has its own passive abilities: Keen Senses, Blend In, Lunar Vitality and more. |
| ![Wall-running](docs/screenshots/wallrun.png) <br> **Wall-run** along buildings, then kick off to keep your flow. | ![Climbing a tower](docs/screenshots/climb.png) <br> **Climb anything.** Run into a wall to scale it and mantle onto the roof. |
| ![Sprinting on all fours](docs/screenshots/sprint.png) <br> **Drop to all fours** and build up to 30 m/s down the avenues. | ![Charged leap by day](docs/screenshots/leap-day.png) <br> **Charged leaps** launch you wherever you're looking. |
| ![Throwing a car](docs/screenshots/car-throw.png) <br> **Grab and throw** anything: trash cans, benches, people, cars. | ![Vampires and a combo](docs/screenshots/vampires.png) <br> **Combos, style ranks and damage numbers.** Chain hits up to SAVAGE. |
| ![Police standoff](docs/screenshots/police.png) <br> **Police** roll up in cruisers when your heat rises. | ![Demon brute](docs/screenshots/demon.png) <br> **Hellgates** open in the industrial yards and spit out demon brutes. |
| ![Witches](docs/screenshots/witches.png) <br> **Witches** float, hurl homing hexes and blink away. | ![Ghouls](docs/screenshots/ghouls.png) <br> **Ghouls** crawl out of Hollow Hill Cemetery after dark. |
| ![Keen Senses](docs/screenshots/senses.png) <br> **Keen Senses**: heartbeats through walls and a scent trail to your goal. | ![Storm](docs/screenshots/storm.png) <br> **Dynamic weather**: fog, rain, and thunderstorms with lightning. |
| ![Mid-transformation](docs/screenshots/transform.png) <br> **Transform at will.** Bones crack, a roar, a shockwave. | ![Full moon over the lake](docs/screenshots/full-moon-lake.png) <br> **The full moon** forces the change every third night. |
| ![Dusk over the rooftops](docs/screenshots/rooftop-dusk.png) <br> **A bigger city**: glass towers, brick walk-ups, a gothic old town, neon and billboards. | ![The Moon Shrine](docs/screenshots/ruins.png) <br> **The Ancient Ruins**, where you learn the Old Magic. |
| ![The Blackfang Alpha](docs/screenshots/alpha.png) <br> **The Blackfang Alpha** and its pack wait in the peaks. | ![Map of Greyhaven](docs/screenshots/map.png) <br> **Explore to uncover the map**, and survey it from red-beacon spires. |

<p align="center"><img src="docs/screenshots/title.png" width="70%" alt="Title screen" /></p>

## Download / build

Builds are produced for **Linux, Windows and macOS**.

| Platform | Output | Command |
| --- | --- | --- |
| Linux | `LYCAN-x.y.z.AppImage`, `.tar.gz` | `npm run dist:linux` |
| Windows | `LYCAN Setup x.y.z.exe` (installer), portable `.zip` | `npm run dist:win` |
| macOS | `.dmg`, `.zip` (Intel + Apple Silicon) | `npm run dist:mac` |

Packages land in `dist/`.

**CI builds:** `.github/workflows/build.yml` runs on every push and uploads three artifacts: **LYCAN-Linux** (AppImage + tar.gz), **LYCAN-Windows** (installer + portable zip) and **LYCAN-macOS** (Intel + Apple Silicon zips, packaged on Linux). Download them from the run's **Artifacts** section.

Pushing a tag like `v0.1.0` attaches everything to a GitHub Release. Tag builds (or a manual *Run workflow*) also try to build a native macOS `.dmg`. That job needs a GitHub macOS runner; if none is available it is cancelled without failing the build.

Build notes:

- From Linux, `npm run dist:all` builds the Linux packages, the Windows portable `.zip` and the macOS `.zip`. The Windows installer (`.exe`) needs Windows or wine, and the macOS `.dmg` needs a Mac. CI builds the installer on every push, and the `.dmg` on release tags.
- Builds are **unsigned**:
  - **macOS:** right-click the app and choose *Open* the first time, or run `xattr -cr LYCAN.app`.
  - **Windows:** SmartScreen may ask you to click *More info → Run anyway*.
- To sign builds, set the usual electron-builder `CSC_LINK` / `CSC_KEY_PASSWORD` secrets in CI.

## Roblox version

LYCAN is also being ported to **Roblox**. The source lives in [`roblox/`](roblox/): a Rojo project in strict Luau that includes the three forms (built on the player's own avatar), the forced full moon, the traversal and combat systems, Greyhaven generated at runtime, NPC factions, morality, heat, nests and the story. The **Roblox** workflow builds a ready-to-open `LYCAN.rbxl` place file as a download. See [`roblox/README.md`](roblox/README.md) for how to open it in Roblox Studio.

## Run from source

```bash
npm install
npm start          # desktop window (Electron)
npm run serve      # or play in a browser at http://localhost:8080
npm run smoke      # headless gameplay smoke test (needs playwright)
npm run screenshots  # regenerate the README screenshots in docs/screenshots
```

## Controls

| Input | Action |
| --- | --- |
| WASD / left stick | Move |
| Mouse / right stick | Look |
| **F** · **1 / 2 / 3** | Transform (human ⇄ last monster form) · pick **human / hybrid / beast** directly |
| **Shift** | Sprint. The beast drops to all fours and builds speed. |
| **Space** | Jump. Beast: **hold and release** for a charged leap where you're looking. |
| Run into a wall | **Mantle** low ledges, **climb** tall walls (hybrid, beast). Space on a wall = wall-jump. |
| Shift + jump alongside a wall | **Wall-run**. Jump again to kick off. |
| **C** / Ctrl / Alt | Dash (brief invulnerability). While sprinting: **slide**. |
| LMB | Combo attack (3rd hit is a finisher). In the air: **pounce**. |
| RMB | Heavy: beast smash, hybrid uppercut. High in the air: **ground slam**. |
| **X** (hold) | Block. Time it just before a hit to **PARRY** (stuns the attacker, slows time). |
| **T** / middle mouse | Lock on |
| **G** | Grab. **G** or LMB again to throw. |
| **E** | **Finisher** on a weakened or stunned enemy · feed on the fallen · interact |
| **Z** | **Blood Moon Frenzy** (needs full rage) |
| Q | Howl: fear, stuns, +25% damage |
| R | Moonfire: ranged lunar blast, learned at the Ancient Ruins |
| **V** | Keen Senses |
| Y / N | Accept / decline a contract |
| Tab · M · **P** | Skills · map · **photo mode** · Esc pause · F11 fullscreen |

Gamepads with the standard (Xbox) layout are supported: A jump · B dash · X attack · Y heavy · LB block · RB howl · LT sprint · RT Moonfire · LS senses · RS lock-on · D-pad transform / interact / grab / frenzy.

## What's new in 0.2

1. **Hybrid form.** A third form, half human and half wolf, with its own model and transformation.
   - Faster than a human, more agile than the beast.
   - Wall-runs, climbs and uppercuts.
   - Civilians only raise half the heat when they see it.
2. **Free form switching.** 1 / 2 / 3 pick any form, and every pair has its own morph.
3. **Human passives.** Keen Senses, Blend In (heat fades 3x faster, hunters and police ignore you), Lunar Vitality (fast night regeneration), Feral Reflexes (a last-moment dash slows time) and Freerunner (vault and mantle).
4. **Block and perfect parry.** Parries stun attackers and slow time. Ranks of *Riposte* can bat bullets and hexes back.
5. **Lock-on targeting**, with camera framing.
6. **Grab and throw.** People, trash cans, benches, dumpsters, and cars when you're the beast.
7. **Brutal finishers**, cinematic executions in slow motion that heal you.
8. **Combo counter and style ranks** (C → SAVAGE) that boost XP, plus floating damage numbers.
9. **Blood Moon Frenzy.** A full-rage super mode: more damage, speed and lifesteal, and you take less damage.
10. **Four new enemies:**
    - **Police**: pistols, arrive in squad cruisers.
    - **Witches**: hover, homing hexes, blink.
    - **Ghouls**: swarming pack hunters.
    - **Demon brutes**: charge, fire stomp. Charge them into a wall to stun them.
11. **Wall-running and flow.** Chained wall-jumps, slide-jumps and leaps stack speed bonuses.
12. **Mantling and sliding.** Pull yourself over ledges, and slide under danger or into enemies.
13. **A bigger city.**
    - A 12×12-block downtown, twice the area of before.
    - Glass towers, brick walk-ups with fire escapes, and a gothic old town.
    - Alleys, neon shopfronts, rooftop billboards, water towers and cranes.
14. **Traffic.** Cars drive the grid, stop for pedestrians and honk. Hit them and they tumble, smoke and set off alarms.
15. **Destructible street furniture.** Hydrants burst into geysers, red barrels explode, and benches, bins, mailboxes and newsboxes go flying.
16. **Vantage spires.** Climb eight red-beacon spires and survey the city to reveal the map.
17. **Moonstones.** 40 collectibles; every four gives a skill point and +5% max health.
18. **Wildlife.** Deer and rabbits to hunt and feed on without any morality cost.
19. **Dynamic weather.** Fog, rain and thunderstorms with lightning and thunder. The streets turn wet and reflective.
20. **Safehouse.** Rest until dusk or dawn, heal, clear your heat and save. You respawn here.
21. **New events:**
    - **Ghoul Swarms** and **Coven Rituals**.
    - **Hellgates** that bring a demon brute.
    - **Hollow Hill Cemetery**, a new landmark.
22. **Better models.**
    - Rounded, jointed humans with faces, hairstyles, outfits, coats, hats, glasses and beards.
    - A detailed werewolf with a mane, teeth, ears and claws.
    - Distinct looks for every enemy type.
23. **Bloom and ground decals.** Glowing eyes, neon and magic, plus blood pools, paw prints and slam craters.
24. **Photo mode.** A free camera with time-of-day control.

## What's in the game

**Forms.**

| | Human | Hybrid | Beast |
| --- | --- | --- | --- |
| Health | 100 | 180 | 260 |
| Top speed | 9 m/s | 18 m/s | 30 m/s |
| Traversal | vault, mantle, short wall-runs | climb, long wall-runs, uppercut launches | four-legged sprint, charged leaps, climb, ground slams, trample |
| Heat when seen | none (blends in) | half | full |

Every third night is a **full moon**. It forces you out of human form until dawn, unless you learn *Moon's Leash*. You also get +30% damage and steady rage.

**Greyhaven.** Roughly 1.7 km square:

- A dense downtown with an old-town quarter.
- Suburbs, Hollow Hill Cemetery, an industrial district with cranes and container stacks.
- A lake with docks and cabins, Northwood forest and the Ashen Peaks.
- Landmarks: Ancient Ruins, Hunters' Lodge, St. Corvin Cathedral, Blackfang Den.

There's a 12-minute day/night cycle with a 3-night moon cycle.

**Hero or monster:**

- **Morality** from −100 to +100, plus **heat** (0–5) that brings police first and Silver Dawn hunters after.
- **Faction standing** and **territory control** in every district.
- **Contracts** from the Vampire Court, the Mayor and the Order.
- **Dynamic events** and a story thread that ends at the Blackfang Alpha, with three endings and packmates who follow you afterwards.

**Progression.** XP, levels and nine skills: Swift Paws, Iron Hide, Bloodlust, Moon Leap, Terrible Howl, Silver Tolerance, Moon's Leash, Riposte and Blood Moon. Moonstones add more. The game autosaves every 30 s.

All visuals are procedural and all audio is synthesized at runtime: howls, roars, sirens, thunder, rain, car alarms. There are no asset files to license.

## Project layout

```
src/            game source (bundled by esbuild → app/game.js)
  main.js       renderer, bloom, game loop, slow-mo, photo mode, menus, save/load
  world.js      Greyhaven: terrain, districts, buildings, landmarks, spires, moonstones, sky, moon cycle
  player.js     three forms, transformation, traversal, combat, skills, passives
  characters.js procedural humans, hybrid, werewolves and wildlife, with animation
  npcs.js       civilians, police, hunters, vampires, witches, ghouls, demons, wolves, animals: AI and combat
  props.js      instanced street furniture, traffic and physics (throwing, smashing, explosions)
  story.js      morality, heat, factions, territory, objectives, events, contracts, spires, safehouse
  weather.js    fog, rain, thunderstorms and lightning
  camera.js     third-person camera (speed FOV, lock-on, finishers, wall-run tilt, photo mode)
  hud.js        HUD, minimap with fog of war, senses overlay, combo meter, damage numbers, menus
  fx.js audio.js input.js util.js geo.js
app/            index.html, style.css (+ bundled game.js)
electron/       desktop shell (main + preload)
build/          app icon for packaging
scripts/        build, smoke test, README screenshots
docs/           screenshots
```

## Roadmap

- Skinned, motion-captured character animation.
- Interiors to break into.
- Car chases.
- Voiced story missions.
- Territory perks.
- A lighter "lupine" scout form.
- Multiplayer packs.
