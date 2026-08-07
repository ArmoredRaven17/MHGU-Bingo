# MHGU Bingo

A bingo card generator for **Monster Hunter Generations Ultimate**.

**→ [armoredraven17.github.io/MHGU-Bingo](https://armoredraven17.github.io/MHGU-Bingo/)**

Build a 3×3, 4×4 or 5×5 card of hunting goals, mark them off as you clear them, and race a
friend on the same board.

## What goes on a card

Four pools, each toggleable with its own weight:

| Pool | Example cell |
|---|---|
| **Monsters** | Hunt Rathalos — *High Rank* |
| **Weapons** | Clear with Hunting Horn — *Adept* |
| **Objectives** | Capture a monster · Clear a Hyper quest · Clear without fainting |
| **Custom** | Whatever you add — *"Moxie saved you, then Heat Damage got you"* |

Monsters are drawn per rank, so a monster you can hunt at both High and G Rank gives you two
different squares. Every square is colour-coded — by rank, by weapon, or by pool.

Goals respect your filters, so a card never asks for a monster or a rank you've excluded, and
objectives are checked against the quest pool too — you'll never be told to capture something
when captures are filtered out.

## Sharing a card

- **Seed** — every card has a short seed like `MHGU-5F-M4W3O2C3-K7T2NX-9C4A`, shown in the title
  bar with a Copy button. Paste one back to regenerate that card. Works across browsers as long
  as your settings match.
- **Share code** — publishes the exact card and gives you a short link. This is the reliable
  option, and the only one that carries custom entries.
- **Twitch** — `!bingo` rolls a brand-new card for whoever runs it and prints both a link and
  the seed, so anyone can open that board or rebuild it here. `!mycard` points at your own card
  instead, for when chat should follow along with yours. Both are ready to paste from the
  Twitch button in the app.

## Filters

Quest type, level range, monsters, weapons, styles, and the usual category flags (hyper,
capture, egg, gathering, small monsters, one-faint, on-site). These narrow which monsters,
ranks and objectives can land on a card.

## Development

Serve `docs/` over HTTP — there is no build step for the app:

```bash
cd docs && python -m http.server
```

Quest data is generated from the vendored JSON. After updating those files:

```bash
node tools/build-data.js
```

See [CLAUDE.md](CLAUDE.md) for conventions, including the mandatory `?v=` cache-bust bump.

## Credits

Quest, monster and icon data comes from the
[MHGU Quest Randomizer](https://github.com/armoredraven17/MHGU-Quest-Randomizer).
Monster Hunter is © Capcom.
