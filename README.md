# 💗 Heartstrings

A private, cute, colour-coded map of you and the people in your life — friendships, crushes,
romantic partners, play partners, queerplatonic bonds, and any type you invent. Every connection
is **directional and independent**, so a one-way crush, a mutual friendship and a play-partnership
can all exist between the same two people. Polycules welcome. Flip between a **2D** daytime
scrapbook and a **3D** night-sky constellation.

Everything is **encrypted on your device** with a passphrase only you know.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (crypto, graph logic, reducer)
npm run build      # static build in dist/ — host anywhere, or open via `npm run preview`
```

## Using it

1. Choose a passphrase (≥ 8 chars). **It is never stored — forget it and the data is gone.**
2. Add yourself (👑 "This is me"), then add people (`＋ Person`, or press `N`).
3. Connect two people with `💞 Connect`, the "Connect with…" picker on someone's panel,
   **shift-click** a second person on the map, or click any existing line.
4. In the pair editor, each relationship type has two switches: **A → B** and **B → A**.
   Expand ▾ for intensity (♥ 1–5, drives line thickness), a "since" date and a note.

| Visual                  | Meaning                                        |
| ----------------------- | ---------------------------------------------- |
| Line colour / emoji     | relationship type (editable in ⚙️ Settings)     |
| Arrow + flowing sparkle | one-way                                        |
| Plain line, no arrow    | mutual (both directions exist, same type)       |
| Dashed                  | "soft" types (crushes by default; configurable) |
| Thickness               | intensity                                      |
| Gold halo / ring        | you                                            |

Other bits: click a legend chip to hide a type · 🔍 focus on someone's 1- or 2-hop circle ·
drag to pin a node where you want it · metamours are computed for you · `Ctrl+Z` undo ·
🔒 lock (and auto-lock after inactivity) · encrypted backup download & restore.

See [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) for the why behind all of this.
