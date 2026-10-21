# DESIGN.md: StockFlow

Direction supplied by the product owner, transcribed. This is the source of
truth for visual decisions; `antislop` is the filter applied on top.

**Reading this as:** an internal warehouse operations tool for supervisors at a
Singapore-based distributor, in a stock-ledger visual language, dial
**ENERGY 2 / RHYTHM 1 / MOTION 1**.

---

## Identity

StockFlow should read like the paper stock register it replaces: ruled columns,
ink on warm paper, figures that line up, stamps for status. Quiet, precise,
accountable. It is a tool you use forty times a day, not a landing page.

- **Personality:** exact, calm, unsentimental.
- **Never:** playful, promotional, dashboard-glow.
- **Test:** a supervisor should trust the number they are looking at without
  wondering whether the interface is decorating it.

## Palette

| Token | Value | Use | Share |
| --- | --- | --- | --- |
| Paper | `#F7F5EF` | page background | large |
| Surface | `#FFFFFF` | panels, table body | large |
| Ink | `#17201C` | primary text, headings | large |
| Muted ink | `#5C6259` | labels, secondary text | small |
| Rule | `#DDD8CB` | borders, table rules | structure |
| Petrol | `#0E4F52` | the single accent: primary action, active nav, focus ring | rare |
| Petrol deep | `#0A3E41` | hover/pressed on petrol | rare |
| Petrol tint | `#E7EFEE` | selected row, accent fill | small |

Status colours are semantic only and always paired with a word, never colour
alone: success `#1F5E3A` on `#E8F2EA`, warning `#8A5A00` on `#FBF0D9`, danger
`#9B2C2C` on `#FBEDED`.

**Why petrol:** it is a working colour (industrial paint, technical ink), it sits
far from the default indigo of every SaaS template, and it stays distinguishable
from the three status colours.

## Typography

- **IBM Plex Sans** for interface text. Drawn for technical documentation:
  narrow enough for dense tables, human enough not to feel like a terminal.
- **IBM Plex Mono** for every SKU, quantity, price and total. Figures in a
  ledger must align in columns; a mono face is the functional choice, not a
  decorative one.
- Scale: 28 / 20 / 15 / 14 / 13 / 12 / 11px. Headings 600, body 400, figures 500.
- Table headers: 11px, uppercase, 0.06em tracking. Purpose: scanning a dense
  register, nothing larger than the data it labels.

## Form and rhythm

- **Radius:** 4px on controls, 6px on panels, 2px on status stamps. No pills.
- **Elevation:** none. Structure comes from 1px rules and background shifts.
  A shadow is used only on a modal, where it marks a real layer change.
- **Density:** 44px control height, 12px cell padding, 1px rules between rows.
- **RHYTHM 1:** the same table anatomy and toolbar on every screen, deliberately.
  Repetition is the product: supervisors learn one row shape and reuse it.
- **MOTION 1:** hover, focus and a 120ms modal entrance. Nothing scrolls in,
  nothing floats.

## Motifs

1. **Mono figures.** Every number sits in Plex Mono and aligns by its decimal.
2. **Ledger rule.** A single 1px rule closes each block; no card shadows.
3. **Square stamp.** Statuses are small, squared, tinted labels: a stamp in a
   register, not a pill badge.

## Accessibility

- Body text at least 4.5:1, large text at least 3:1, verified per pair.
- Every control reachable by Tab, visible `:focus-visible` ring (2px petrol,
  2px offset). Escape closes modals and menus.
- No meaning carried by colour alone: every status carries a word.
- Tap targets at least 44px on touch layouts.

## Layout notes

- One focal point per screen: on the register, the table; in a modal, the
  primary figure (current stock or total).
- Whitespace separates blocks; it is never used to fill.
- The summary band is a single ruled panel with cells, not five floating cards.
  Stock value is the largest cell because money is what a supervisor is asked
  about first.
