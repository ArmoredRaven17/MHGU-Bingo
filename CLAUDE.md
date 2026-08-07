# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

MHGU Bingo is a static bingo-card generator for Monster Hunter Generations Ultimate. Cells are
hunting goals drawn from five pools — monsters, quests, weapon/style combos, objectives, and the
user's own custom entries. Cards are seeded, markable, and shareable.

**Live URL:** https://armoredraven17.github.io/MHGU-Bingo/

**To develop:** serve `docs/` over HTTP — `python -m http.server` from inside `docs/`, then open
http://localhost:8000. There is no build step for the app itself.

Do **not** test via `file://` — localStorage origin behavior differs and the shared-origin
features (below) won't behave like production.

## Files

- `docs/index.html` — markup + modals
- `docs/styles.css` — all styling, theme CSS variables
- `docs/app.js` — all application logic (one IIFE, no modules)
- `docs/data.js` — **generated**, do not edit by hand (see below)
- `tools/build-data.js` — regenerates `docs/data.js`
- `QuestData.json`, `LgMonsters.json` — vendored copies of the MHGU Quest Randomizer's data

## Cache busting (mandatory)

GitHub Pages caches assets by full URL. Every time you change `styles.css`, `app.js`, or
`data.js`, you **must** increment the `?v=N` query string on its `<link>`/`<script>` tag in
`index.html`. Without this, users keep the stale copy until they hard-refresh.

## Regenerating data

`QuestData.json` and `LgMonsters.json` are copies of the files at the root of the **MHGU Quest
Randomizer** repo. There is no automatic sync — deliberately, so the two apps can be maintained
independently. When quest data changes upstream:

```
# copy the two JSON files over from the randomizer repo, then:
node tools/build-data.js
```

The script emits `window.MHGU_BINGO_DATA` with a `dataVersion` hash of the source bytes. That
hash rides in every seed's fingerprint, so a data rebuild makes old seeds *warn* rather than
silently produce a different card. Remember to bump `data.js?v=N` afterwards.

## This app shares no state with the other MHGU apps

It's built on the Quest Randomizer's UI kit — same class vocabulary, same theme derivation,
same panel/modal patterns — but it is otherwise standalone. Nothing is read from or written to
another app's storage.

That matters because all the MHGU apps publish under `https://armoredraven17.github.io`, and
GitHub Pages project sites are paths rather than subdomains, so **they share one localStorage
origin**. Every key this app touches is therefore namespaced `mhgu-bingo-*`:
`mhgu-bingo-settings`, `mhgu-bingo-pool`, `mhgu-bingo-card`, `mhgu-bingo-share`,
`mhgu-bingo-theme`. Don't introduce an unprefixed key — it would collide with a sibling app.

## Card pools

Four pools fill the squares, each with an on/off toggle and a 1-9 weight:

| Pool | Cell | Colour |
|---|---|---|
| Monsters | `Hunt Rathalos` + a rank sub-line | by rank (Low/High/G) |
| Weapons | `Clear with Hunting Horn` + a style sub-line | by weapon |
| Objectives | `Capture a monster` | one flat colour |
| Custom | the user's own text | one flat colour |

**There is no "specific quest" pool.** Monster goals are generated per *(monster, rank)* pair
found in the filtered quest pool, so a monster huntable at two ranks yields two squares. The
quest filters still matter — they decide which monsters and ranks exist and gate the objectives.

Monster names come from the quests themselves, **not** `LgMonsters.json`. The two disagree in
both directions: `White Fatalis` is listed but appears in zero quests, while `Silver Rathalos`,
`Gold Rathian` and `Old Fatalis` appear in quests but aren't listed.

## The bingo highlight (`--win`)

A completed line **fills** its squares rather than outlining them, in a colour derived per
theme: the theme's hue rotated 180°, then darkened until white text on it clears WCAG AA
(4.5:1). Verified across all 27 themes — min 4.50, max 4.93.

Two earlier approaches failed and are worth not repeating:

- **A brighter border.** `--accent-hover` is just a lightened theme colour, so a bingo read as
  "slightly brighter" rather than "you won". That's what prompted the change.
- **Tuning a border colour for contrast.** A 2px border has to contrast with both the gap
  behind the grid *and* the marked-square fill, which pull in opposite directions. On the amber
  themes there's no good answer at any lightness — it bottomed out at 1.24:1. Filling the square
  reduces it to one solvable requirement: white text has to stay readable on the fill.

