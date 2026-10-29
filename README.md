# Sunnyvale Showdown

An unofficial Trailer Park Boys fan parody fighting game drawn in a 2D comic-book sprite style. It has no build step and no dependencies.

**To play:** open `index.html` in a browser. You can also serve the folder with something like `npx serve .`.

## Art

Ricky, Julian and Bubbles use hand-drawn sprites cut from `art/reference-sheet.jpg` (idle, attack and run poses for each).

Mr. Lahey, Randy, J-Roc and the cameo NPCs (Cory & Trevor and the Green Bastard) are 2D cartoon sprites drawn as vector art in `tools/npc/npc_art.js`. To change a pose or outfit, edit that file and run `node tools/npc/render_npcs.js`, which writes the images into `sprites/`. If these characters get a proper sprite sheet later, cut it with `tools/cut_sprites.py` instead.

Sounds and the stages are generated in code.

To re-cut the sprites after changing the sheet, run `python3 tools/cut_sprites.py`. It needs Pillow, NumPy and SciPy. The crop boxes at the top of the script say where each pose sits on the sheet.

## The Boys

| Fighter | Special (R / I) | Super (T / O) | Meter |
|---|---|---|---|
| Ricky | Hash Brick: a lobbed brick that leaves a dizzying smoke cloud | The Shitmobile: the car drives across the whole screen. Jump it! | Smokes |
| Julian | Clothesline: a dashing arm, drink still in the other hand | Julian's Gym: a dash that turns into an 8-hit beatdown | Rum & Coke |
| Bubbles | Kitty Launcher | Shopping Cart Blitz: rides a cart through the opponent while cats rain down | Kitties |
| Mr. Lahey | Liquor Bottle: a lob that shatters on hit | The Shit Hawks: five hawks dive-bomb the opponent | Liquor |
| Randy | Belly Bump | Cheeseburger Binge: heals and rains burgers | Cheeseburgers |
| J-Roc | Mic Check: a sound-wave projectile | Mixtape Drop: a boombox fires ground shockwaves. Jump them! | Rhymes |

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move / block (hold away) | `A` `D` | `←` `→` |
| Jump | `W` | `↑` |
| Punch / Kick | `F` / `G` | `K` / `L` |
| Special | `R` | `I` |
| Super (full meter) | `T` | `O` |
| Taunt (fills meter, leaves you open) | `S` | `↓` |

In single player, P1 can also use the P2 keys. `P` pauses, `Esc` backs out, `M` mutes. On a phone, on-screen buttons appear for player 1 and menus respond to taps.

## Features

- 1P vs CPU with three difficulty levels: Stoned, Half-Cut and Sober Lahey. There is also 2P on the same keyboard.
- Best-of-3 rounds with a 99-second timer, combos, knockdowns, chip damage, projectile clashes and hit-stop.
- Super cut-ins, speech bubbles full of catchphrases, and character-specific win and lose lines.
- Mirror matches give player 2 an alternate outfit.
- Three stages: Sunnyvale Trailer Park (with Cory & Trevor and Steve French cameos), the Community Day wrestling ring from "The Green Bastard", and the C Block jail yard.
- Lines, taunts and gags come from research on the show and movies. See `docs/research.md` for what was used and the sources.
