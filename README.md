# Ghostlap Roma

A small top-down night racer set in Rome. Race three laps, and your best run comes back as a ghost to beat.

- **Circuits:** Circo Massimo, Colosseo, Lungotevere, Via Appia Antica. A bronze unlocks the next one.
- **Rome from the NYX** (`rome.js`, see `tools/ROME-ROUTES.md`): real-street round trips from the hotel on Via Cicerone to the
  Vatican, Piazza del Popolo and the Spanish Steps, the Pantheon and Trevi, plus a Prati loop. The street you're on shows at the top,
  with a minimap, landmark labels, and the list of streets you drove at the finish. Direction signs at the screen edge point
  to the hotel, the next stop and the nearest of your Andiamo places (gold stars). Map data © OpenStreetMap contributors (ODbL).
- **Garage:** Cinquecento, Maranello 12, Modena GT, San Cesario, Sant'Agata. These are homages named after towns, not brands.
- **Controls:** hold the left or right half of the screen to steer. Gas is automatic. Both thumbs brake; keep holding to reverse.
- **Offline:** a service worker caches everything, so after one online visit it runs in airplane mode.

## Install on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it **from the home-screen icon once while still online**. iOS keeps a separate cache for home-screen apps.
4. Wait until the menu shows **✓ Ready offline**. Then turn on airplane mode and open it again to confirm.

Your times and ghosts are stored on the phone (localStorage). Nothing is sent anywhere.

## Files

- `index.html`: layout and styles
- `core.js`: tracks, car physics, lap timing, ghost recording (no DOM, so it runs under node)
- `game.js`: rendering, input, menus, sound, saving, offline status
- `rome.js`: generated map and routes (`tools/build-rome.mjs`)
- `sw.js`: offline cache. Bump `CACHE` when you change any file.
- `tools/`: OSM fetch and build scripts, synthetic test map, headless test (`tools/e2e.js`)
