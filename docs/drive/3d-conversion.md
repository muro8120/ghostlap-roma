# Drive in 3D: what changes and what stays

The race has always been a 2D game: core.js moves a car on a flat plane, game.js draws it top-down, and the Chase
camera (chase.js, three.js) draws that same plane from behind and above. Chase already has real buildings, lamps,
kerbs and pavements, but the cars are stacked boxes, the road is a stack of flat ribbons and the camera is the only
thing that moves like a racer. This plan makes the Drive half read as a 3D racer without touching the game underneath.

## What stays 2D

- **Physics.** core.js is untouched: a car is (x, y, heading, velocity) on a plane, the track is a centre line with a
  width and soft walls. Lap timing, ghosts, the bot and the node tests do not change, so old times and ghosts stay valid.
- **Everything on top of the picture.** The HUD, the nav box, the minimap (north-up, the car as an arrow), the street
  labels and the direction signs stay 2D overlays. In the 3D views they are placed with `Chase.toScreen` and
  `Chase.yaw`, as now.
- **Follow and North-up.** The 2D renderer stays, as the two map views and as the fallback for a phone without WebGL.
- **The garage picture** stays the 2D top view; the new bodies show in the race.

Out of scope: **hills and elevation.** The physics and the route data (OpenStreetMap footprints and centre lines,
the circuits' control points) are flat, so the road stays level. The only heights are the ones already there or
cosmetic: kerbs, the pavement step, the road's crown, body roll and pitch.

## What becomes 3D, in order

1. **Cars** (`chase-cars.js`, new). Low-poly bodies per style instead of boxes: a side profile with the wheel arches
   cut out, extruded across the car with a bevel and tapered in plan, a separate glasshouse and roof, a wing on the
   hyper and the wedge. Four wheels that roll with the road speed and steer with the steering input (the ghost's from
   its turn rate). Body roll in corners and pitch under braking and acceleration, from the car's speed and yaw rate
   (visual only). Brake lights under braking, a reverse light when reversing, the headlight beam kept. The ghost has
   the same silhouette in its pale blue glass. Budget: at most about 700 triangles a car, Lambert and Basic materials
   only, no more draw calls than the box cars had.
2. **Camera.** Field of view and chase distance grow a little with speed, the camera leans a degree or two into a
   corner, and a fourth camera, *Bonnet*: the eye just above the bonnet, looking down the road, rigid on the body (it
   rolls and pitches with it). The Camera pill cycles Chase, Bonnet, Follow, North-up. Labels and signs work in both
   3D cameras; in Bonnet the bonnet is the car's reserved box and the signs point out from the bottom middle.
3. **Road surface.** The asphalt gets a crown (the middle a few centimetres higher), and the markings follow it: a
   dashed centre line (white paint in town), solid edge lines. No lane lines: every Rome route is an 11 m street, one
   lane each way. The road is its own mesh with its own material, which adds patches of older and newer asphalt and,
   in town, manhole covers. Tyre marks on hard braking, slides and wall scrapes (one dynamic mesh used as a ring
   buffer), and tyre smoke (one pooled point cloud). Both are cleared at the start of each race.
4. **Default and fallback.** Chase stays the default; no WebGL still means Follow, and so does Bonnet without WebGL.
   Low gates the new costs (below). The 2D renderer is not removed.
5. **Polish if there is time.** Lamp reflections on the wet road, a small shake on a wall hit.

## Budget per quality level

Measured with `Chase.info()` (draw calls and triangles of the last frame) in the headless tests, on a circuit and
on the first Rome route, at iPhone 13 size. Before this work, High: about 25 calls and 18k triangles on a circuit,
26 to 29 calls and 39k triangles in Rome.

| | High | Low |
|---|---|---|
| Draw calls (Rome, Chase) | at most 40 | at most 36 |
| Triangles (Rome, Chase) | at most 80k | at most 60k |
| Car bodies | full, roll and pitch | the same (they cost almost nothing) |
| Tyre marks | up to 1200 segments | up to 400 segments |
| Tyre smoke | 48 puffs | off |
| Asphalt patches, manholes | on | off (plain grain) |
| Lamp reflections on the road | on | off |
| Pixel ratio, lights, fog, buildings | as before | as before |

The rule stays the one in the README: 60 fps on High on a recent iPhone, and no worse than before on Low. The e2e test
fails if Chase in Rome goes over the call budget on either level.

## Later

- A 3D garage turntable instead of the 2D top view.
- Real elevation (the bridges over the Tiber, the Gianicolo) would need heights in the route data and a physics step
  that knows about slopes.
- Rain: puddles and spray. Lit-up parked cars. A rear-view mirror in Bonnet.
