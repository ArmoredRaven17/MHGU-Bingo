# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

MHGU Quest Bingo is a static bingo-card generator for Monster Hunter Generations Ultimate. Cells are
hunting goals drawn from five pools — monsters, quests, weapon/style combos, objectives, and the
user's own custom entries. Cards are seeded, markable, and shareable.

**Live URL:** https://armoredraven17.github.io/MHGU-Bingo/

The app is named **MHGU Quest Bingo**; the repo, the Pages path and the `mhgu-bingo-*`
storage keys stay `MHGU-Bingo`. That split is deliberate — renaming the repo would break
every published share link, every `!bingo` URL the Worker prints, and `BINGO_APP_URL` in
the Randomizer's worker. The display name disambiguates it from the sibling
**MHGU Talisman Bingo**; in the Other MHGU Apps modal it is listed as *Quest Bingo*.

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
| Monsters | `Hunt Rathalos` + a rank sub-line | by filter category (see below) |
| Weapons | `Clear with Hunting Horn` + a style sub-line, plus one `Clear as a Prowler` per enabled bias | by weapon |
| Objectives | `Capture a monster` — one per box in the Objectives panel, plus Prowler | one flat colour |
| Custom | the user's own text | one flat colour |

**There is no "specific quest" pool.** Monster goals are generated per *(monster, rank)* pair
found in the filtered quest pool, so a monster huntable at two ranks yields two squares. The
Objectives panel's filters still matter — they decide which monsters and ranks exist and gate
the objectives.

### `OBJECTIVES` mirrors the Objectives panel's checkboxes

One objective per checkbox, in the panel's own order, plus Prowler (which has its own toggle).
There is deliberately **no objective without a control behind it** — `Clear a quest without
fainting` was removed for exactly that reason, and `Clear a Key quest` because its filter went
away with Key Quests Only. Don't reintroduce an ungated one.

The rank boxes are the intended exception: rank rides on the monster squares' sub-line, so
`Clear a High Rank quest` would restate `Hunt Tigrex (High Rank)`.

Changing this list changes generated cards but **not** the fingerprint, which covers settings
and `dataVersion` only. Seeds minted before such a change rebuild differently with no warning,
so treat an edit here the same as a data rebuild.

### The Objectives panel's filters are two independent gates, not one axis

The six checkboxes look like one list but are two:

- **Low / High / G** filter by **rank**, and apply to *every* quest that has one — including
  Special Permits and Events. Unchecking High Rank removes High-rank permits and events too.
- **Special Permits / Events / Arena** filter by **source**, whatever rank they are.

They AND together, so a *Permit · High Rank* square needs both Special Permits and High Rank
ticked. Village / Hub / Pub have no source checkbox of their own — they're just the rank.

**Deviants answer to Special Permits whatever quest supplies them.** 14 Arena "XX Trials"
quests hunt deviants, so they need *both* Arena and Special Permits ticked. They stay filed
under Arena because that's what they are; the extra gate is what makes Special Permits mean
"allow deviants" rather than merely "allow permit quests", so unchecking it leaves no deviant
reachable by any route.

Treating these as a single axis was wrong twice over: unchecking High Rank left squares plainly
reading "High Rank" on the card, and no amount of relabelling fixed the fact that the filter
didn't do what its label says.

`questCategory()` returns the tint key (source for SP/Event/Arena, rank otherwise); `baseRank()`
is what the rank gate tests.

`rankLabel()` is separate, and is what a square's sub-line shows. Anything filtered on its own
axis is **prefixed** — *Event · High Rank*, *Permit · G Rank* — so a bare *Low/High/G Rank* only
ever comes from the Low/High/G checkboxes. Arena has no rank band and shows no sub-line.

That prefix isn't decoration. Special Permits originally displayed a plain *High Rank* while
filtering under SP, so unchecking High Rank left squares reading "High Rank" on the card and the
filter looked broken — 120 Special Permits carry a High base rank. If another category is ever
added on its own axis, prefix its label too.

`baseRank()` is the third piece: the plain Low/High/G band, used to build the label.

### Prowler is three separate controls

Mirrors the Quest Randomizer's `p_prowler` / `p_quests` pair, for the same reason — the two
questions are unrelated:

