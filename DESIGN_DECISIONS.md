# Heartstrings — Design Decisions (v1)

_Written 2026-10-04 while building v1 autonomously. Each entry: what I chose, why, and what I'd
revisit. Things I had to interpret from the brief are flagged **[interpretation]**._

---

## 1. Privacy: "names stored in a format you (Claude) can't access"

**[interpretation]** I read this as: names must never sit in localStorage in a readable form, and
nobody with access to the machine — me included — should be able to recover them without
something only you have.

**Decision: encrypt the _entire_ vault, not just names.**

- On first launch you choose a **passphrase**. A key is derived with **PBKDF2-SHA-256, 600,000
  iterations, random 16-byte salt** (OWASP 2023+ guidance) and used for **AES-256-GCM**.
- The whole vault (people, notes, relationships, custom types) is serialised and encrypted.
  localStorage holds only `{salt, iv, ciphertext}` under `heartstrings.vault.v1`.
- A **fresh random IV on every save**; GCM also authenticates, so tampering or a wrong passphrase
  is detected rather than producing garbage.
- The derived `CryptoKey` is created **non-extractable** and lives only in memory while
  unlocked. The passphrase is never stored, hashed or logged.
- Locking (button, auto-lock after 15 min idle by default, page reload, closing the tab) drops the
  key. Unlocking re-derives it.

**Why the whole vault and not just names?** Relationship data (who has a crush on whom, who are
play partners) is arguably _more_ sensitive than names, and with names blanked out the graph's
shape plus notes would often identify people anyway. Encrypting everything is also simpler —
one code path, no "which fields are secret" bugs.

**What stays in plaintext:** `heartstrings.prefs.v1` — 2D/3D mode, hidden type ids, toggles,
auto-lock minutes. No names, no person ids, no notes. The "focus on person X" state is kept
in memory only, deliberately, because it would contain a person id.

**How I honoured "you do not have access" during the build:**
- I never read your browser's localStorage. All testing used a **throwaway vault with made-up
  names** (Robin, Alex, Sam, Jo, Kit) in Claude's own isolated preview browser, and I erased
  it afterwards.
- A unit test asserts that a sealed vault's JSON does not contain the plaintext name.
- There is no server, no analytics, and no network calls. Fonts are bundled via `@fontsource`
  rather than loaded from Google Fonts, so even a font request doesn't leak your usage.

**Trade-offs / limits (please read):**
- **Forgotten passphrase = data gone.** There's no recovery by design. Mitigation: the encrypted
  backup download (also needs the passphrase), and a "Forgot it? Start fresh" escape hatch.
- Encryption protects data **at rest**. While unlocked, the plaintext is in page memory, so a
  malicious browser extension running on the page could read it. That's inherent to any
  in-browser app.
- Strength depends on your passphrase. I enforce ≥ 8 characters; a 4+ word phrase is ideal.

## 2. Data model: directional, independent connections

**[interpretation]** "independent and directional connections with each [type]" → each
relationship type is its own pair of one-way switches.

```
Relationship { from, to, typeId, intensity 1–5, since?, notes }
```

- One record = one direction of one type. "Alex → Sam: crush" is a record; "Sam → Alex: crush"
  is a separate record. **Mutuality is derived, never stored**, so there's no way for a
  "mutual" flag to drift out of sync with reality.
- Types are independent: friendship, crush and play partner can all coexist between a pair,
  each in whichever directions apply.
