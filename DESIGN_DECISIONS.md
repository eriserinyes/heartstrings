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
- Exact duplicates (same from/to/type) are rejected; edit the existing one instead.
- Exactly one person can be "me"; claiming it moves the crown.

**Relationship types** ship as five built-ins and are fully editable (rename, emoji, colour,
dashed on/off, delete) plus custom types. I added **Queerplatonic** beyond your list because it's
common in the same communities and costs nothing to delete.

| Type            | Emoji | Colour   | Style                          |
| --------------- | ----- | -------- | ------------------------------ |
| Friendship      | 🌼    | mint     | solid                          |
| Acquaintance    | 👋    | lavender | **whisper** (thin, faint)      |
| Crush           | 💘    | pink     | dashed                         |
| Primary partner | 💖    | magenta  | **BIG** (thick, glow, badge)   |
| Romantic        | 💞    | rose     | solid                          |
| Play partner    | 🔥    | violet   | solid                          |
| Queerplatonic   | 🌈    | peach    | solid                          |

Crush is dashed by default to read as "unspoken / tentative".

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
- **Not done (ideas):** speculative *people* (someone you haven't met yet), and a "promote to
  real" button on a speculative connection.

## 3. The pair editor is the core UI

Rather than an "add edge" form with dropdowns, selecting two people opens a panel listing
**every type, each with two switches (A→B, B→A)**. Reasons:
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

- 21 unit tests (13 at v1, 8 added with the new types and speculative layer): crypto round-trip and no plaintext in ciphertext, wrong passphrase rejected,
  unique IV per save, mutual merging, parallel-link fan-out, type filtering and dangling-link
  removal, focus neighbourhoods, metamours, reducer invariants.
- Manual run in the preview browser with throwaway data: create vault → add people → pair
  editor → 2D render → 3D render → node and link clicks in both → wrong and right passphrase →
  focus mode → remove + undo → mobile layout (drawer + bottom sheet) → light and dark themes.

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