- **Include Prowler** (`f_prowlerOn` → `f.prowler`) emits the `Clear as a Prowler` squares.
  Gated on nothing else: a Prowler can be taken on virtually any quest, so these are
  achievable whatever the quest pool holds. It also gates the *Clear a quest as a Prowler*
  objective, which is why `OBJECTIVES[].ok` takes `(pool, f)` rather than just the pool.
- **Include Prowler-only quests** (`f_prowler` → `f.pQuests`) lets the 121 `Prowler`-flagged
  quests into the pool, so their monsters and objectives become reachable. Disabled and
  forced off when Include Prowler is off (`syncProwlerQuests`) — a hunter can't take one.
- **Biases** are the third layer: subtractive, one square per checked bias.

Gating the squares on `f.pQuests && pool.some(q => q.Prowler)` was the earlier behaviour and
conflated all three: you could not play as a Prowler on ordinary quests without also dragging
121 Prowler-only quests into the monster pool.

**Border colour keys off `questCategory`**, i.e. the same axis as the Objectives panel's
checkboxes, so a square's colour always matches the filter that put it on the card. `CATEGORY_COLORS` runs
the ranks warm and escalating — Low `#f2c53d` yellow, High `#f5851f` orange, G `#e5383b` red —
and gives the categories on their own filter axis their own hues: Special Permits `#8b31d9`
purple, Events `#2456c7` blue, Arena `#8a8f98` grey. `POOL_COLORS` covers the pools that aren't
rank-based at all: objectives `#9b8cff`, custom `#5ec9a0`, free space grey. Weapons keep
`WEAPON_COLORS`, which is per weapon rather than per pool.

Colouring by `baseRank` was the earlier behaviour and was wrong: a Special Permit borrowed
G Rank's colour and an Event borrowed its underlying band's, so colour and filter disagreed.

The tint is stored on each cell and travels in the shared-card payload, so it's part of what
the Worker mirror has to reproduce — a colour change is a generator change, not a CSS one.

**Special Permits contribute only their deviant.** A permit quest often lists incidental
targets alongside it — `Crystalbeard IV` is `["Crystalbeard Uragaan", "Uragaan"]` — and emitting
a goal per monster produced squares like *Hunt Uragaan · Permit*, for a permit you cannot take.
`DEVIANTS` filters them. Note the deviant is **not** reliably first (`Dreadqueen X` is
`["Rathian", "Dreadqueen Rathian"]`), so "take the first monster" is not a valid shortcut, and
the set holds full names because Furious Rajang and Savage Deviljho are rage forms rather than
deviants and would pass a prefix test.

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

## The New Card button (`--cta`)

Same lightness search as `winColor`, and for the same reason, but at the theme's **own** hue
and saturation — it should read as the loudest control on the page without wearing the colour
that means "you won". Verified across all 27 themes: 4.50–4.93:1 against its white text, and
4.26–4.66:1 against the sidebar behind it.

It was `--bg1` before, a near-black shade of the theme sitting on the near-black `--bg2`
sidebar — 1.21:1 on Forbidden, i.e. invisible.

Two things this must not do:

- **Don't floor the saturation.** An early version did, to give the neutral themes
  (K. Daora, Valstrax, Forbidden) something vivid. Those themes have almost no chroma, so a
  floor doesn't make them vivid — it amplifies rounding noise into a hue, and all three came
  out **blue**. They get a neutral grey button instead, at the same contrast as everywhere
  else, which is what keeps the treatment consistent rather than the colour.
- **Don't lighten from the theme colour.** `lighten(#aeb5c1, .40)` is near-white and the
  button's text is white.

On dark themes the search lands lighter than the sidebar, on the pale ones darker. Either way
the separation is ~4.5:1 — the goal is *stands out*, not *is bright*.

`.btn.accent` must also set `background-image:none`, or `.btn.block`'s texture washes it out.

**Measuring cell colours:** `.cell` transitions `background` and `border-color` over 0.12s, and
`getComputedStyle` reports the *animated* value. In a browser that isn't compositing frames
(a headless or hidden pane), those transitions never advance, so colour reads come back frozen
at the previous value while untransitioned properties like `opacity` update normally — which
looks exactly like "the style isn't applying". Inject `*{transition:none !important}` before
measuring, or read `el.style` for the intended value rather than the computed one.