- **Polyamory needs no special support** because nothing restricts how many romantic links a
  person has. The app leans into it with a computed **Metamours** list (partners of your
  partners who aren't your partners; counts romantic / play / queerplatonic as "partner" types).
- Exact duplicates (same from/to/type/layer) are rejected; edit the existing one instead.
- Exactly one person can be "me"; claiming it moves the crown.

**Relationship types** ship as five built-ins and are fully editable (rename, emoji, colour,
dashed on/off, delete) plus custom types. I added **Queerplatonic** beyond your list because it's
common in the same communities and costs nothing to delete.

| Type            | Emoji | Colour   | Direction   | Style                        |
| --------------- | ----- | -------- | ----------- | ---------------------------- |
| Friendship      | 🌼    | mint     | one-way ok  | solid                        |
| Acquaintance    | 👋    | lavender | one-way ok  | **whisper** (thin, faint)    |
| Crush           | 💘    | pink     | one-way ok  | dashed                       |
| Primary partner | 💖    | magenta  | shared bond | **BIG** (thick, glow, badge) |
| Romantic        | 💞    | rose     | shared bond | solid                        |
| Play partner    | 🔥    | violet   | shared bond | solid                        |
| Queerplatonic   | 🌈    | peach    | shared bond | solid                        |

Crush is dashed by default to read as "unspoken / tentative".

### Directional vs shared types (redesign, 2026-10-06)

The v1 model made *every* type directional, which was over-literal: a one-way primary
partnership or a one-way play partnership doesn't mean anything. Now each type has a
**`directed`** flag:

- **One-way ok** (crush, friendship, acquaintance): unchanged. Two independent records,
  A→B and B→A; mutual when both exist. Friendship and acquaintance stay directional because
  "I consider them a friend, they see me as an acquaintance" is real and worth capturing.
- **Shared bond** (primary, romantic, play, queerplatonic): **one record per pair**; its
  from/to order carries no meaning. The pair editor shows a single "together" switch, the map
  draws one arrowless line regardless of the "merge mutual lines" setting, and chips show no
  arrow. Real and speculative layers still stay separate.
- **New custom types default to shared**, matching the "most things are mutual" principle.
  Flip "one-way ok" in Settings for anything directional.
- **Changing the setting converts data, undoably.** Shared → one-way splits each bond into
  A→B + B→A (meaning preserved). One-way → shared folds pairs into one bond, keeping the
  higher intensity, the earlier "since", and both notes joined with " / "; a lone one-way
  record simply becomes a bond.
- **Existing vaults are migrated on unlock** the same way: old one-way partner records fold
  into single bonds. A partner link that was only one-way (e.g. "Alex → Sam: romantic") becomes
  mutual. That's the intended reading under the new rules, but it is a change in meaning, so if
  something was deliberately one-way, re-file it as a crush or put it on the speculative layer.

### Emphasis: BIG / normal / whisper (added after v1)

Asked for: a primary partner type "with a big and obvious style", and an acquaintance type.
Rather than hard-coding a special case for primary, I added an **`emphasis`** property to every
type (editable in Settings, so you could make any type BIG):

- **BIG** (primary partner): about 2× line width, a soft glow under the line, a 💖 badge riding
  the midpoint (drawn last in 2D so nodes never cover it; a sprite in 3D), shorter springs so
  primaries sit close together, more sparkles on one-way links, and it stays partly visible
  when hover-dimmed. Its legend chip and pair-editor row are bigger and glowier too.
- **whisper** (acquaintance): thin, half opacity, no sparkles, and longer springs so
  acquaintances drift to the edge of your web instead of crowding the centre.
- Primary partner is **not exclusive**: you can have several, or none. Some polycules have
  multiple primaries, and enforcing one-per-person would be a value judgement the app shouldn't make.
- Primary counts as a "partner" for metamours.

**Migrating existing vaults:** the vault now records `seededTypeIds`, the built-ins it has been
offered. On unlock, any built-in it hasn't been offered is inserted (acquaintance after
friendship, primary before romantic). Built-ins you've deleted stay deleted, because they're
already in that list. v1 vaults are treated as having been offered the original five.

## 2b. The speculative layer (added after v1)

Asked for: a "speculative" layer that "admits all the same relationship connections but can be
toggled on and off as if it doesn't exist".

- **Model:** every `Relationship` has a `speculative` flag. A connection is unique by
  (from, to, type, layer), so "Alex → Sam: crush" can exist for real *and* as a what-if, fully
  independently. Old data defaults to real.
- **Toggle:** a 🔮 pill in the top bar. When it's off, a single `visibleVault()` filter removes
  speculative connections **before anything reads the data**: map, people-list counts,
  connection lists, metamours, focus neighbourhoods. So the app genuinely behaves as if they
  don't exist, not just as if they're drawn invisibly. A small badge on the pill shows how many
  are hidden, so you don't forget they're there. Writes still go to the full vault, and nothing
  is ever deleted by toggling.
- **Editing:** when the layer is on, the pair editor gets a **💫 Real / 🔮 Speculative** switch.
  Each layer has its own full set of A→B / B→A switches (dashed, striped rows in speculative
  mode). When the layer is off, the switch disappears and you can only edit real connections.
