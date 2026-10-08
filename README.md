# 💗 Heartstrings

A private, cute, colour-coded map of you and the people in your life — primary partners,
romantic partners, crushes, play partners, queerplatonic bonds, friends, acquaintances, and any
type you invent. Crushes, friendships and acquaintances can be **one-way** (each direction is
its own switch), while partner types are **shared bonds**. Every type is independent, so a
one-way crush, a mutual friendship and a play-partnership can all exist between the same two people. Polycules welcome. Flip between a **2D** daytime
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
4. In the pair editor, one-way-ok types (crush, friendship, acquaintance) have two switches,
   **A → B** and **B → A**; partner types have a single **together** switch. Change which is
   which per type in ⚙️ Settings ("one-way ok"). Expand ▾ for intensity (♥ 1–5, drives line thickness), a "since" date and a note.

| Visual                  | Meaning                                        |
| ----------------------- | ---------------------------------------------- |
| Line colour / emoji     | relationship type (editable in ⚙️ Settings)     |
| Arrow + flowing sparkle | one-way                                        |
| Plain line, no arrow    | mutual (both directions exist, same type)       |
| Dashed                  | "soft" types (crushes by default; configurable) |
| Thickness               | intensity                                      |
| Thick + glow + 💖 badge | **BIG** types (primary partner)                 |
| Thin & faint            | **whisper** types (acquaintance)                |
| Dotted & ghostly + ?    | 🔮 speculative connection                       |
| See-through, dashed + ? | 🔮 speculative person                           |
| Gold halo / ring        | you                                            |

**🔮 Speculative layer:** what-ifs and maybes. Turn it on in the top bar, then flip the pair
editor to "🔮 Speculative" to add connections that live alongside the real ones, or mark a
whole person as speculative (someone you haven't met, or might). Every speculative line gets a
little **?** in the middle. Turn the layer off and it all vanishes everywhere (map, counts,
lists, metamours) as if it never existed. Nothing is deleted. Switch a speculative person to
real and their connections become real with them.

**✂️ Untangling:** in 2D, once the layout settles, Heartstrings rearranges people to cut down
crossing lines and lines running through people, without ever moving anyone you've pinned.
Toggle "auto-untangle" in the legend or hit "✂️ untangle now".

**✨ Graph Theory:** open the sidebar on the right edge of the map to look at your polycule through
classic graph problems. Each one recolours the map and lists its findings (click a name to jump to them):

- 💌 **Valentine's Day Problem** (maximum matching): can everyone have a date on the same night? Who's left with a table for one?
- 📅 **Date Night Calendar** (edge colouring): the fewest nights a week so nobody is double-booked. Vizing's theorem says it's the busiest person's partner count or one more.
- 🔺 **Love Triangle Detector** (bipartiteness): can everyone split into two sides with every bond crossing over? If not, the smallest odd cycle glows.
- 🧱 **Load-Bearing Relationships** (bridges & articulation points): the bonds and people whose loss would split a polycule.

Choose whether partner bonds or every connection counts. Lenses use whatever's on screen (hidden types,
🔍 focus, 🔮 layer), so flipping the speculative layer is an instant "what if". Nothing is saved.

Other bits: click a legend chip to hide a type · 🔍 focus on someone's 1- or 2-hop circle ·
drag to pin a node where you want it · metamours are computed for you · `Ctrl+Z` undo ·
🔒 lock (and auto-lock after inactivity) · encrypted backup download & restore.

See [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) for the why behind all of this.
