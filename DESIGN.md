# Velvet Hold'em Design System (`DESIGN.md`)

Velvet Hold'em follows a **Restrained Private-Club Editorial** visual language inspired by our live table analytics panel (`TableAnalyticsDrawer`) and print financial ledgers. Every interface decision prioritizes spatial clarity, typography, and calm focus over decorative flash.

---

## 1. Core Principles (Restraint Over Decoration)

1. **Zero "AI-Slop" Visual Clutter**:
   - **No** spinning conic-gradient avatar halos, blurry neon glows, or breathing multi-color auras.
   - **No** loud neon-emerald (`#10B981`) or saturated cartoon pill badges over dark obsidian surfaces.
   - **No** nested rounded cards inside cards; separate sections with crisp `1px` hairlines (`border-white/[0.08]`) and generous breathing room.
2. **One Spatial Slot Per Signal**:
   - Never stack multiple floating tags onto a single circular avatar.
   - Never repeat the same signal twice in one component (e.g., if `D / SB / BB` appears on the seat plate corner, never duplicate `SB / BB` onto the avatar).
3. **Single Primary Accent**:
   - Antique brushed brass (`#D4A853`) is the sole primary accent color.
   - At most **one** solid brass primary CTA per toolbar or modal footer. Secondary actions use quiet hairlines (`border-white/[0.12] bg-transparent`); tertiary actions use plain text links.
4. **Viewport-Safe Overlays**:
   - Any tooltip, hover card, or popover triggered inside a modal, drawer, or narrow sidebar must either render inline in the natural layout flow or mount through a viewport-clamped portal (`position: fixed`), never clipped by `overflow-hidden`.

---

## 2. Color Palette & Surface Hierarchy

| Role | Token / Hex | Usage |
| :--- | :--- | :--- |
| **Canvas (Deep Obsidian)** | `#090B0C` | App shell, modal footers, sidebar spines |
| **Elevated Surface** | `#0C0F11` / `#0D1012` | Modals, drawers, seat nameplates |
| **Interactive Surface** | `#121618` / `white/[0.04]` | Hover states, subtle inset strips |
| **Hairline Divider** | `rgba(255, 255, 255, 0.08)` | Section borders, ledger rows, tabular dividers |
| **Primary Ink** | `#F3F1EC` | Headings, player names, key figures |
| **Secondary Ink** | `#9AA5A0` | Metadata, table headers, helper descriptions |
| **Muted Ink** | `#76807B` | Timestamps, keyboard hints, empty states |
| **Primary Accent (Brass)** | `#D4A853` / `#E8CF96` | Active tabs, primary CTA, chip stacks, dealer focus |
| **Positive / Win** | `#8CC9AA` | Muted sage green for positive EV / profit / active status |
| **Negative / Fold / Risk** | `#E07A7A` / `#FCA5A5` | Muted crimson for losses, folded state, errors |
| **Caution / Notice** | `#D9A760` | Freezeout (`禁补码`) or caution notices |

---

## 3. Typography & Tabular Alignment

- **Display**: `Cormorant Garamond`, `Noto Sans SC`, Georgia, serif — reserved for brand marks, hero headings, and editorial section titles.
- **UI Body**: `Plus Jakarta Sans`, `Noto Sans SC`, sans-serif — clean `12px–14px` UI copy with restrained tracking.
- **Numerals**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` (`.font-mono-num`) — mandatory for chips, blinds, percentages (`VPIP / PFR / Win%`), pot sizes, countdowns, and timestamps so numbers align cleanly down every column.

---

## 4. Layout & Ledger Patterns (Reference: Data Panel)

- **Underline Tabs**: Section switchers use a bottom hairline (`border-b border-white/[0.08]`) with a `2px` brass active underline (`border-b-2 border-[#D4A853] -mb-px`), never segmented pill boxes.
- **Unboxed Stat Ledgers**: Key metrics sit in `divide-x` / `divide-y divide-white/[0.08]` grids directly on the modal canvas instead of individual boxed tiles.
- **Modal Footers**:
  - Height-balanced single bar (`border-t border-white/[0.08] bg-[#090B0C] px-6 py-3.5`).
  - Left side: quiet `11px` status note (`text-[#7E8883]`).
  - Right side: tertiary text link → secondary hairline button → single solid brass primary CTA (when applicable).

---

## 5. Avatars, Seat Plates & Rank Tiers

### 5.1 Rank Tiers (No Numeric `Lv.X`)
- Numeric player levels (`Lv.1`, `Lv.6`, etc.) are removed from the interface.
- Players earn a **Club Rank Tier (段位)** derived strictly from **win rate (Bayesian sample-weighted), unlocked honors/medals, match experience, and points**:
  - **青铜** (`bronze`) · `#C48E68`
  - **白银** (`silver`) · `#B8C5D1`
  - **黄金** (`gold`) · `#DFC078`
  - **铂金** (`platinum`) · `#9AC7C2`
  - **钻石** (`diamond`) · `#94CBE8`
  - **大师** (`master`) · `#EBD392`
- **Placement**: Rank tier is displayed in the **Lobby Home header**, **Personal Center**, and **Player Profile Modal** — **never** pinned as a badge over the circular avatar on the poker table.

### 5.2 In-Game Seat Plate (`SeatNode`)
- **Avatar Circle**: Clean circular portrait with a subtle `1.5px` border. Zero overlaid level badges, zero duplicate blind icons, zero floating corner medals on the circle. When folded, the portrait desaturates (`grayscale opacity-55`) with a single `FOLD` stamp.
- **Blind / Dealer Marker**: Displayed **once** at the top-right edge of the rectangular seat plate (`D`, `SB 小盲`, `BB 大盲`) using restrained dark-surface hairline pills (never bright cartoon gradients).
- **Name & Honor Row**: `[Player Name]` + optional inline `14px` signature medal icon beside the name + optional `陪练` tag.
- **Chips & Live Status Row**: Left-aligned tabular chip count in warm brass (`#E8CF96`); right-aligned live action, timer, win delta, or crisp `已弃牌` tag.

---

## 6. Avatar Selection & Entry Flow

- **Logged-In Players**: Entering a room skips avatar selection in the Seat Entry modal and directly uses the player's account avatar (defaulting to the monogram initial avatar `'default'`).
- **Changing Avatar (Personal Center & Guests)**: Always offers all built-in club presets **including the default name-initial avatar (`default`)**, plus optional custom image upload. Selecting `'default'` cleanly overrides any previously stored preset or custom photo across local state, account preferences, live table state, and leaderboard records.