- **Drawing:** speculative links are dotted (overriding a type's own dash pattern) at about 70%
  opacity, with one sparkle at most, and keep their type colour. Real and speculative links of
  the same type never merge into a "mutual" line, and a speculative reply doesn't make a real
  one-way connection count as mutual. They fan out as separate curves. Tooltips and person-panel
  chips are marked 🔮.
- **Privacy:** speculative data is in the encrypted vault like everything else. Only the
  on/off preference is plaintext.
- **Speculative people** (added 2026-10-06): a person can be flagged 🔮 speculative (someone
  you haven't met, might date, are imagining). Hiding the layer removes them **and every
  connection touching them**, through the same `visibleVault()` filter, so they're absent from
  the map, lists, counts, metamours and pickers. If one is selected or focused when the layer
  goes off, the panel closes.
  - Connections involving a speculative person **draw** as speculative, but their stored layer
    is left alone. So switching the person to real ("make them real") also promotes their
    regular connections, while ones you separately put on the speculative layer stay
    speculative. That seemed the most natural reading of "they're real now".
  - **"Me" is never speculative**; the reducer enforces it (claiming "me" clears the flag).
  - Look: see-through node with a dashed outline, a small purple **?** badge, a 🔮 before
    their name, italic in the people list, a dashed avatar in the pair editor (plus a note that
    everything between them is speculative too). In 3D: a ghostly sphere, ? sprite, 🔮 label.
- **? on every speculative line** (added 2026-10-06): a round "?" badge in the type's colour
  sits at the midpoint of every speculative line, whether it's on the speculative layer or
  touches a speculative person. On BIG lines that already carry a 💖 badge, the ? tucks in at
  the heart's upper-right. Badges are drawn after everything else in 2D so nodes never hide
  them, and as always-on-top sprites in 3D.
- **Not done (idea):** a one-click "promote to real" on a single speculative connection
  (today: switch it off on the speculative layer and on in the real one).

## 3. The pair editor is the core UI

Rather than an "add edge" form with dropdowns, selecting two people opens a panel listing
**every type, with two switches (A→B, B→A) for one-way-ok types and one "together" switch for
shared bonds**. Reasons:
- It makes directionality and independence _visible_ — you see at a glance that the crush is
  one-way but the friendship is mutual.
- It's the same UI for creating and editing, so there's one mental model.
- Turning a switch off deletes that one directed record and nothing else.

Ways in: `💞 Connect`, "Connect with…" on a person, **shift-click** a second node, or click any line.

## 4. Visual language

- **Arrow + flowing particles = one-way**; **plain line = mutual**. By default, a mutual pair of
  the same type is merged into one arrowless, slightly thicker line ("merge mutual lines" toggle
  in the legend shows them as two opposing arrows instead).
- **Parallel links fan out**: multiple links between the same pair get evenly spaced curvature
  so they never overlap. Curvature is computed in a canonical (sorted-id) frame and flipped for
  links pointing the other way, because force-graph's curvature is relative to each link's own
  direction. Covered by unit tests.
- **Thickness = intensity** (1–5 hearts).
- **Node** = emoji avatar on a pastel colour you choose; size grows gently with degree.
  **You** get a gold halo in 2D and a Saturn-style gold ring in 3D, plus a 👑 on your label.
- **Hover / selection** dims everyone not directly connected.
- **Cute direction**: pastel palette, rounded Nunito + Fredoka type, emoji everywhere, springy
  toggles, a heartbeat logo, floating emoji on the lock screen. Light and dark themes follow
  your OS setting.

## 5. 2D ⇄ 3D

- Libraries: `react-force-graph-2d` (canvas) and `react-force-graph-3d` (three.js/WebGL). They
  share an API, so one data pipeline feeds both.
- **Layout carries across the switch**: node objects are cached by id and handed to whichever
  renderer is active, so 3D starts from the 2D x/y (and just invents z) and vice-versa.
- **2D = "daytime scrapbook"** (dotted pastel paper); **3D = "night-sky constellation"** (deep plum
  with a starfield). The contrast makes the mode switch feel meaningful rather than cosmetic.
- three.js is ~1.3 MB, so the 3D view is **lazy-loaded** only when you first flip to it.
- 3D uses the library's default trackball camera controls. I first tried orbit controls, but with
  three r186 they throw an exception after a node drag (a bug in how 3d-force-graph fires a
  synthetic `pointerup`), which broke node clicks.
- **Known 3D gaps:** dashed lines aren't rendered in 3D (WebGL tube links don't support dashes),
  so crushes are told apart by colour, arrows and particles there.

## 6. Layout persistence

Dragging a node **pins** it (stored in the encrypted vault as `pin {x,y,z?}`) so your
hand-arranged layout survives reloads. "📌 Unpin" per person or "unpin everyone" in the legend.
Pins don't go on the undo stack (undoing a drag felt wrong).

## 6b. Untangling: fewer crossing lines (added 2026-10-06)

Asked for: layout settling that prefers arrangements with as few crossing lines as possible.

A force simulation balances springs and repulsion; it has no idea what a crossing is, and
once settled it often leaves several. So after the 2D simulation comes to rest, a separate
**untangle pass** (`src/model/untangle.ts`, pure and unit-tested) does a greedy local search:

- **Moves:** swap two people's positions (keeps the overall spacing the simulation found), or
  relocate one person to a free spot near the centroid of the people they're connected to.
- **Score:** line crossings **plus lines passing straight through a third person**. I added
  the second term after the first live test, where a crossing got "fixed" by parking someone
  on top of another line, which reads just as badly. A move is kept if it lowers the score, or
  keeps it equal while shortening total line length by 3%+ (so ties drift tidier and the search
  can't cycle). Each move is scored locally (only lines touching the moved people), which is
  exact because nothing else changes, and keeps it fast.
- **Budget:** about 120 ms per run, so it never janks the UI on a big graph; it just stops early.
- **Pinned people never move.** Your hand-placed layout always wins.
- Results **glide** into place over about half a second, and a toast reports the change, e.g.
  "✂️ Untangled: 16 → 1 crossings". In my test graph (9 people, ~16 links) the raw layout had
  6–16 crossings depending on the random start, and untangling took it to 1 each time.
- **It doesn't move your camera** (fixed 2026-10-06). "Untangle now" used to zoom-to-fit
  afterwards, which threw you all the way out. Now it notes who's on screen (centre inside
  the canvas) before untangling. Afterwards it does nothing if they're all still visible.
  Otherwise it pans the minimum distance to bring them back, and zooms out only if panning
  alone can't fit them, and only as far as needed (`viewToShow`, unit-tested). It never zooms
  in. People who were already off-screen aren't chased. The only remaining automatic fit is the
  first one when the map appears, since there's no previous view to preserve then.
- **When it runs:** automatically once per data change after the layout settles (legend toggle
  "auto-untangle", default on), or on demand with "✂️ untangle now". It runs after the
  simulation has stopped, so the forces can't immediately undo it. If you drag someone, the
  simulation reheats and the next settle untangles again.
- **2D only.** In 3D, whether two lines "cross" depends on the camera angle, so the idea
  doesn't really apply there. Positions still carry across the 2D⇄3D switch.
- **Approximations:** curved parallel links are treated as one straight segment between their
  endpoints. This is a heuristic, not an optimal solver (minimum crossings is NP-hard), so
  occasionally a crossing that a human could spot a fix for remains. Pin people to taste.

## 6c. ✨ Graph Theory lenses (added 2026-10-07)

A right-hand sidebar (closed by default) with four classic problems, each a *lens* over the map:
maximum matching (💌), edge colouring (📅), bipartiteness / shortest odd cycle (🔺) and
bridges & articulation points (🧱).

- **Pure and tested.** The algorithms live in `src/model/theory.ts` on a plain simple graph
  (parallel lines collapse to one edge, weighted by the strongest ♥). `src/components/lenses.ts` turns
  results into an `Overlay` that both renderers paint: rings, badges, recoloured lines, everything else
  dimmed. Hover still wins over a lens; a lens wins over the selection for dimming.
- **Exact where cheap, honest where not.** Matching is an exact memoised search per polycule up to 20
  people (greedy above). Edge colouring backtracks with a step budget: it tries Δ nights, then Δ+1. When
  a fallback kicks in, the panel shows "≈" instead of claiming an optimum.
- **Scope switch.** "Partner bonds" means the shared (non-directional) types; "every connection" counts
  crushes and friendships too, as undirected edges.
- **Works on what's shown.** Lenses read the built graph, so hidden types, focus and the 🔮 layer apply.
  Nothing is stored, and closing the sidebar turns the lens off.
- **Layout.** On desktop the sidebar is its own grid column, so the map shrinks rather than being
  covered; on phones it overlays like the other drawers.

## 7. State, saving, undo

- A plain reducer over the vault; every change triggers a **debounced (400 ms) re-encrypt + save**.
  The 🔐 / ⏳ / ⚠️ icon in the top bar shows save state.
- **Undo** (`Ctrl+Z` / ↶): 50 snapshots, in memory only (cleared on lock).
- Imported or decrypted data goes through `normaliseVault` so an older or hand-edited file can't
  crash the UI.

## 8. Backup & restore

Download produces the **same encrypted format** as localStorage — safe to put in cloud storage.
Restore from the lock screen asks for _that backup's_ passphrase. There is **no plaintext
export** in v1, on purpose; see "ideas" below.

## 9. Stack

React 19 + TypeScript + Vite (matching your other projects), Vitest for unit tests, oxlint.
No backend. `base: './'` so `dist/` works from any static host or subfolder (GitHub Pages
included). Dev server for Claude's preview runs on port 5191.

## 10. Testing done

- 35 unit tests (13 at v1, 8 with the new types and speculative layer, 11 with the
  directionality redesign and untangling, 3 with speculative people): crypto round-trip and no plaintext in ciphertext, wrong passphrase rejected,
  unique IV per save, mutual merging, parallel-link fan-out, type filtering and dangling-link
  removal, focus neighbourhoods, metamours, reducer invariants; plus the speculative layer, migration of new built-ins, shared bonds drawing as one line,
  migration folding of old partner records, reversed-duplicate rejection, round-tripping a type
  between one-way and shared; crossing detection, untangling a bow-tie, moving a person off a
  line, and pinned nodes never moving; speculative people hiding with all their connections,
  their connections drawing as speculative without changing the stored layer, and "me" never
  being speculative.
- Manual run in the preview browser with throwaway data: create vault → add people → pair
  editor → 2D render → 3D render → node and link clicks in both → wrong and right passphrase →
  focus mode → remove + undo → mobile layout (drawer + bottom sheet) → light and dark themes.

**Side fix (2026-10-06):** 3D person objects were built once and never refreshed, so renaming
someone or changing their emoji didn't show in 3D until a reload. They now rebuild whenever the
data changes, which is cheap at friend-group scale.

**Emoji palettes (2026-10-06):** the pickers grew from 24 / 18 one-tap options to about 280
for people (Animals, Nature, Food, Faces & folks, Things & hobbies, Hearts & symbols) and about
125 for relationship types (Love, Bonds, Spicy, Vibes, Signals), in tabs with a scrolling grid.
They live in `src/model/emoji.ts`. The picker opens on the tab containing the current emoji, and
the type-or-paste box still accepts anything. It now keeps the whole first emoji, so multi-part
ones like 🏳️‍🌈 and 🧑‍🚀 aren't chopped. Country flags are left out because Windows draws them as
two letters. A test checks that each palette has no duplicates and every entry is one emoji.

**Arrows & sizing (2026-10-06):**
- *Arrows were too easy to miss.* In 2D the library's small arrowheads are replaced with my own:
  a larger, notched arrowhead with an outline in the background colour, so it stays readable
  over glows, crossing lines and the dotted paper. There's also a **second chevron partway
  along** every one-way line, so direction reads even when the target end is crowded. The mid
  chevron sits at 32% instead of halfway on lines whose midpoint holds a ? or 💖 badge. The tip
  is placed where the curve meets the target's edge, found by bisection on the curve. In 3D the
  cones are bigger and smoother.
- *Speculative ? marks* are about 30% larger by default on lines, and about 20% on people.
- **Settings → 🔎 Display** has two sliders (60–200%) with a live preview: **Arrows & badges**
  (arrows, ? marks, 💖 badges, in 2D and 3D) and **Name labels**. They're plaintext view prefs
  like 2D/3D mode, since they hold no personal data.
- Fixed a 3D glitch where the ? badge's corners tore (corner radius larger than half the
  sprite's height).

**Layering & a layout bug (2026-10-06):**
- **Name labels draw on top** of arrows and badges. In 2D they moved out of the node renderer
  into the final overlay pass, so the order is: lines → people → arrows → ?/💖 badges →
  names. In 3D, label sprites skip the depth test and render last.
- **Fixed people piling up in a heap.** The custom forces (stronger repulsion, longer springs)
  were applied once on mount. If the graph wasn't ready at that instant, they silently didn't
  apply, and d3's cramped defaults left everyone overlapping. That's also what made "fit" zoom
  in absurdly far: it was fitting a pile. The forces are now re-applied on every data change.

## 11. Ideas for v2 (not built)

- **Plaintext export** (CSV/JSON) behind a confirmation, for moving data elsewhere.
- **Groups / polycule hulls**: soft blobs drawn around clusters you label ("the D&D group").
- **Timeline**: use the `since` dates to scrub through how your web changed over time.
- **Stats**: relationship counts per type, "who's most connected", unrequited-crush finder 👀.
- **Per-person privacy**: hide individuals from the view when screen-sharing (a "safe mode").
- **Image export** of the current view (PNG), with optional name redaction.
- **Passphrase strength meter**; optional WebAuthn/passkey unlock on supported devices.
- **Sync** between devices via an end-to-end encrypted file in your own cloud drive.
- **Collision force** so big nodes never overlap; better label de-cluttering in dense graphs.
- Fix the remaining oxlint warnings (latest-value refs assigned during render; deliberate, but
  could move to `useEffectEvent` once it's stable).