Note that HSL lightness is not perceived brightness (green carries 72% of relative luminance,
blue only 7%), so a fixed lightness is legible at one hue and not another. Hence the search.

Hue rotation guarantees separation but says nothing about luminance — on gold themes a win
square and an unmarked one land within 1.02:1. So `.cell.line` also carries an inset white ring,
bold text, and a glow, none of which depend on colour.

**Chromium gotcha:** changing `--win` on `:root` does *not* reliably repaint a `var()`-based
`background` on cells that have already been painted. The cell reads the new value via
`getComputedStyle` but keeps rendering the old colour, even after a forced reflow. `applyTheme`
therefore calls `renderCard()` — don't remove that, or the highlight silently keeps the previous
theme's colour until the next card.

## Cell text is capped, never shrunk

`MAX_CELL_TEXT` (40) in `app.js` is the ceiling for custom entries, chosen because 40 characters
is exactly what fits in the 3-line clamp at 5×5. Every generated goal is shorter than that by
construction. If you add a pool, keep its longest possible text under the cap rather than
reducing the font size — the whole point is that all cards render at one size.

## Twitch bot integration

Handled by the **existing** `mhgu-bot-api` Cloudflare Worker, which lives in the MHGU Quest
Randomizer repo under `worker/`. No OAuth and no settings page.

| Route | Purpose |
|---|---|
| `GET /bingo` | **`!bingo`** — rolls a fresh card server-side, stores it, replies with a link and the seed |
| `GET /bingo/:code` | the stored card as JSON, for this app to render `?c=CODE` |
| `POST /bingo` | this app publishing its own card; mints a code + write key |
| `POST /bingo/:code` | overwrite, requires `Authorization: Bearer <writeKey>` |
| `GET /bingo-link?c=` | **`!currentcard`** — plain-text link to the stream's slot |
| `GET /bingo-set?c=&key=` | **`!setcurrentcard`** — rolls a fresh card *into* that slot (mods only) |

### The published code is a permanent slot, not a per-card id

A card code baked into a bot command goes stale the moment a new card is made, which is why
`generate()` deliberately does **not** clear `mhgu-bingo-share`. The first publish claims a code
plus a write key, and everything afterwards overwrites that same code: the app's publish button
copies the on-screen card into it, and `!setcurrentcard` rolls a new one into it server-side.
`!currentcard`'s URL is therefore fixed forever. Don't "tidy up" by clearing the code on a new
card — that reintroduces the bug.

The key rides in the `!setcurrentcard` URL, so that command must be mod-restricted in the bot.
Bot-rolled cards store an empty `keyHash` and can never be claimed as a slot.

### A default-settings seed always reproduces

`applySeed` compares a pasted seed's fingerprint against `defaultFingerprint()`. On a match it
rebuilds using `defaultFilters()` / `DEFAULT_RANGE` / `DEFAULT_POOL` instead of the viewer's own
settings, so a seed printed by the bot reproduces exactly even for someone who has customised
their pools. That's the reason the goal generators take the custom pool as a **parameter**
rather than reading module state — don't collapse that back.

### `worker/src/bingo-gen.js` mirrors this app's generator

For `!bingo` to print a seed that actually rebuilds the card here, the Worker has to draw in
**exactly** the same order as `docs/app.js`. `bingo-gen.js` is a deliberate copy of the
generation half of this file — same RNG (FNV-1a + mulberry32), same weighted shuffle, same pool
ordering, same defaults, same seed and fingerprint construction.

**If you change a pool, a default, an ordering, or the RNG here, change it there too.** The
parity check is: generate with a fixed token on both sides and diff the 25 cells. They must be
byte-identical, fingerprint included.

The Worker reads **this app's** `docs/data.js` (not the randomizer's) precisely so both sides
build from identical bytes — including `dataVersion`, which feeds the fingerprint.

Bot-rolled cards always use the **default** settings, since the bot has no login and no user
config. That's what makes the printed seed useful: someone opening this app fresh has those same
defaults, so pasting the seed reproduces the card exactly. Those cards are stored with an empty
`keyHash`, so nobody can overwrite them.

## Known divergence from the Quest Randomizer

The randomizer maps Arena quests to ranks 43-44 but 20 Arena quests carry `Level: 3`, which
maps to rank 45 and falls outside its 0-44 filter set — those quests are unreachable there.
This app defines all three Arena levels, so those 20 quests **are** reachable here. Intentional;
don't "fix" it by copying the randomizer's range.

## Parity

There is no desktop version of this app, and none is planned.
