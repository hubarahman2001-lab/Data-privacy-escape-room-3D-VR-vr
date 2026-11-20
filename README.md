# Lock Down the Office: VR data privacy escape room

The 3D, hand-tracked VR version of the data privacy escape room ([2D version](https://github.com/hubarahman2001-lab/Mini-trivia-escape-room-game)). It's built for **Meta Quest**, and you can also play it on a laptop.

You walk the commute from the car park to the server room. In each room you find the privacy risks yourself and fix them with your hands: pinch, poke, push, wipe, turn a key, make a fist. Each zone you clear gives one digit of the all-clear code, and you enter the code at the server room before the 15-minute lockdown ends.

## Play it

- **On a Meta Quest:** open the GitHub Pages link in the **Quest Browser** and press **Enter VR**. Put the controllers down: hand tracking works best. (Turn on hand tracking under *Settings → Movement tracking* if it's off.) Clear about 2 × 2 m of space, because you'll take a step or two to reach some things.
- **On a laptop or PC:** open the same link and press **Play on this screen**.

There's nothing to install and no server. The page is static HTML, and Three.js is included in `lib/`.

## Controls

| | Hands (Quest) | Controllers | Screen |
|---|---|---|---|
| Pick up / find | Pinch (thumb + index) | Trigger | Click |
| Carry | Keep pinching and move | Hold trigger | Drag |
| Press a button | Poke it, or point at it and pinch | Touch it, or aim and pull trigger | Click |
| Open hand (stop someone, hold doors) | Open palm | Hold A / X | Hold click on it |
| Fist (lock the laptop) | Make a fist | Hold grip | Hold click on it |
| Hint | 💡 above your left wrist | B / Y | H or 💡 |
| Walk | Walk for real | Left stick (right stick turns) | WASD, drag to look |

The game doesn't tell you which move to use. Sam gives a short brief, and you work out the rest. If you're stuck for 40 seconds, the exact move appears. You get 3 hints per run. A wrong choice costs 10 seconds, and flagging something harmless costs 5. The pass mark is 80% of choices right the first time.

## The rooms

1. **Car park**: a colleague asks to use your card; your own card is still in your car.
2. **Ground floor**: put your badge on before you go up.
3. **Reception**: a visitor log left open and a badge tray with one badge missing.
4. **Security gates**: a side door left open; tap your card to get through.
5. **Lift lobby**: a visitor heading to Floor 4 with no escort. Stop the doors.
6. **Floor 4 entrance**: your card is gone; a loud conversation is giving away customer data.
7. **Your desk**: an unlocked laptop, a password on a sticky note, and a phone call from "IT".
8. **Meeting room**: a whiteboard full of confidential notes and the Finance binders.
9. **Print station**: sort the uncollected printouts, and lock the HR cabinet.
10. **Server room**: enter the code, then answer the final question.

## Edit the questions

All the questions are in `js/content.js`. `DECISIONS` holds the judgment calls, and `PAGES` holds the printouts to sort. They're the same placeholders as the 2D game, so replace them with your course questions before real use. Sam's lines and the lessons for each room are in `js/rooms.js`. The timer, penalties, hints and pass mark are at the top of `js/game.js` (`CFG`).

## Files

- `index.html`: the start page.
- `js/core.js`: renderer, camera rig, frame loop.
- `js/input.js`: hands, controllers and mouse, all turned into one kind of "pointer". Pose detection (open, fist, thumbs up, point) and pinch also live here.
- `js/ui.js`: 3D panels, HUD, wrist menu, speech bubbles.
- `js/world.js`: textures, people, props.
- `js/game.js`: timer, scoring, hints, and the shared tasks (find, drag, hold, tap card, question panels).
- `js/rooms.js`: the ten rooms.
- `lib/`: Three.js r170 (MIT).
- `assets/hands/`: hand models from WebXR Input Profiles (MIT).

## Notes

- WebXR needs **https**. GitHub Pages is fine, but opening `index.html` from a file won't start VR. For a local test, run `python3 -m http.server` and use the Quest's browser on the same network, or play on the screen.
- Sam's voice uses the browser's own speech, and subtitles always show.
- The game was tested in an emulated Quest 3 with tracked hands (IWER) and on a desktop browser. It hasn't been tried on a real headset yet.