**Chromium gotcha:** changing `--win` on `:root` does *not* reliably repaint a `var()`-based
`background` on cells that have already been painted. The cell reads the new value via
`getComputedStyle` but keeps rendering the old colour, even after a forced reflow. `applyTheme`
therefore calls `renderCard()` — don't remove that, or the highlight silently keeps the previous
theme's colour until the next card.

## Hover preview

Hovering a square shows an enlarged copy, which is what makes the bigger grids usable rather
than merely possible — at 10×10 the text is around 5px. Card Setup carries the minimum grid
size it applies from (default 5×5, or Off).

It clones the cell so it tracks cell styling for free, but the clone lives on `<body>`, outside
the card's container — so anything the card sizes in `cqi` or off `--n` has to be restated in
px under `.tile-preview`. The panel also needs its own opaque backdrop (`--well`): a marked
square's fill is translucent, so without one the grid shows straight through the zoom.

`pointer-events:none` keeps it from ever eating a click, and it's suppressed under
`@media (hover:none)` where it could only ever be a stuck panel.

## Cell text is capped, never shrunk

`MAX_CELL_TEXT` (40) in `app.js` is the ceiling for custom entries. Grid sizes run 3-10, and
font size, cell padding and grid gap are all `calc(... / var(--n))` so a square holds about the
same number of characters at any size — the constants reproduce what 3/4/5 used to hard-code.
The line clamp sits at 4 because a 40-character entry needs three lines at 5×5 and four on the
bigger grids, where the fixed 2px border eats proportionally more of a smaller cell. Every generated goal is shorter than that by
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
| `GET /bingo-link?channel=` | **`!currentcard`** — plain-text link to the stream's current card |
| `GET /bingo-set?channel=` | **`!setcurrentcard`** — rolls a fresh card and makes it the stream's (mods only) |
| `GET /bingo-channel?channel=` | that card as JSON, for rendering `?channel=NAME` |
| `POST /bingo-channel?channel=` | the app pushing the on-screen card to a channel |

### Bot commands are keyed on the CHANNEL, and contain nothing to edit

Streamers will not re-copy a command whenever they make a new card, and they shouldn't have
to. Three earlier attempts were all wrong and shouldn't be revisited:

1. Baking the card's code into `!currentcard` — went stale on every new card.
2. Making that code a permanent *slot* with a minted write key — better, but still meant
   copying a unique URL after a setup step, and broke on cleared storage, a second device, or
   KV expiry.
3. Emitting `?channel=$(channel)` and relying on the bot to substitute it — technically
   correct and genuinely identical for everyone, but `$(channel)` **reads as a placeholder**.
   People edit it, or stall wondering whether they're supposed to. A command that has to be
   understood before it works is a command that gets set up wrong.

So the app learns the channel and emits **complete URLs with nothing left to substitute** —
no `$(channel)`, no `YOUR_CHANNEL`, nothing that looks like a blank to fill in. A channel name
is safe to bake in precisely because it never changes, which is what distinguishes it from the
card ids and keys of attempts 1 and 2.

The channel comes from Twitch login (see below) or, for anyone who'd rather not log in, a text
field. Login wins when both are present.

`!setcurrentcard` deliberately has **no secret**: a secret would have to live in the command's
URL, which is the exact hardcoding this avoids. The bot's own moderator restriction is the
control. The worst case is a stranger rerolling a stream's bingo card, which a mod undoes by
running the command again. If that ever becomes a real problem, add an *optional* key rather
than a required one.

Channel entries use a 365-day TTL, not the 30-day card TTL — a stream's commands must not
expire mid-season.

### Twitch login exists only to fill in the channel name

Reuses the Worker's existing OAuth (`/auth/login?return=bingo`), the same flow the bot settings
page and the Quest Randomizer use. `auth.js` keeps an allowlist, `RETURN_DESTINATIONS`, mapping
a permitted `return` key to a constant URL — the redirect target is never built from the query
value, so adding an app means adding a line there, never widening it to "redirect anywhere".
The callback hands the session token back in the URL **fragment**, which is never sent to a
server or put in a `Referer`.

**Nothing is authorised by this login.** The bot endpoints take no credentials, because a chat
bot has none to give; they're keyed on the channel and open by design. The token is decoded
client-side purely to display and pre-fill a name, and `decodeTokenLogin` deliberately does not
verify the signature because no decision rides on it. Don't mistake this for an auth boundary
and start trusting it.

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
