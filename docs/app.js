"use strict";
(function () {
  const DATA = window.MHGU_BINGO_DATA || { quests: [], monsters: [], dataVersion: "0" };
  const $ = (id) => document.getElementById(id);

  // ── Static config (ported from the MHGU Quest Randomizer) ──────────────────
  const WEAPONS = ["Great Sword","Long Sword","Sword & Shield","Dual Blades",
    "Hammer","Hunting Horn","Lance","Gunlance","Switch Axe","Charge Blade",
    "Insect Glaive","Light Bowgun","Heavy Bowgun","Bow"];

  const WEAPON_COLORS = {
    "Great Sword":"#ff505b","Long Sword":"#9beaf1","Sword & Shield":"#dfd65f",
    "Dual Blades":"#6ac083","Hammer":"#c3a3d2","Hunting Horn":"#f89a64",
    "Lance":"#9fbcff","Gunlance":"#f4baf5","Switch Axe":"#aaaaaa",
    "Charge Blade":"#fc5800","Insect Glaive":"#f5f5f5","Light Bowgun":"#acd56b",
    "Heavy Bowgun":"#f8899c","Bow":"#55edc4","Prowler":"#c29930",
  };

  const STYLES = ["Guild","Striker","Adept","Aerial","Valor","Alchemy"];

  // Every cell carries a colour so no pool looks like the odd one out. Where a cell has a
  // sub-line the colour encodes it — weapon colours above, hunt rank here — and the pools
  // with no sub-line get one flat colour each.
  // Border of a marked square: the pool's own colour, lightened. Solid white shouted over
  // the --win fill a completed line gets, but a dimmed white just vanished — on a dark
  // theme a low-alpha white over a dark fill is nothing at all. Lightening the tint keeps
  // it visible on every theme, keeps the pool readable at a glance, and still leaves the
  // win treatment as the loudest thing on the card.
  const markedBorder = (tint) =>
    tint ? css(lighten(hexRgb(tint), 0.55)) : "rgba(255,255,255,.55)";

  // Border colour is keyed on the filter category a square came from — the same axis as
  // questCategory and the Objective Filters checkboxes — so the colour always matches the
  // filter that put it on the card. Ranks run warm and escalating (yellow to red);
  // the categories on their own filter axis get their own hues.
  const CATEGORY_COLORS = {
    Low: "#f2c53d", High: "#f5851f", G: "#e5383b",
    SP: "#8b31d9", Event: "#2456c7", Arena: "#8a8f98", "": "#8a8f98",
  };
  const POOL_COLORS = { objective: "#9b8cff", custom: "#5ec9a0", free: "#8a8f98" };

  // Cell text is never shrunk to fit — it's capped instead, so every card renders at one
  // size. The longest generated goal ("Hunt Chaotic Gore Magala") is 24 characters; this
  // leaves headroom for custom entries without overflowing a 5x5 square.
  const MAX_CELL_TEXT = 40;

  const BIAS_NAMES = () => BIASES.map(b => b[0]);
  const BIASES = [
    ["Charisma",  "FourthGen-Palico_Icon_Blue.webp"],
    ["Fighting",  "Palico_Weapon_Cutting_Icon_Red.webp"],
    ["Protection","FourthGen-Down_Arrow_Icon_Blue.webp"],
    ["Assisting", "MH4G-Trap_Icon_Purple.webp"],
    ["Healing",   "MH4G-Horn_Icon_Green.webp"],
    ["Bombing",   "MH4G-Barrel_Icon_Brown.webp"],
    ["Gathering", "MH4G-Boomerang_Icon_Blue.webp"],
    ["Beast",     "FourthGen-Claw_Icon_Dark_Red.webp"],
  ];
  const BIAS_FILE = Object.fromEntries(BIASES);

  const SP_TIERS = {I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,G1:11,G2:12,G3:13,G4:14,G5:15,EX:16};


  const COLORS = [
    ["Teostra","#570B0B"],["Rathalos","#b51717"],
    ["Tetsucabra","#c65900"],["Agnaktor","#fc933e"],
    ["Tigrex","#C8A319"],["Rajang","#f1d364"],
    ["Deviljho","#0B570F"],["Rathian","#3a9b3f"],
    ["Astalos","#14503d"],["Zinogre","#2dae85"],
    ["Zamtrios","#005984"],["Plesioth","#0080c1"],
    ["Brachydios","#0B2757"],["Lagiacrus","#0b3f97"],
    ["G. Magala","#1F0B57","Gore Magala"],["Nerscylla","#4e2fa2"],
    ["Y. Garuga","#62008f","Yian Garuga"],["Chameleos","#8e50ab"],
    ["Mizutsune","#D84696"],["Congalala","#ce79a8"],
    ["Duramboros","#5a411f"],["Diablos","#997c54"],
    ["Barroth","#B57C45"],["Bulldrome","#cfaa87"],
    ["K. Daora","#505358","Kushala Daora"],["Valstrax","#aeb5c1"],
    ["Forbidden","#1E2025","Question Mark"],
  ];
  const COLORS_HEX = Object.fromEntries(COLORS.map(([name, hex]) => [hex.toUpperCase(), name]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([name,,icon]) => [name, icon]));

  const BOT_API_ORIGIN = "https://mhgu-bot-api.raven-mhgu.workers.dev";

  // ── Icon path helpers ──────────────────────────────────────────────────────
  const FALLBACK_ICON = "assets/MonsterIcons/MHGU-Question_Mark_Icon.webp";
  const monsterIcon = (name) => name
    ? "assets/MonsterIcons/MHGU-" + name.replace(/ /g, "_") + "_Icon.webp"
    : FALLBACK_ICON;
  const weaponIcon = (w) => "assets/WeaponIcons/icon_" +
    w.toLowerCase().replace(/ & /g, "_and_").replace(/ /g, "_") + "_tinted.png";
  const prowlerIcon = (f) => "assets/ProwlerIcons/" + f;

  // ── Quest name parsing ─────────────────────────────────────────────────────
  function spTier(name) {
    const c = name.indexOf(":"); if (c < 1) return 0;
    const s = name.lastIndexOf(" ", c - 1); if (s < 0) return 0;
    return SP_TIERS[name.slice(s + 1, c)] || 0;
  }
  // Which rank band a quest belongs to. Village is Low throughout; Hub crosses into High
  // at 4★; Pub is G Rank; Special Permits cross at the G tiers; Events carry their rank in
  // Level. Arena quests don't sit on that ladder, so they contribute no rank.
  // Underlying difficulty band. Drives the cell colour, and is what an Event quest's
  // rank is measured against — Events span Low/High/G like anything else.
  function baseRank(q) {
    switch (q.Type) {
      case "Village":         return "Low";
      case "Hub":             return q.Level <= 3 ? "Low" : "High";
      case "Pub":             return "G";
      case "Special Permits": return spTier(q.Name || "") >= 11 ? "G" : "High";
      case "Events":          return q.Level === 1 ? "Low" : q.Level === 2 ? "High" : "G";
      default:                return "";
    }
  }

  // What the sub-line on a monster square reads. Events keep their rank but say so, since
  // "Hunt Rathalos / High Rank" and the Event version are different hunts to go and find.
  // Anything filtered on its own axis says so, so a bare "High Rank" only ever comes from
  // the Low/High/G checkboxes. Without the Permit prefix, unchecking High Rank still left
  // squares reading "High Rank" on the card — Special Permits pass the SP filter but 120
  // of them carry a High base rank, so it looked like the filter was broken.
  function rankLabel(q) {
    const r = baseRank(q);
    if (!r) return "";
    const prefix = q.Type === "Events" ? "Event · "
      : q.Type === "Special Permits" ? "Permit · " : "";
    return prefix + r + " Rank";
  }

  // What the Objective Filters switch on. Village / Hub / Pub / Events are just delivery
  // mechanisms for a rank, so they collapse into Low / High / G; Special Permits and Arena
  // are their own thing and stay separate. This is the filter axis — rankLabel above stays
  // the *display* rank, which is why an SP quest still shows "High Rank" on a card.
  const RANK_FILTERS = [
    ["f_low",   "Low Rank",         "Low"],
    ["f_high",  "High Rank",        "High"],
    ["f_g",     "G Rank",           "G"],
    ["f_sp",    "Special Permits",  "SP"],
    ["f_event", "Events",           "Event"],
    ["f_arena", "Arena",            "Arena"],
  ];
  const ALL_RANKS = RANK_FILTERS.map(r => r[2]);

  function questCategory(q) {
    if (q.Type === "Special Permits") return "SP";
    if (q.Type === "Arena") return "Arena";
    if (q.Type === "Events") return "Event";
    return baseRank(q);
  }

  // ── Seeded RNG ─────────────────────────────────────────────────────────────
  // Every draw on a card routes through here. Math.random() is used in exactly ONE
  // place in this file (newToken, below) — if a grep turns up two, something has
  // broken seed reproducibility.
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seedStr) {
    const next = mulberry32(hashStr(seedStr));
    return { next, rand: (n) => Math.floor(next() * n) };
  }
  // Weighted sampling without replacement (Efraimidis-Spirakis): key = u^(1/w), highest
  // key drawn first. Sorted ascending so the caller's pop() takes the highest. With all
  // weights 1 this is a plain uniform shuffle.
  function weightedShuffle(items, rng) {
    return items
      .map(it => ({ it, k: Math.pow(rng.next(), 1 / (it.w || 1)) }))
      .sort((a, b) => a.k - b.k)
      .map(e => e.it);
  }

  // ── Seed codec ─────────────────────────────────────────────────────────────
  const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
  const b32 = (n, len) => { let s = ""; for (let i = 0; i < len; i++) { s = B32[n & 31] + s; n = n >>> 5; } return s; };
  const CAT_LETTER = { monster:"M", weapon:"W", objective:"O", custom:"C" };
  const LETTER_CAT = Object.fromEntries(Object.entries(CAT_LETTER).map(([k, v]) => [v, k]));
  const SEED_RE = /^MHGU-([3-9]|10)([FN])-((?:[MWOC][1-9])+)-([0-9A-Z]{6})-([0-9A-Z]{4})$/;

  // The one and only unseeded call in this file.
  const newToken = () => b32(Math.floor(Math.random() * 0x100000000), 6);

  // cfg.free is the user's *preference*; an even grid has no centre square, so the
  // effective value is always gated on oddness. Keeping the two apart means switching
  // 5×5 → 4×4 → 5×5 doesn't silently forget that free space was wanted.
  const effFree = (c) => !!c.free && c.size % 2 === 1;

  function seedBody(c, token) {
    const cats = CATS.filter(x => (c.cats[x.id] | 0) > 0)
      .map(x => CAT_LETTER[x.id] + c.cats[x.id]).join("");
    return "MHGU-" + c.size + (effFree(c) ? "F" : "N") + "-" + cats + "-" + token;
  }

  // Order-independent description of everything that changes which goals are eligible.
  // Hashed into the seed's last segment so a pasted seed can warn that it was built under
  // different settings. Advisory only — never a correctness gate.
  function fingerprint(f, pool) {
    return [
      "d" + DATA.dataVersion,
      "R" + [...f.ranks].sort().join("."),
      "M" + [...f.includedMonsters].sort().join("."),
      "W" + f.weapons.slice().sort().join("."),
      "S" + f.styles.slice().sort().join(".") ,
      "P" + f.biases.slice().sort().join("."),
      "F" + ["large","hyper","capture","egg","gathering","small","multi","oneFaint","onSite",
             "pQuests","prowler"]
        .map(k => f[k] ? 1 : 0).join(""),
      "C" + pool.filter(c => c.checked).map(c => c.text + "@" + c.weight).sort().join("."),
    ].join("|");
  }

  // Accepts anything. A well-formed seed is decoded; anything else becomes a token so
  // typing a word still produces a reproducible card (the box is rewritten with the
  // canonical seed afterwards).
  function decodeSeed(raw) {
    const parts = String(raw).trim().split("-");
    // Only the token and fingerprint are base32 — normalizing the whole string would
    // corrupt the O in the Objective category letter.
    if (parts.length === 5) {
      const norm = (s) => s.toUpperCase().replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0").replace(/U/g, "V");
      const seed = [parts[0].toUpperCase(), parts[1].toUpperCase(), parts[2].toUpperCase(), norm(parts[3]), norm(parts[4])].join("-");
      const m = seed.match(SEED_RE);
      if (m) {
        const cats = {};
        for (const [, letter, w] of m[3].matchAll(/([MWOC])([1-9])/g)) cats[LETTER_CAT[letter]] = +w;
        for (const c of CATS) if (!(c.id in cats)) cats[c.id] = 0;
        return { cfg: { size: +m[1], free: m[2] === "F", cats }, token: m[4], fp: m[5] };
      }
    }
    return { cfg: null, token: b32(hashStr(String(raw).trim().toLowerCase()), 6), fp: null };
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const DEFAULT_CFG = { size: 5, free: true, cats: { monster: 4, weapon: 3, objective: 2, custom: 3 } };
  // Must match the #gridSize options and the Worker's SIZES, or a saved size is silently
  // snapped back to 5 on reload.
  const SIZES = [3, 4, 5, 6, 7, 8, 9, 10];
  const DEFAULT_POOL = [
    "Get carted by a large monster",
    "Moxie saved you, then you died anyway",
    "Get carted by a small monster",
    "Clear quest in under 5 minutes",
    "Sharpen mid-combo and get hit for it",
    "Trip another hunter with your own attack",
    "Forget to eat before departing",
    "Forget Whetstones or Ammo",
    "Slay the capture target by mistake",
    "Faint in the first five minutes",
  ].map(text => ({ text, weight: 5, checked: true }));

  let cfg = JSON.parse(JSON.stringify(DEFAULT_CFG));
  let customPool = DEFAULT_POOL.map(c => Object.assign({}, c));
  let card = null;             // {seed, token, fp, cfg, modified, freeIdx, cells, marked:Set}
  let bags = {};               // leftover goals per category, for per-cell rerolls
  let usedKeys = new Set();
  let sharedView = false;      // viewing someone else's card via ?c=
  // Display preference only. Deliberately NOT on cfg: seedBody and fingerprint read cfg,
  // and decodeSeed rebuilds it wholesale, so a value parked there would either leak into
  // the seed or be silently reset by loading one.
  let showReroll = true;

  // Every key this app owns is namespaced mhgu-bingo-*. Nothing is shared with the other
  // MHGU apps, even though GitHub Pages puts them on one localStorage origin.
  const SETTINGS_KEY = "mhgu-bingo-settings";
  const POOL_KEY     = "mhgu-bingo-pool";
  const CARD_KEY     = "mhgu-bingo-card";
  const CHANNEL_KEY  = "mhgu-bingo-channel";
  const THEME_KEY    = "mhgu-bingo-theme";

  // ── Quest pool ─────────────────────────────────────────────────────────────
  // Category predicate ported from the Quest Randomizer's randomize(); the rank axis is
  // this app's own. `f.ranks` is the Set of enabled categories from RANK_FILTERS.
  //
  // MUST stay identical to worker/src/bingo-gen.js — a card rolled by !bingo and the same
  // seed pasted into the app only match if both sides filter and draw the same way.
  function buildQuestPool(f) {
    return DATA.quests.filter(q => {
      // Two independent gates, not one combined axis.
      //
      // Source: the three categories that have their own checkbox. Unchecking Special
      // Permits removes permits whatever rank they are.
      const cat = questCategory(q);
      if ((cat === "SP" || cat === "Event" || cat === "Arena") && !f.ranks.has(cat)) return false;

      // A handful of Arena quests (the XX Trials) hunt deviants. They stay filed under
      // Arena — that's what they are — but deviants are permit content, so they answer to
      // BOTH boxes. This is what makes "Special Permits" mean "allow deviants" rather than
      // merely "allow permit quests": with it unchecked, no deviant reaches a card by any
      // route. Redundant for cat === "SP", which the gate above already covered.
      if (!f.ranks.has("SP") && (q.Monsters || []).some(m => DEVIANTS.has(m))) return false;

      // Rank: applies to EVERY quest that has one, whatever its source. Unchecking High
      // Rank therefore also removes High-rank Permits and Events — treating them as their
      // own axis meant "High Rank off" left High Rank squares on the card. Ordinary
      // Village/Hub/Pub quests have cat === rank, so this gate covers them too.
      const rank = baseRank(q);
      if (rank && !f.ranks.has(rank)) return false;

      if (q.LgMonster && !f.large) return false;

      const include = (q.LgMonster && !q.Capture)
        || (q.Capture && f.capture)
        || (q.Prowler && f.pQuests) || (q.Hyper && f.hyper)
        || (q.Egg && f.egg) || (q.Gathering && f.gathering) || (q.SmMonsters && f.small);
      if (!include) return false;

      if (q.Prowler && !f.pQuests) return false;
      if (q.Hyper && !f.hyper) return false;
      const isMultiMonster = (q.Monsters && q.Monsters.length > 1) ||
        (q.LgMonster && /\b[2-9]\b/.test(q.Main || ""));
      if (isMultiMonster && !f.multi) return false;
      if (q.OneFaint && !f.oneFaint) return false;
      if (q.OnSite && !f.onSite) return false;

      if (q.LgMonster && f.monsterFilterActive) {
        const qmons = (q.Monsters && q.Monsters.length) ? q.Monsters : (q.Monster ? [q.Monster] : []);
        if (qmons.length > 0 && !qmons.every(m => f.includedMonsters.has(m.toLowerCase()))) return false;
      }
      return true;
    });
  }

  // ── Goal generators ────────────────────────────────────────────────────────
  // Monster goals come from the monsters that actually appear on quests in the pool,
  // NOT from LgMonsters.json. The two disagree in both directions: White Fatalis is
  // listed but referenced by zero quests (an impossible goal), while Silver Rathalos,
  // Gold Rathian and Old Fatalis appear on quests but aren't in the list.
  // One goal per monster *per rank it's actually huntable at* in the current pool, so
  // "Hunt Rathalos" at Low and at High are separate squares and both are achievable. The
  // rank lives on the sub-line rather than in the text, which keeps every cell short.
  // Fixed emission order, so the goal list is identical here and in the Worker.
  // The 18 deviants. A Special Permit is *about* its deviant; the other monsters on the
  // quest are incidental targets you can't take a permit for, so they must not become
  // goals. Deliberately full names rather than a prefix test: Furious Rajang and Savage
  // Deviljho are rage forms, not deviants, and would slip through a looser check.
  const DEVIANTS = new Set([
    "Redhelm Arzuros", "Snowbaron Lagombi", "Stonefist Hermitaur", "Dreadqueen Rathian",
    "Drilltusk Tetsucabra", "Silverwind Nargacuga", "Crystalbeard Uragaan",
    "Deadeye Yian Garuga", "Dreadking Rathalos", "Thunderlord Zinogre", "Grimclaw Tigrex",
    "Hellblade Glavenus", "Nightcloak Malfestio", "Rustrazor Ceanataur", "Soulseer Mizutsune",
    "Boltreaver Astalos", "Elderfrost Gammoth", "Bloodbath Diablos",
  ]);

  const RANK_ORDER = ["Low Rank", "High Rank", "G Rank",
    "Event · Low Rank", "Event · High Rank", "Event · G Rank",
    "Permit · Low Rank", "Permit · High Rank", "Permit · G Rank", ""];
  function monsterGoals(pool) {
    const seen = new Map();   // monster -> Map(sub-line label -> base rank, for the colour)
    for (const q of pool) {
      if (!q.LgMonster) continue;
      const label = rankLabel(q), cat = questCategory(q);
      const all = (q.Monsters && q.Monsters.length) ? q.Monsters : (q.Monster ? [q.Monster] : []);
      const list = q.Type === "Special Permits" ? all.filter(m => DEVIANTS.has(m)) : all;
      for (const m of list) {
        if (!m) continue;
        if (!seen.has(m)) seen.set(m, new Map());
        if (label) seen.get(m).set(label, cat);
      }
    }
    const out = [];
    for (const [name, labels] of seen) {
      // A monster only ever seen in Arena quests has no rank band; it still gets a square,
      // just without a sub-line.
      const have = labels.size ? labels : new Map([["", "Arena"]]);
      for (const label of RANK_ORDER) {
        if (!have.has(label)) continue;
        out.push({
          key: "m:" + name + ":" + label,
          cat: "monster",
          text: "Hunt " + name,
          sub: label,
          icon: monsterIcon(name),
          tint: CATEGORY_COLORS[have.get(label)],
        });
      }
    }
    return out;
  }

  function weaponGoals(pool, f) {
    const out = [];
    for (const w of f.weapons) {
      if (!f.styles.length) {
        out.push({ key: "w:" + w, cat: "weapon", text: "Clear with " + w, sub: "", icon: weaponIcon(w), tint: WEAPON_COLORS[w] });
      } else {
        for (const s of f.styles) {
          out.push({ key: "w:" + w + "|" + s, cat: "weapon", text: "Clear with " + w, sub: s, icon: weaponIcon(w), tint: WEAPON_COLORS[w] });
        }
      }
    }
    // Gated on "Include Prowler", NOT on Prowler-only quests being in the pool: a Prowler
    // can be taken on virtually any quest, so these squares are achievable whatever else
    // the pool holds. The two are separate controls for exactly that reason.
    if (f.prowler) {
      // One square per enabled bias, in BIASES order so the list is identical here and in
      // the Worker.
      for (const [name, file] of BIASES) {
        if (!f.biases.includes(name)) continue;
        out.push({ key: "w:Prowler|" + name, cat: "weapon", text: "Clear as a Prowler", sub: name, icon: prowlerIcon(file), tint: WEAPON_COLORS.Prowler });
      }
    }
    return out;
  }

  // Each objective is gated on the pool actually containing a quest that can satisfy it,
  // so a card never asks for something impossible under the current filters.
  const OBJECTIVES = [
    { id:"capture",  text:"Capture a monster",             icon:"", ok:p => p.some(q => q.Capture) },
    { id:"hyper",    text:"Clear a Hyper quest",           icon:"assets/MonsterIcons/MHGU-Hyper_Monster_Icon.png", ok:p => p.some(q => q.Hyper) },
    { id:"egg",      text:"Clear an Egg Delivery",         icon:"assets/MonsterIcons/MHGU-Egg_Quest_Icon.webp", ok:p => p.some(q => q.Egg) },
    { id:"gather",   text:"Clear a Gathering quest",       icon:"assets/MonsterIcons/MHGU-Wycademy_Quest_Icon.png", ok:p => p.some(q => q.Gathering) },
    { id:"small",    text:"Clear a Small Monster quest",   icon:"", ok:p => p.some(q => q.SmMonsters) },
    { id:"key",      text:"Clear a Key quest",             icon:"", ok:p => p.some(q => q.Key) },
    { id:"sp",       text:"Clear a Special Permit",        icon:"", ok:p => p.some(q => q.Type === "Special Permits") },
    { id:"arena",    text:"Clear an Arena quest",          icon:"", ok:p => p.some(q => q.Type === "Arena") },
    { id:"event",    text:"Clear an Event quest",          icon:"", ok:p => p.some(q => q.Type === "Events") },
    // Answers to the Prowler toggle rather than the pool: any quest counts, so what makes
    // this reachable is being allowed to play one at all.
    { id:"prowler",  text:"Clear a quest as a Prowler",    icon:"", ok:(p, f) => f.prowler },
    { id:"onefaint", text:"Clear a One-Faint quest",       icon:"", ok:p => p.some(q => q.OneFaint) },
    { id:"onsite",   text:"Clear an On-Site Items quest",  icon:"", ok:p => p.some(q => q.OnSite) },
    { id:"multi",    text:"Clear a Multi-Monster quest",   icon:"", ok:p => p.some(q => q.Monsters && q.Monsters.length > 1) },
    { id:"nofaint",  text:"Clear a quest without fainting",icon:"", ok:() => true },
  ];
  function objectiveGoals(pool, f) {
    return OBJECTIVES.filter(o => o.ok(pool, f))
      .map(o => ({ key: "o:" + o.id, cat: "objective", text: o.text, sub: "", icon: o.icon, tint: POOL_COLORS.objective }));
  }

  function customGoals(pool) {
    return pool.filter(c => c.checked && c.text.trim())
      .map(c => ({ key: "c:" + c.text, cat: "custom", text: c.text, sub: "", icon: "",
                   tint: POOL_COLORS.custom, w: c.weight || 1 }));
  }

  // Custom entries arrive as a parameter rather than being read from module state, so a
  // card can be built from the DEFAULT pool without disturbing the user's own — that's
  // what lets a bot seed rebuild exactly. Mirrors worker/src/bingo-gen.js.
  const CATS = [
    { id:"monster",   label:"Monsters",   items:(pool)        => monsterGoals(pool) },
    { id:"weapon",    label:"Weapons",    items:(pool, f)     => weaponGoals(pool, f) },
    { id:"objective", label:"Objectives", items:(pool, f)     => objectiveGoals(pool, f) },
    { id:"custom",    label:"Custom",     items:(pool, f, cp) => customGoals(cp) },
  ];

  // ── Card construction ──────────────────────────────────────────────────────
  function buildCells(rng, c, pool, f, cp) {
    const n = c.size * c.size;
    const freeIdx = effFree(c) ? (n - 1) / 2 : -1;
    const need = n - (freeIdx >= 0 ? 1 : 0);
    const active = CATS.filter(x => (c.cats[x.id] | 0) > 0);

    const localBags = {};
    for (const x of active) localBags[x.id] = weightedShuffle(x.items(pool, f, cp), rng);

    const used = new Set(), drawn = [];
    // Each pass either consumes a goal or breaks, so this always terminates: the result
    // is exactly min(need, total eligible) distinct goals — never a duplicate, never a
    // rejection-retry loop that could spin.
    while (drawn.length < need) {
      const live = active.filter(x => localBags[x.id].length);
      if (!live.length) break;
      const total = live.reduce((s, x) => s + c.cats[x.id], 0);
      let r = rng.next() * total, chosen = live[live.length - 1];
      for (const x of live) { r -= c.cats[x.id]; if (r < 0) { chosen = x; break; } }
      const goal = localBags[chosen.id].pop();
      if (used.has(goal.key)) continue;
      used.add(goal.key);
      drawn.push(goal);
    }

    const cells = [];
    let di = 0;
    for (let i = 0; i < n; i++) {
      if (i === freeIdx) cells.push({ key: "free", cat: "free", text: "FREE", sub: "", icon: "", tint: POOL_COLORS.free });
      else if (di < drawn.length) cells.push(drawn[di++]);
      else cells.push({ key: "empty:" + i, cat: "empty", text: "—", sub: "", icon: "", tint: "" });
    }
    return { cells, freeIdx, need, filled: drawn.length, bags: localBags, used };
  }

  // The settings a first-time visitor has, matching doReset(). Cards rolled by the Twitch
  // bot are built from exactly these, server-side — which is what makes the seed it prints
  // reproducible here (see applySeed).
  function defaultFilters() {
    return {
      large: true, hyper: true, capture: true, egg: true, gathering: true,
      small: true, multi: true, oneFaint: true, onSite: true,
      pQuests: false, prowler: false,
      ranks: new Set(ALL_RANKS),
      includedMonsters: new Set(DATA.monsters.map(m => m.MonsterName.toLowerCase())),
      monsterFilterActive: false,
      weapons: WEAPONS, styles: STYLES, biases: BIAS_NAMES(),
    };
  }

  function generate(token, opts) {
    const o = opts || {};
    if (o.cfg) cfg = o.cfg;
    // A seed made under default settings is rebuilt under default settings, whatever the
    // viewer has configured locally — otherwise a seed from chat quietly produces a
    // different board for anyone who has customised their pools.
    const f = o.defaults ? defaultFilters() : currentFilters();
    const cp = o.defaults ? DEFAULT_POOL : customPool;
    const pool = buildQuestPool(f);
    const body = seedBody(cfg, token);
    const fp = b32(hashStr(fingerprint(f, cp)), 4);
    const rng = makeRng(body);                       // NOT including the fingerprint
    const built = buildCells(rng, cfg, pool, f, cp);

    bags = built.bags;
    usedKeys = built.used;
    card = {
      seed: body + "-" + fp,
      token, fp,
      cfg: JSON.parse(JSON.stringify(cfg)),
      modified: false,
      freeIdx: built.freeIdx,
      cells: built.cells,
      marked: new Set(built.freeIdx >= 0 ? [built.freeIdx] : []),
      created: Date.now(),
      need: built.need,
      short: built.need - built.filled,
    };
    sharedView = false;
    // The published code is deliberately NOT cleared here. It's a permanent slot for the
    // stream — !currentcard points at it and !setcurrentcard rolls into it — so it has to
    // outlive individual cards, otherwise those bot commands go stale on every New Card.
    renderCard();
    saveCard();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function renderCard() {
    const wrap = $("bingoCard");
    hidePreview();
    wrap.textContent = "";
    if (!card) return;
    wrap.dataset.n = card.cfg.size;
    wrap.style.setProperty("--n", card.cfg.size);

    card.cells.forEach((cell, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "cell";
      if (cell.cat === "free") el.classList.add("free");
      if (cell.cat === "empty") el.classList.add("empty");
      if (card.marked.has(i)) el.classList.add("marked");
      el.setAttribute("aria-pressed", card.marked.has(i) ? "true" : "false");
      // Border is painted by highlightLines(), which runs at the end of this function.

      if (cell.icon) {
        const img = document.createElement("img");
        img.className = "cell-icon";
        img.alt = "";
        img.src = cell.icon;
        // Five monsters (Fatalis variants, Alatreon, Nakarkos) have no icon file. Null
        // the handler first so a missing fallback can't loop.
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };
        el.appendChild(img);
      }
      if (cell.sub) {
        const sub = document.createElement("div");
        sub.className = "cell-sub";
        sub.textContent = cell.sub;
        el.appendChild(sub);
      }
      const txt = document.createElement("div");
      txt.className = "cell-text";
      txt.textContent = cell.text;      // user-authored text — never innerHTML
      el.appendChild(txt);

      if (cell.cat !== "free" && cell.cat !== "empty" && !sharedView && showReroll) {
        const rr = document.createElement("button");
        rr.type = "button";
        rr.className = "cell-reroll";
        rr.textContent = "↻";
        rr.title = "Reroll this square";
        rr.setAttribute("aria-label", "Reroll this square");
        rr.addEventListener("click", (e) => { e.stopPropagation(); rerollCell(i); });
        el.appendChild(rr);
      }

      if (cell.cat !== "free" && cell.cat !== "empty") {
        el.addEventListener("click", () => toggleMark(i));
      }
      wrap.appendChild(el);
    });

    highlightLines();
    updateSeedBar();
    updateBanner();
  }

  function toggleMark(i) {
    if (card.marked.has(i)) card.marked.delete(i); else card.marked.add(i);
    const el = $("bingoCard").children[i];
    const on = card.marked.has(i);
    el.classList.toggle("marked", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
    highlightLines();
    saveCard();
  }

  // Row/column/diagonal index sets for a given size.
  function linesFor(s) {
    const out = [];
    for (let r = 0; r < s; r++) out.push(Array.from({ length: s }, (_, c) => r * s + c));
    for (let c = 0; c < s; c++) out.push(Array.from({ length: s }, (_, r) => r * s + c));
    out.push(Array.from({ length: s }, (_, i) => i * s + i));
    out.push(Array.from({ length: s }, (_, i) => i * s + (s - 1 - i)));
    return out;
  }

  function highlightLines() {
    if (!card) return;
    const s = card.cfg.size;
    const cells = $("bingoCard").children;
    const done = linesFor(s).filter(ln => ln.every(i => card.marked.has(i)));
    const lit = new Set();
    for (const ln of done) for (const i of ln) lit.add(i);

    // Single place that decides a square's border, in priority order: part of a completed
    // line beats merely marked, which beats the pool's own colour.
    //
    // Marking is deliberately quiet — see MARKED_BORDER. The fill and the dimmed icon
    // already say "done", so a hard white outline on top only competes with the --win
    // treatment that announces an actual bingo. The loud state is the win, not the mark.
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.toggle("line", lit.has(i));
      cells[i].style.borderColor = lit.has(i) ? "var(--win)"
        : card.marked.has(i) ? markedBorder(card.cells[i].tint)
        : (card.cells[i].tint || "");
    }

    const el = $("status");
    const total = card.cells.filter(c => c.cat !== "empty").length;
    el.classList.toggle("win", done.length > 0);
    if (card.marked.size >= total && total > 0) el.textContent = "BLACKOUT!";
    else if (done.length) el.textContent = "Bingo! " + done.length + (done.length === 1 ? " line" : " lines");
    else el.textContent = card.marked.size + " of " + total + " marked";
  }

  function rerollCell(i) {
    const cell = card.cells[i];
    // Prefer the cell's own category; fall back to whatever bag still has goals.
    let bag = bags[cell.cat];
    if (!bag || !bag.length) {
      const alt = CATS.filter(c => bags[c.id] && bags[c.id].length)
        .sort((a, b) => (card.cfg.cats[b.id] | 0) - (card.cfg.cats[a.id] | 0))[0];
      bag = alt ? bags[alt.id] : null;
    }
    if (!bag || !bag.length) { flash($("status"), "Nothing left to swap in"); return; }
    let next = null;
    while (bag.length) { const g = bag.pop(); if (!usedKeys.has(g.key)) { next = g; break; } }
    if (!next) { flash($("status"), "Nothing left to swap in"); return; }
    usedKeys.delete(cell.key);
    usedKeys.add(next.key);
    card.cells[i] = next;
    card.marked.delete(i);
    card.modified = true;
    renderCard();
    saveCard();
  }

  function flash(el, msg) {
    const orig = el.textContent;
    el.textContent = msg;
    setTimeout(() => { if (el.textContent === msg) el.textContent = orig; }, 1500);
  }

  function updateSeedBar() {
    if (!card) return;
    $("seedInput").value = card.seed;
    $("seedModified").classList.toggle("hidden", !card.modified);
  }

  function updateBanner() {
    const b = $("banner");
    b.textContent = "";
    const msgs = [];
    if (sharedView) msgs.push({ text: "You're viewing a shared card.", btn: ["Make this mine", forkShared] });
    if (card && card.short > 0) {
      // Counted in goal squares, excluding any free space — matching what the sidebar's
      // "N squares to fill" reports, so the two never disagree.
      const need = card.need || 0;
      msgs.push({
        text: "Only " + (need - card.short) + " of " + need + " squares could be filled with your current settings.",
        btn: card.cfg.size > 3 ? ["Use " + (card.cfg.size - 1) + "×" + (card.cfg.size - 1), () => { cfg.size = card.cfg.size - 1; $("gridSize").value = cfg.size; syncFreeSpace(); saveSettings(); generate(newToken()); }] : null,
      });
    }
    if (card && card.builtFromDefaults) {
      msgs.push({ text: "Built from that seed using the default pools and filters, so it matches the original exactly.", btn: null });
    }
    if (card && card.pastedFpMismatch) {
      msgs.push({ text: "That seed was made with different settings, so your card may not match theirs.", btn: null });
    }
    b.classList.toggle("hidden", !msgs.length);
    for (const m of msgs) {
      const span = document.createElement("span");
      span.textContent = m.text;
      b.appendChild(span);
      if (m.btn) {
        const btn = document.createElement("button");
        btn.className = "btn tiny";
        btn.textContent = m.btn[0];
        btn.addEventListener("click", m.btn[1]);
        b.appendChild(btn);
      }
    }
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  function currentFilters() {
    const inc = new Set();
    document.querySelectorAll("#monsterTree input.mon:checked").forEach(cb => inc.add(cb.dataset.name.toLowerCase()));
    const weapons = [];
    document.querySelectorAll("#weaponList input:checked").forEach(cb => weapons.push(cb.dataset.name));
    const styles = [];
    document.querySelectorAll("#styleList input:checked").forEach(cb => styles.push(cb.dataset.name));
    const biases = [];
    document.querySelectorAll("#biasList input:checked").forEach(cb => biases.push(cb.dataset.name));
    return {
      large: $("f_large").checked,
      hyper: $("f_hyper").checked, capture: $("f_capture").checked,
      egg: $("f_egg").checked, gathering: $("f_gathering").checked,
      small: $("f_small").checked, multi: $("f_multi").checked,
      oneFaint: $("f_oneFaint").checked, onSite: $("f_onSite").checked,
      pQuests: $("f_prowler").checked, prowler: $("f_prowlerOn").checked,
      ranks: new Set(RANK_FILTERS.filter(([id]) => $(id).checked).map(([, , cat]) => cat)),
      includedMonsters: inc,
      monsterFilterActive: inc.size < DATA.monsters.length,
      weapons, styles, biases,
    };
  }

  // ── Sidebar: pools ─────────────────────────────────────────────────────────
  function buildCatRows() {
    const wrap = $("catList");
    wrap.textContent = "";
    for (const c of CATS) {
      const row = document.createElement("div");
      row.className = "cat-row";

      const label = document.createElement("label");
      label.className = "chk";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = (cfg.cats[c.id] | 0) > 0;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(c.label));

      const num = document.createElement("input");
      num.type = "number"; num.className = "num";
      num.min = "1"; num.max = "9";
      num.value = cfg.cats[c.id] || 1;
      num.title = "Weight — how often this pool is drawn";
      num.disabled = !cb.checked;

      const count = document.createElement("span");
      count.className = "cat-count";
      count.id = "count_" + c.id;

      cb.addEventListener("change", () => {
        num.disabled = !cb.checked;
        cfg.cats[c.id] = cb.checked ? (parseInt(num.value, 10) || 1) : 0;
        saveSettings(); refreshCounts();
      });
      num.addEventListener("change", () => {
        const v = Math.min(9, Math.max(1, parseInt(num.value, 10) || 1));
        num.value = v;
        if (cb.checked) cfg.cats[c.id] = v;
        saveSettings(); refreshCounts();
      });

      row.appendChild(label); row.appendChild(num); row.appendChild(count);
      wrap.appendChild(row);
    }
  }

  // Recomputes how many distinct goals each pool can currently supply, and blocks grid
  // sizes that can't be filled — catching a too-small pool before a card is generated
  // rather than after.
  function refreshCounts() {
    const f = currentFilters();
    const pool = buildQuestPool(f);
    let total = 0;
    for (const c of CATS) {
      const n = (cfg.cats[c.id] | 0) > 0 ? c.items(pool, f, customPool).length : 0;
      total += n;
      const el = $("count_" + c.id);
      if (el) el.textContent = (cfg.cats[c.id] | 0) > 0 ? String(n) : "off";
    }
    const sizeSel = $("gridSize");
    for (const opt of sizeSel.options) {
      const s = +opt.value;
      const need = s * s - (effFree({ free: cfg.free, size: s }) ? 1 : 0);
      const short = total < need;
      // Never disable the current selection: when nothing can be filled every size is
      // short, and locking the whole control would leave no way back out of it.
      opt.disabled = short && s !== cfg.size;
      opt.title = short ? "Not enough goals — enable more pools or loosen your filters" : "";
    }
    const need = cfg.size * cfg.size - (effFree(cfg) ? 1 : 0);
    $("poolStatus").textContent = total + " goals available · " + need + " squares to fill" +
      (total < need ? " — not enough" : "");
    $("generateBtn").disabled = total === 0;
  }

  // ── Sidebar: custom pool ───────────────────────────────────────────────────
  function renderPool() {
    const wrap = $("cpList");
    wrap.textContent = "";
    if (!customPool.length) {
      const p = document.createElement("p");
      p.className = "hint"; p.style.margin = "0";
      p.textContent = "Nothing here yet.";
      wrap.appendChild(p);
      return;
    }
    customPool.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "cp-tag";

      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = entry.checked;
      cb.title = "Include in the draw";

      const txt = document.createElement("input");
      txt.type = "text"; txt.className = "cp-edit-text";
      txt.value = entry.text; txt.maxLength = MAX_CELL_TEXT;
      if (!entry.checked) txt.classList.add("off");

      const num = document.createElement("input");
      num.type = "number"; num.className = "num";
      num.min = "1"; num.max = "9"; num.value = entry.weight;
      num.title = "Weight — how strongly this entry is favoured";

      const del = document.createElement("button");
      del.type = "button"; del.className = "cp-del";
      del.textContent = "×";
      del.title = "Remove"; del.setAttribute("aria-label", "Remove");

      cb.addEventListener("change", () => {
        customPool[i].checked = cb.checked;
        txt.classList.toggle("off", !cb.checked);
        savePool(); refreshCounts();
      });
      txt.addEventListener("change", () => {
        const v = txt.value.trim();
        if (v) { customPool[i].text = v; savePool(); refreshCounts(); }
        else txt.value = customPool[i].text;
      });
      num.addEventListener("change", () => {
        const v = Math.min(9, Math.max(1, parseInt(num.value, 10) || 1));
        num.value = v; customPool[i].weight = v; savePool();
      });
      del.addEventListener("click", () => {
        customPool.splice(i, 1); renderPool(); savePool(); refreshCounts();
      });

      row.appendChild(cb); row.appendChild(txt); row.appendChild(num); row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function addPoolEntry() {
    const text = $("cpText").value.trim().slice(0, MAX_CELL_TEXT);
    if (!text) return;
    const weight = Math.min(9, Math.max(1, parseInt($("cpWeight").value, 10) || 5));
    customPool.push({ text, weight, checked: true });
    $("cpText").value = "";
    renderPool(); savePool(); refreshCounts();
  }

  // ── Sidebar: monsters / weapons / styles ───────────────────────────────────
  function buildMonsterTree() {
    const wrap = $("monsterTree");
    wrap.textContent = "";
    const bySpecies = new Map();
    for (const m of DATA.monsters) {
      if (!bySpecies.has(m.Species)) bySpecies.set(m.Species, []);
      bySpecies.get(m.Species).push(m.MonsterName);
    }
    for (const species of [...bySpecies.keys()].sort()) {
      const sec = document.createElement("div");
      sec.className = "species";

      const head = document.createElement("div");
      head.style.display = "flex";
      head.style.alignItems = "center";

      const twist = document.createElement("span");
      twist.className = "twist";
      twist.textContent = "▸";
      twist.addEventListener("click", () => {
        sec.classList.toggle("open");
        twist.textContent = sec.classList.contains("open") ? "▾" : "▸";
      });

      const label = document.createElement("label");
      label.className = "chk";
      const sp = document.createElement("input");
      sp.type = "checkbox"; sp.checked = true; sp.className = "sp";
      sp.dataset.species = species;
      label.appendChild(sp);
      label.appendChild(document.createTextNode(species));

      head.appendChild(twist); head.appendChild(label);
      sec.appendChild(head);

      const kids = document.createElement("div");
      kids.className = "children";
      for (const name of bySpecies.get(species).slice().sort()) {
        const l = document.createElement("label");
        l.className = "chk";
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = true; cb.className = "mon";
        cb.dataset.name = name; cb.dataset.species = species;
        const img = document.createElement("img");
        img.className = "wicon"; img.alt = ""; img.src = monsterIcon(name);
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };
        cb.addEventListener("change", () => { refreshSpeciesBoxes(); onFilterChange(); });
        l.appendChild(cb); l.appendChild(img);
        l.appendChild(document.createTextNode(name));
        kids.appendChild(l);
      }
      sp.addEventListener("change", () => {
        kids.querySelectorAll("input.mon").forEach(cb => { cb.checked = sp.checked; });
        refreshSpeciesBoxes(); onFilterChange();
      });
      sec.appendChild(kids);
      wrap.appendChild(sec);
    }
  }

  function refreshSpeciesBoxes() {
    document.querySelectorAll("#monsterTree input.sp").forEach(sp => {
      const kids = [...document.querySelectorAll('#monsterTree input.mon[data-species="' + CSS.escape(sp.dataset.species) + '"]')];
      const on = kids.filter(k => k.checked).length;
      sp.checked = on === kids.length;
      sp.indeterminate = on > 0 && on < kids.length;
    });
  }

  function buildChecklist(hostId, names, iconFn) {
    const wrap = $(hostId);
    wrap.textContent = "";
    for (const name of names) {
      const l = document.createElement("label");
      l.className = "chk";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.dataset.name = name;
      cb.addEventListener("change", onFilterChange);
      l.appendChild(cb);
      if (iconFn) {
        const img = document.createElement("img");
        img.className = "wicon"; img.alt = ""; img.src = iconFn(name);
        img.onerror = () => { img.onerror = null; img.classList.add("hidden"); };
        l.appendChild(img);
      }
      l.appendChild(document.createTextNode(name));
      wrap.appendChild(l);
    }
  }


  // ── Persistence ────────────────────────────────────────────────────────────
  function uiFilterState() {
    const off = (sel) => {
      const out = [];
      document.querySelectorAll(sel).forEach(cb => { if (!cb.checked) out.push(cb.dataset.name); });
      return out;
    };
    return {
      flags: ["f_low","f_high","f_g","f_sp","f_event","f_arena",
              "f_large","f_hyper","f_capture","f_egg","f_gathering","f_small","f_multi","f_oneFaint","f_onSite",
              "f_prowlerOn","f_prowler"]
        .reduce((a, id) => (a[id] = $(id).checked, a), {}),
      offMonsters: off("#monsterTree input.mon"),
      offWeapons: off("#weaponList input"),
      offStyles: off("#styleList input"),
      offBiases: off("#biasList input"),
    };
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, cfg, showReroll, previewMin, filters: uiFilterState() })); } catch (e) {}
  }
  function savePool() {
    try { localStorage.setItem(POOL_KEY, JSON.stringify({ v: 1, entries: customPool })); } catch (e) {}
  }
  function saveCard() {
    if (!card || sharedView) return;
    try {
      localStorage.setItem(CARD_KEY, JSON.stringify(Object.assign({}, card, { v: 1, marked: [...card.marked] })));
    } catch (e) {}
  }

  function loadSettings() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (e) {}
    if (!d) return;
    showReroll = d.showReroll !== false;
    $("showReroll").checked = showReroll;
    if (Number.isInteger(d.previewMin)) previewMin = d.previewMin;
    $("previewMin").value = String(previewMin);
    if (d.cfg && typeof d.cfg === "object") {
      cfg.size = SIZES.includes(d.cfg.size) ? d.cfg.size : 5;
      cfg.free = d.cfg.free !== false;
      for (const c of CATS) {
        const v = d.cfg.cats ? (d.cfg.cats[c.id] | 0) : DEFAULT_CFG.cats[c.id];
        cfg.cats[c.id] = Math.min(9, Math.max(0, v));
      }
    }
    const f = d.filters;
    if (!f) return;
    if (f.flags) for (const id of Object.keys(f.flags)) if ($(id)) $(id).checked = !!f.flags[id];
    const applyOff = (sel, names) => {
      const offs = new Set(names || []);
      document.querySelectorAll(sel).forEach(cb => { cb.checked = !offs.has(cb.dataset.name); });
    };
    applyOff("#monsterTree input.mon", f.offMonsters);
    applyOff("#weaponList input", f.offWeapons);
    applyOff("#styleList input", f.offStyles);
    applyOff("#biasList input", f.offBiases);
    refreshSpeciesBoxes();
  }

  function loadPool() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(POOL_KEY) || "null"); } catch (e) {}
    if (d && Array.isArray(d.entries)) customPool = d.entries.map(sanitizeEntry).filter(Boolean);
  }

  function sanitizeEntry(e) {
    if (!e || typeof e.text !== "string") return null;
    const text = e.text.trim().slice(0, MAX_CELL_TEXT);
    if (!text) return null;
    return { text, weight: Math.min(9, Math.max(1, parseInt(e.weight, 10) || 5)), checked: e.checked !== false };
  }

  function loadCard() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CARD_KEY) || "null"); } catch (e) {}
    if (!d || !Array.isArray(d.cells) || !d.cfg) return false;
    card = d;
    card.marked = new Set(Array.isArray(d.marked) ? d.marked : []);
    card.short = d.short | 0;
    card.need = d.need | 0;
    // Rerolls consumed goals from bags that no longer exist after a reload; rebuilding
    // them here would risk handing back a goal already on the card, so rerolling simply
    // needs a fresh draw. Repopulate from the current pool, minus what's already used.
    usedKeys = new Set(card.cells.map(c => c.key));
    rebuildBags();
    return true;
  }

  function rebuildBags() {
    const f = currentFilters();
    const pool = buildQuestPool(f);
    const rng = makeRng(card ? card.seed + ":bags" : "bags");
    bags = {};
    for (const c of CATS) {
      if ((card ? card.cfg.cats[c.id] : cfg.cats[c.id]) | 0) {
        // Rerolls always draw from the user's own custom pool. A reroll already voids the
        // seed (the card is flagged "edited"), so there's nothing to keep in sync here.
        bags[c.id] = weightedShuffle(c.items(pool, f, customPool).filter(g => !usedKeys.has(g.key)), rng);
      }
    }
  }

  // ── Sharing ────────────────────────────────────────────────────────────────
  // The Twitch button is NOT a login — this app has no accounts. It opens a modal of
  // ready-to-paste bot URLs. !bingo needs nothing at all, so its command is always shown;
  // publishing is an explicit action because it's the only part that hits the network.
  // ── Twitch login ───────────────────────────────────────────────────────────
  // Purely so the channel name can be filled in correctly. Nothing is authorised by it:
  // the bot endpoints are keyed on the channel and take no credentials, because a chat bot
  // has none to give. It exists because a command containing $(channel) reads like a
  // placeholder — people edit it, or wonder whether they should — and a command that has
  // to be understood before it works is a command that gets set up wrong.
  const TOKEN_KEY = "mhgu-bingo-token";

  // The session token is a self-contained signed {login,exp} string (see
  // worker/src/session.js). Decoding the payload here is only ever for display — nothing
  // trusts it, and there's no server-side decision riding on it in this app at all.
  function decodeTokenLogin(token) {
    try {
      let b64 = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const payload = JSON.parse(atob(b64));
      if (payload.exp && payload.exp > Date.now()) return payload.login;
    } catch (e) {}
    return null;
  }

  function captureTokenFromHash() {
    const m = location.hash.match(/(?:^#|&)mhgu_bot_token=([^&]+)/);
    if (!m) return;
    try { localStorage.setItem(TOKEN_KEY, decodeURIComponent(m[1])); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
  }

  function loggedInChannel() {
    let token = "";
    try { token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) {}
    return token ? decodeTokenLogin(token) : null;
  }

  const cleanChannel = (s) => String(s || "").trim().toLowerCase().replace(/^#/, "");
  const channelUrl = (ch) => location.origin + location.pathname + "?channel=" + ch;

  // A logged-in channel wins over the typed one; the text box is the fallback for anyone
  // who'd rather not log in.
  function activeChannel() {
    return loggedInChannel() || cleanChannel($("twitchChannel").value);
  }

  function renderTwitchCommands() {
    const login = loggedInChannel();
    $("twitchLoggedOut").classList.toggle("hidden", !!login);
    $("twitchLoggedIn").classList.toggle("hidden", !login);
    if (login) $("twitchLoginName").textContent = login;

    const ch = activeChannel();

    $("bingoCmdRow").textContent = "";
    addCommandPair($("bingoCmdRow"), BOT_API_ORIGIN + "/bingo");

    // Once the channel is known, both forms are complete URLs with nothing left to
    // substitute — no $(channel), no placeholder, nothing for anyone to misread as an
    // instruction to edit.
    for (const [host, path] of [["currentCardRow", "/bingo-link"], ["setCardRow", "/bingo-set"]]) {
      const el = $(host);
      el.textContent = "";
      if (!ch) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "Log in above (or type your channel) and the command appears here, ready to paste.";
        el.appendChild(p);
        continue;
      }
      // The page chat lands on is just the channel name in a URL — it doesn't depend on
      // anything having been published, so there's no reason to withhold it until then.
      if (host === "currentCardRow") {
        const label = document.createElement("p");
        label.className = "cmd-desc";
        label.textContent = "Where chat lands";
        el.appendChild(label);
        addCopyRow(el, "Link", channelUrl(ch));
      }
      addCommandPair(el, BOT_API_ORIGIN + path + "?channel=" + ch);
    }
    resetPublishArea(ch ? "Send this card to #" + ch : "Log in or enter your channel first", !ch);
  }

  function openTwitchModal() {
    let ch = "";
    try { ch = localStorage.getItem(CHANNEL_KEY) || ""; } catch (e) {}
    $("twitchChannel").value = ch;
    renderTwitchCommands();
    $("twitchModal").classList.remove("hidden");
  }

  function resetPublishArea(label, disabled) {
    const area = $("publishArea");
    area.textContent = "";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = label || "Send this card to your channel";
    btn.disabled = !!disabled;
    btn.addEventListener("click", publishCard);
    area.appendChild(btn);
  }

  // Pushes the card on screen to the channel, so !currentcard shows it. Keyed on the
  // channel name only — there is no per-card id or minted key anywhere in this flow.
  async function publishCard() {
    const ch = activeChannel();
    if (!card || !ch) return;
    const body = $("publishArea");
    body.textContent = "";
    const p = document.createElement("p");
    p.textContent = "Sending…";
    body.appendChild(p);

    const payload = {
      seed: card.seed,
      size: card.cfg.size,
      freeIdx: card.freeIdx,
      cells: card.cells.map(c => ({ cat: c.cat, key: c.key, text: c.text, sub: c.sub || "", icon: c.icon || "", tint: c.tint || "" })),
    };
    try {
      const res = await fetch(BOT_API_ORIGIN + "/bingo-channel?channel=" + encodeURIComponent(ch), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // No link repeated here — it's shown under !currentcard above and never changes.
      body.textContent = "";
      const ok = document.createElement("p");
      ok.className = "hint";
      ok.textContent = "Sent — !currentcard now shows this board.";
      body.appendChild(ok);
      const again = document.createElement("button");
      again.className = "btn tiny";
      again.textContent = "Send again after changes";
      again.addEventListener("click", publishCard);
      body.appendChild(again);
    } catch (e) {
      body.textContent = "";
      const err = document.createElement("p");
      err.className = "hint";
      err.textContent = "Couldn't reach the bot API, so the channel's card is unchanged. The commands above are unaffected — they don't depend on this app.";
      body.appendChild(err);
      const retry = document.createElement("button");
      retry.className = "btn";
      retry.textContent = "Try again";
      retry.addEventListener("click", publishCard);
      body.appendChild(retry);
    }
  }

  // Nightbot pastes the whole $(urlfetch ...) line in as the command; Moobot and most
  // others need the bare URL in their own fetch tag. Listing only the Nightbot form sends
  // Moobot users down a dead end, so show both — same as the Quest Randomizer's bot modal.
  // `nightbotSuffix`/`plainSuffix` differ only where a bot can fill the channel in for
  // itself: Nightbot gets $(channel), the plain URL gets the literal name.
  function addCommandPair(host, url) {
    const label = (text) => {
      const p = document.createElement("p");
      p.className = "cmd-desc";
      p.textContent = text;
      host.appendChild(p);
    };
    label("Nightbot");
    addCopyRow(host, "Nightbot command", "$(urlfetch " + url + ")");
    label("Moobot / plain URL");
    addCopyRow(host, "plain URL", url);
  }

  function addCopyRow(host, label, value) {
    const row = document.createElement("div");
    row.className = "share-row";
    const code = document.createElement("code");
    code.textContent = value;
    const btn = document.createElement("button");
    btn.className = "btn tiny";
    btn.textContent = "Copy";
    btn.title = "Copy " + label;
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(value).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      });
    });
    row.appendChild(code); row.appendChild(btn);
    host.appendChild(row);
  }

  // Two ways to arrive at someone else's board: ?c=CODE for a one-off card rolled by
  // !bingo, or ?channel=NAME for whatever a stream is currently playing.
  async function loadSharedCard(code, channel) {
    try {
      const res = await fetch(channel
        ? BOT_API_ORIGIN + "/bingo-channel?channel=" + encodeURIComponent(channel)
        : BOT_API_ORIGIN + "/bingo/" + encodeURIComponent(code));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      if (!d || !Array.isArray(d.cells)) throw new Error("bad payload");
      sharedView = true;
      card = {
        seed: d.seed || "", token: "", fp: "",
        cfg: { size: d.size, free: d.freeIdx >= 0, cats: {} },
        modified: false, freeIdx: d.freeIdx,
        cells: d.cells, marked: new Set(d.freeIdx >= 0 ? [d.freeIdx] : []),
        created: Date.now(), short: 0,
      };
      bags = {}; usedKeys = new Set(d.cells.map(c => c.key));
      renderCard();
      return true;
    } catch (e) {
      return false;
    }
  }

  function forkShared() {
    sharedView = false;
    card.modified = true;
    renderCard();
    saveCard();
    history.replaceState(null, "", location.pathname);
  }

  // ── Theme ──────────────────────────────────────────────────────────────────
  const hexRgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
            : max === g ? ((b - r) / d + 2) / 6
            :             ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
                    : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  // Only lightness is shifted, so every derived shade keeps the chosen colour's hue.
  const darken  = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const css = (rgb) => "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";

  // WCAG relative luminance / contrast, used to pick a bingo highlight that stays legible
  // on every theme rather than only on the dark ones.
  const relLum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const x = relLum(a), y = relLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const mix = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));

  // The bingo highlight.
  //
  // Every other colour on the page is derived from the theme by shifting lightness only,
  // so a brighter shade of the same hue reads as "slightly lighter" rather than "you won".
  // Two things fix that. The hue is rotated a full 180°, putting it as far from the
  // theme's family as the colour wheel allows — including on the near-greyscale themes,
  // which have almost no chroma of their own to compete with.
  //
  // A completed line FILLS its squares with this colour rather than just outlining them,
  // which is what makes the lightness solvable. Trying to tune a 2px border to contrast
  // with both the gap behind the grid and the marked-square fill pulls in two directions
  // at once, and on the amber themes it has no good answer at all — an earlier attempt
  // bottomed out at 1.24:1. Filling the square leaves exactly one contrast requirement:
  // the cell's white text has to stay readable on it.
  //
  // HSL lightness is not perceived brightness (green carries 72% of relative luminance,
  // blue only 7%), so a fixed lightness would be readable at one hue and not another.
  // Instead, walk down from a vivid lightness until white text clears WCAG AA. Every hue
  // reaches that eventually, so this always terminates with the lightest colour that is
  // still legible.
  const WHITE = [255, 255, 255];
  function winColor(c) {
    const hue = (rgbToHsl(c)[0] + 0.5) % 1;
    for (let l = 0.60; l >= 0.20; l -= 0.01) {
      const cand = hslToRgb([hue, 0.95, l]);
      if (contrast(cand, WHITE) >= 4.5) return cand;
    }
    return hslToRgb([hue, 0.95, 0.20]);
  }

  // New Card, the one control the page wants you to reach for. It used to be --bg1, a
  // near-black shade of the theme sitting on the near-black --bg2 sidebar, so it read as
  // just another panel.
  //
  // Same lightness search as winColor and for the same reason — HSL lightness isn't
  // perceived brightness, so one fixed value would be legible at some hues and not others —
  // but at the theme's OWN hue rather than its opposite. That keeps it in the family and
  // leaves the 180°-rotated --win as the only thing on the page wearing that colour, so a
  // bright button never reads as a bingo.
  //
  // Saturation is taken from the theme untouched. An earlier version floored it, which put
  // a blue button on K. Daora, Valstrax and Forbidden — the three neutral themes have
  // barely any chroma, so a floor doesn't make them vivid, it invents a hue out of
  // rounding noise. Lightness alone is enough to separate the button there: the search
  // still lands it ~4.5:1 clear of the sidebar, just in grey.
  //
  // Lightening from the theme colour instead was the obvious alternative and fails outright
  // on the pale themes — lighten(#aeb5c1, .40) is near-white, and the button's text is white.
  function ctaColor(c) {
    const [hue, sat] = rgbToHsl(c);
    for (let l = 0.62; l >= 0.22; l -= 0.01) {
      const cand = hslToRgb([hue, sat, l]);
      if (contrast(cand, WHITE) >= 4.5) return cand;
    }
    return hslToRgb([hue, sat, 0.22]);
  }

  // Every theme in COLORS is a dark one, so there's no light branch to switch on.
  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    const well = darken(c, .40), accent = darken(c, .70);
    r.setProperty("--bg",           css(darken(c, .70)));
    r.setProperty("--bg1",          css(darken(c, .80)));
    r.setProperty("--bg2",          css(darken(c, .95)));
    // The card well sits behind the squares, so it has to read as darker than they do —
    // otherwise the grid dissolves into the background.
    r.setProperty("--well",         css(well));
    r.setProperty("--accent",       css(accent));
    r.setProperty("--accent-hover", css(lighten(c, .40)));
    r.setProperty("--win",          css(winColor(c)));
    r.setProperty("--cta",          css(ctaColor(c)));
    r.setProperty("--text",     "#ffffff");
    r.setProperty("--text-dim", "#fffffff5");
    r.setProperty("--line",     "rgba(11,8,8,0.12)");
    r.setProperty("--card",     "rgba(255,255,255,0.05)");
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const icon = document.querySelector(".title-icon");
    if (icon) {
      const name = COLORS_HEX[hex.toUpperCase()];
      icon.src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
    }
    // Repaint the card on a theme change. Chromium does not reliably re-resolve a
    // var()-based background on cells that have already been painted when the custom
    // property changes on :root — the cell reads the new --win, but keeps rendering the
    // old colour indefinitely, even after a forced reflow. Rebuilding the squares is
    // cheap (25 nodes) and is what actually repaints a completed line's fill.
    if (card) renderCard();
  }

  // Built from CATEGORY_COLORS / POOL_COLORS / WEAPON_COLORS rather than repeated in the
  // markup, so the Help legend can never drift from what the cards actually draw.
  function buildColourLegend() {
    const row = (host, colour, label) => {
      const d = document.createElement("div");
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.borderColor = colour;
      d.appendChild(sw);
      d.appendChild(document.createTextNode(label));
      host.appendChild(d);
    };
    const cats = $("legendCats");
    cats.textContent = "";
    for (const [colour, label] of [
      [CATEGORY_COLORS.Low, "Low Rank"], [CATEGORY_COLORS.High, "High Rank"],
      [CATEGORY_COLORS.G, "G Rank"], [CATEGORY_COLORS.SP, "Special Permits"],
      [CATEGORY_COLORS.Event, "Events"], [CATEGORY_COLORS.Arena, "Arena"],
      [POOL_COLORS.objective, "Objectives"], [POOL_COLORS.custom, "Your own entries"],
    ]) row(cats, colour, label);

    const strip = $("legendWeapons");
    strip.textContent = "";
    for (const w of WEAPONS.concat("Prowler")) {
      const sw = document.createElement("span");
      sw.className = "sw";
      sw.style.borderColor = WEAPON_COLORS[w];
      sw.title = w;
      strip.appendChild(sw);
    }
  }

  function buildSwatches() {
    const wrap = $("swatches");
    wrap.textContent = "";
    for (const [name, hex] of COLORS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "swatch";
      b.dataset.hex = hex; b.style.background = hex; b.title = name;
      const img = document.createElement("img");
      img.className = "swatch-icon"; img.alt = "";
      img.src = monsterIcon(COLORS_ICON[name] || name);
      img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };
      const span = document.createElement("span");
      span.textContent = name;
      b.appendChild(img); b.appendChild(span);
      b.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(b);
    }
  }

  // ── Enlarged tile preview ──────────────────────────────────────────────────
  // Hovering a square shows a bigger copy of it. At 10x10 the text is around 5px, so the
  // card becomes unreadable long before it becomes unplayable — this is what makes the
  // larger grids usable rather than just possible.
  // Smallest grid the preview kicks in at; 0 disables it. A display preference, so it
  // stays off cfg for the same reason showReroll does.
  let previewMin = 5;

  function hidePreview() { $("tilePreview").classList.remove("on"); }

  function showPreview(el) {
    if (!previewMin || !card || card.cfg.size < previewMin) return hidePreview();

    const r = el.getBoundingClientRect();
    const p = $("tilePreview");
    p.textContent = "";
    const clone = el.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll(".cell-reroll").forEach(b => b.remove());
    p.appendChild(clone);
    p.classList.add("on");

    // Prefer the right of the square, flip to the left when it would run off, and clamp
    // vertically so a square near the top or bottom edge still shows a full panel.
    const pw = p.offsetWidth, ph = p.offsetHeight, M = 10;
    let x = r.right + M;
    if (x + pw > innerWidth - M) x = r.left - pw - M;
    if (x < M) x = M;
    const y = Math.max(M, Math.min(r.top + r.height / 2 - ph / 2, innerHeight - ph - M));
    p.style.left = Math.round(x) + "px";
    p.style.top = Math.round(y) + "px";
  }

  // ── Confirmation ───────────────────────────────────────────────────────────
  // Only asked when there is something to lose. An unmarked card costs nothing to
  // regenerate — and its seed is sitting in the title bar anyway — so confirming that
  // would be pure friction. Marks are the part that can't be recovered.
  let confirmFn = null;
  function markedCount() {
    if (!card) return 0;
    return card.marked.size - (card.freeIdx >= 0 && card.marked.has(card.freeIdx) ? 1 : 0);
  }
  function guard(title, okLabel, fn) {
    const n = markedCount();
    if (!n) return fn();
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = "You've marked " + n + (n === 1 ? " square" : " squares")
      + " on this card. That progress is lost — the squares themselves you can always get back from the seed.";
    $("confirmOk").textContent = okLabel;
    confirmFn = fn;
    $("confirmModal").classList.remove("hidden");
  }
  function closeConfirm() {
    $("confirmModal").classList.add("hidden");
    confirmFn = null;
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  function wireModal(modalId, openId, closeId) {
    if (openId) $(openId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    if (closeId) $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", (e) => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  }

  // Reflects the preference into the checkbox without writing back to it, so an even
  // grid greys the box out rather than clearing what the user asked for.
  function syncFreeSpace() {
    const odd = cfg.size % 2 === 1;
    $("freeSpace").disabled = !odd;
    $("freeSpace").checked = odd && !!cfg.free;
  }

  // Prowler-only quests can't be taken by a hunter, so they're meaningless unless Prowler
  // itself is allowed. Mirrors the Quest Randomizer's "Prowler?" / "Prowler Quests?" pair.
  function syncProwlerQuests() {
    const on = $("f_prowlerOn").checked;
    $("f_prowler").disabled = !on;
    if (!on) $("f_prowler").checked = false;
  }

  function onFilterChange() {
    syncProwlerQuests();
    saveSettings();
    refreshCounts();
  }

  function doReset() {
    cfg = JSON.parse(JSON.stringify(DEFAULT_CFG));
    showReroll = true;
    $("showReroll").checked = true;
    previewMin = 5;
    $("previewMin").value = "5";
    $("gridSize").value = String(cfg.size);
    for (const [id, on] of [["f_low", true], ["f_high", true], ["f_g", true], ["f_sp", true], ["f_event", true], ["f_arena", true],
                            ["f_large", true], ["f_hyper", true], ["f_capture", true],
                            ["f_egg", true], ["f_gathering", true], ["f_small", true], ["f_multi", true],
                            ["f_oneFaint", true], ["f_onSite", true],
                            ["f_prowlerOn", false], ["f_prowler", false]]) $(id).checked = on;
    document.querySelectorAll("#monsterTree input, #weaponList input, #styleList input, #biasList input").forEach(cb => { cb.checked = true; cb.indeterminate = false; });
    syncProwlerQuests();
    buildCatRows();
    syncFreeSpace();
    saveSettings();
    refreshCounts();
  }

  function boot() {
    // Must run before anything reads the URL, so the token is stashed and the fragment
    // scrubbed before the ?c= / ?channel= routing below looks at location.
    captureTokenFromHash();

    // Panels behave as an accordion, like the Quest Randomizer's sidebar.
    document.querySelectorAll(".panel-head").forEach(h => {
      h.addEventListener("click", () => {
        const panel = h.parentElement;
        const open = panel.dataset.open === "true";
        document.querySelectorAll(".panel").forEach(p => { p.dataset.open = "false"; });
        panel.dataset.open = open ? "false" : "true";
      });
    });

    buildCatRows();
    buildMonsterTree();
    buildChecklist("weaponList", WEAPONS, weaponIcon);
    buildChecklist("styleList", STYLES, null);
    buildChecklist("biasList", BIAS_NAMES(), (n) => prowlerIcon(BIAS_FILE[n]));
    buildSwatches();
    buildColourLegend();
    loadPool();
    renderPool();
    loadSettings();
    syncProwlerQuests();
    $("gridSize").value = String(cfg.size);
    syncFreeSpace();

    let theme = "#1E2025";
    try { theme = localStorage.getItem(THEME_KEY) || theme; } catch (e) {}
    applyTheme(theme);

    // Config
    $("gridSize").addEventListener("change", () => {
      cfg.size = parseInt($("gridSize").value, 10) || 5;
      syncFreeSpace(); saveSettings(); refreshCounts();
    });
    $("freeSpace").addEventListener("change", () => {
      cfg.free = $("freeSpace").checked; saveSettings(); refreshCounts();
    });
    document.querySelectorAll("#f_low,#f_high,#f_g,#f_sp,#f_event,#f_arena,"
      + "#f_large,#f_hyper,#f_capture,#f_egg,#f_gathering,#f_small,#f_multi,#f_oneFaint,#f_onSite,"
      + "#f_prowlerOn,#f_prowler")
      .forEach(cb => cb.addEventListener("change", onFilterChange));

    $("monAll").addEventListener("click", () => { document.querySelectorAll("#monsterTree input").forEach(cb => { cb.checked = true; cb.indeterminate = false; }); onFilterChange(); });
    $("monNone").addEventListener("click", () => { document.querySelectorAll("#monsterTree input").forEach(cb => { cb.checked = false; cb.indeterminate = false; }); onFilterChange(); });
    $("wepAll").addEventListener("click", () => { document.querySelectorAll("#weaponList input").forEach(cb => { cb.checked = true; }); onFilterChange(); });
    $("wepNone").addEventListener("click", () => { document.querySelectorAll("#weaponList input").forEach(cb => { cb.checked = false; }); onFilterChange(); });

    // Custom pool
    $("cpAdd").addEventListener("click", addPoolEntry);
    $("cpText").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addPoolEntry(); } });
    $("cpExport").addEventListener("click", () => {
      $("poolModalTitle").textContent = "Export Custom Pool";
      $("poolModalHint").textContent = "Copy this and keep it somewhere, or send it to someone else.";
      $("poolModalText").value = JSON.stringify(customPool, null, 2);
      $("poolModalAction").textContent = "Copy";
      $("poolModal").classList.remove("hidden");
    });
    $("cpImport").addEventListener("click", () => {
      $("poolModalTitle").textContent = "Import Custom Pool";
      $("poolModalHint").textContent = "Paste an exported pool here. This replaces your current entries.";
      $("poolModalText").value = "";
      $("poolModalAction").textContent = "Import";
      $("poolModal").classList.remove("hidden");
    });
    $("poolModalAction").addEventListener("click", () => {
      const btn = $("poolModalAction");
      if (btn.textContent === "Copy") {
        navigator.clipboard.writeText($("poolModalText").value).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        });
        return;
      }
      let parsed = null;
      try { parsed = JSON.parse($("poolModalText").value); } catch (e) {}
      const entries = Array.isArray(parsed) ? parsed.map(sanitizeEntry).filter(Boolean) : null;
      if (!entries || !entries.length) {
        btn.textContent = "Not valid";
        setTimeout(() => { btn.textContent = "Import"; }, 2000);
        return;
      }
      customPool = entries;
      renderPool(); savePool(); refreshCounts();
      $("poolModal").classList.add("hidden");
    });

    // Cards
    const newCard = () => guard("Start a new card?", "New Card", () => generate(newToken()));
    $("generateBtn").addEventListener("click", newCard);
    $("newCardBtn").addEventListener("click", newCard);
    $("resetBtn").addEventListener("click", doReset);
    const loadSeed = () => guard("Load this seed?", "Load Seed", applySeed);
    $("seedApply").addEventListener("click", loadSeed);
    $("seedInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); loadSeed(); } });

    $("confirmOk").addEventListener("click", () => {
      const fn = confirmFn;
      closeConfirm();
      if (fn) fn();
    });
    $("confirmCancel").addEventListener("click", closeConfirm);
    $("confirmModal").addEventListener("click", (e) => { if (e.target.id === "confirmModal") closeConfirm(); });

    // Delegated, so it survives renderCard() replacing every square.
    const cardEl = $("bingoCard");
    cardEl.addEventListener("mouseover", (e) => {
      const cell = e.target.closest(".cell");
      if (cell && cardEl.contains(cell)) showPreview(cell);
    });
    cardEl.addEventListener("mouseout", (e) => {
      const to = e.relatedTarget;
      if (!to || !cardEl.contains(to)) hidePreview();
    });
    // A card that moves or disappears under a stationary cursor would otherwise leave the
    // panel stranded.
    cardEl.addEventListener("mouseleave", hidePreview);
    window.addEventListener("blur", hidePreview);
    document.querySelector(".card-wrap").addEventListener("scroll", hidePreview);

    $("previewMin").addEventListener("change", () => {
      previewMin = parseInt($("previewMin").value, 10) || 0;
      hidePreview();
      saveSettings();
    });

    $("showReroll").addEventListener("change", () => {
      showReroll = $("showReroll").checked;
      saveSettings();
      if (card) renderCard();
    });

    $("seedCopy").addEventListener("click", () => {
      const btn = $("seedCopy");
      navigator.clipboard.writeText($("seedInput").value).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      });
    });

    $("twitchBtn").addEventListener("click", openTwitchModal);
    $("twitchChannel").addEventListener("input", () => {
      try { localStorage.setItem(CHANNEL_KEY, cleanChannel($("twitchChannel").value)); } catch (e) {}
      renderTwitchCommands();
    });
    // ?return=bingo brings the callback back here with the token in the URL fragment.
    $("twitchLogin").addEventListener("click", () => {
      location.href = BOT_API_ORIGIN + "/auth/login?return=bingo";
    });
    $("twitchLogout").addEventListener("click", () => {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      renderTwitchCommands();
    });

    wireModal("helpModal", "helpBtn", "helpClose");
    wireModal("themeModal", "themeBtn", "themeClose");
    wireModal("linksModal", "linksBtn", "linksClose");
    wireModal("poolModal", null, "poolModalClose");
    wireModal("twitchModal", null, "twitchClose");

    // A shared link wins over whatever card is stored locally.
    const params = new URLSearchParams(location.search);
    const code = params.get("c");
    const channel = params.get("channel");
    refreshCounts();
    if (code || channel) {
      loadSharedCard(code, channel).then(ok => {
        if (!ok) {
          flash($("status"), channel
            ? "That stream hasn't set a bingo card yet."
            : "That shared card couldn't be found.");
          startLocal();
        }
      });
    } else {
      startLocal();
    }
  }

  function startLocal() {
    if (loadCard()) renderCard();
    else generate(newToken());
  }

  // What the fingerprint looks like for an untouched install. A pasted seed carrying this
  // was built from default settings — by the Twitch bot, or by someone who hasn't changed
  // anything — so it can be reproduced exactly by rebuilding under those same defaults.
  let defaultFp = null;
  const defaultFingerprint = () => defaultFp !== null ? defaultFp
    : (defaultFp = b32(hashStr(fingerprint(defaultFilters(), DEFAULT_POOL)), 4));

  function applySeed() {
    const raw = $("seedInput").value;
    if (!raw.trim()) return;
    const d = decodeSeed(raw);
    if (d.cfg) {
      cfg = d.cfg;
      $("gridSize").value = String(cfg.size);
      syncFreeSpace();
      buildCatRows();
      saveSettings();
      refreshCounts();
    }
    const fromDefaults = !!d.fp && d.fp === defaultFingerprint();
    generate(d.token, { cfg: d.cfg || undefined, defaults: fromDefaults });
    card.builtFromDefaults = fromDefaults;
    // Only warn when the card genuinely can't match: the seed was made under settings that
    // are neither the viewer's nor the defaults.
    if (d.fp && !fromDefaults && card.fp !== d.fp) {
      card.pastedFpMismatch = true;
    }
    updateBanner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
