---
name: Pivot
description: A weather forecast for your body — the trend is the track, today's reading is one noisy observation.
colors:
  paper: "#f5f1e4"
  surface: "#fbf9f1"
  surface-hover: "#efe9d8"
  surface-active: "#e7dfc9"
  ink: "#14213d"
  ink-muted: "#56617a"
  ink-faint: "#8992a6"
  line: "#ddd3b8"
  line-strong: "#c9bc98"
  track: "#c1502b"
  track-deep: "#9c3d20"
  track-soft: "#f1d9c9"
  cone: "#e3e6ec"
  advisory: "#92661c"
  advisory-bg: "#f3e6c4"
  verified: "#2f6b4c"
  verified-bg: "#dcebe1"
  danger: "#a62f26"
  danger-bg: "#f3dcd8"
typography:
  display:
    fontFamily: "'Barlow Condensed', ui-sans-serif, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  legend:
    fontFamily: "'Barlow Condensed', ui-sans-serif, sans-serif"
    fontSize: "9px"
    fontWeight: 600
    letterSpacing: "0.09em"
  numeral:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontWeight: 700
rounded:
  sm: "4px"
  md: "6px"
  full: "9999px"
spacing:
  "2": "8px"
  "4": "16px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.track}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.track-deep}"
  chip-selected:
    backgroundColor: "{colors.track}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  chip-unselected:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  legend-tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Pivot

## Overview

**Creative North Star: "The Forecast Cone"**

Pivot reads like a weather bulletin for your body: the trend is a forecast track, today's raw reading is one noisy observation, and a widening cone of uncertainty is how the system admits it isn't certain — the same honesty a meteorologist uses to keep a chaotic system legible instead of alarming. This directly replaces Pivot's earlier "Quiet Clinician" identity (flat blue-on-slate cards, soft rounded shapes) after that system was judged dated and too close to generic clinical-SaaS chrome. Nothing about the underlying product changed — trend-over-noise, hide-raw-numbers, explain-don't-punish-fluctuation all carry over exactly — only the visual world does.

The palette is warm chart-paper cream and deep navy ink, not cold slate-and-blue: charts are printed on paper, not glowing on a hospital monitor. One accent — a confident coral-red "forecast track" — carries every primary action and every number that matters, the same way a storm track's centerline is drawn in a single warm color against a muted map. Typography pairs a condensed, legend-style display face (used almost exclusively in small tracked uppercase, like a chart's axis labels) with tabular monospace numerals for every reading, delta, and date — the numbers are meant to look measured, not decorated. Shape language shifted from "rounded-everything, no borders" to small radii and real hairline borders doing the separation work a chart's own gridlines would do; there is no soft drop-shadow anywhere in the system.

Dark mode is not a mechanical inversion — it's its own scene: a chart room at night, read under the kind of low, warm light that preserves night vision, so the accent shifts to a slightly softer coral rather than staying identical to its daylight value.

Confirmed anti-reference (carried over, still binding): **gamified fitness apps** — no badges, no leaderboards, no confetti, no streak-shaming. A consecutive-logging streak still exists, but it renders as a quiet bulletin strip with a calendar-check icon, not a flame or a burst.

Built with headroom for a confirmed future direction: Pivot is intended to grow into an AI macro tracker and body scanner. Nothing about those exists yet, but the instrument/forecast metaphor (a "reading," a "track," a "gauge") was chosen specifically because it extends cleanly to other kinds of body data without needing a second visual identity bolted on later.

**Key Characteristics:**
- One accent — warm coral-red "track" — carries every primary action and every number that matters; nothing else is saturated
- Warm cream chart-paper ground and deep navy ink, never cold slate-and-blue
- Condensed, tracked, uppercase "legend" micro-type (8–10px) standing in for section chrome, styled like a chart's own axis labels
- Tabular monospace numerals for every measured value — weights, deltas, dates, percentages
- Hairline borders and small radii (4–6px) doing the separation work; no soft drop-shadows anywhere
- A literal cone-of-uncertainty sparkline on the Dashboard's trend headline, and a shaded projection band on the full Forecast chart
- Dark mode is its own considered scene ("the chart room at night"), not an inverted palette

## Colors

A warm, near-monochrome paper-and-ink system, punctuated by exactly one accent hue and three small state colors that only appear attached to a real system state.

### Primary
- **Forecast Track** (`#c1502b` light / `#e2795c` dark): The single accent. Every primary action (Save Entry, Continue with Google, Connect to Health), every active nav icon, and the trend headline number itself use this one hue — it is quite literally the color of the storm track's centerline.
- **Track, Deep** (`#9c3d20` light / `#c15a3d` dark): Hover/pressed state for primary actions, and the color used whenever "track" needs to render as small text (rather than a background) to keep contrast comfortable.
- **Track, Soft** (`#f1d9c9` light / `#3a2a22` dark): Faint tint fills — the active milestone gauge fill, the health-sync icon badge background.

### Neutral
- **Paper** (`#f5f1e4` light / `#0c1424` dark): The page background — warm chart-paper cream in light mode, near-black "chart room at night" in dark mode.
- **Surface** (`#fbf9f1` light / `#121b2e` dark): Card and sheet background.
- **Ink** (`#14213d` light / `#f1ead9` dark): Primary text — deep chart ink in light mode, warm parchment near-white in dark mode.
- **Ink, Muted** (`#56617a` light / `#abb2c2` dark): Body copy that isn't the headline.
- **Ink, Faint** (`#8992a6`, same value both modes): Legend labels and placeholder text — deliberately reused as both modes' "muted" tier rather than inventing an unreachable fourth gray that would fail contrast (a lesson carried over from the prior system's audit).
- **Line** (`#ddd3b8` light / `#26314a` dark): Every hairline border and divider in the system — there is exactly one border color per mode.

### Semantic (state only — never decorative)
- **Advisory** (`#92661c` on `#f3e6c4` light; `#e4be6e` on `#332a15` dark): Spike-detected banners, new-streak-record banners, "permission needed" states, week-over-week gain in the log.
- **Verified** (`#2f6b4c` on `#dcebe1` light; `#7fc69e` on `#16281f` dark): Health-sync "Connected" status and success toasts only.
- **Danger** (`#a62f26` on `#f3dcd8` light; `#ef5344` on `#3a1d19` dark): Destructive actions and hard errors only. Deliberately kept more purely red than Track's orange-leaning coral in both modes, so "something is wrong" never reads as a variant of the brand accent.

### Named Rules
**The One Track Rule.** There is exactly one accent hue. A second saturated color is never introduced for emphasis; new emphasis is a weight or shade change on Track, or a move to a semantic state color when a real state is involved.

**The Paper Rule.** The system's neutrals are warm (cream/tan-gray), never cool slate — light mode is chart paper, dark mode is a night chart room, and any new neutral token must pick a warm-family value consistent with one of those two scenes.

**The Reused Muted Rule.** `ink-muted` and `ink-faint` are allowed to share a value (as they do in dark mode, and nearly do in light mode) rather than manufacturing a fourth gray step that cannot pass WCAG AA at the sizes this system actually uses text at. Do not add a "more muted" tier without checking its contrast first.

## Typography

**Display/Legend Font:** Barlow Condensed (with sans-serif fallback)
**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallback)
**Numeral Font:** JetBrains Mono (with ui-monospace, monospace fallback)

**Character:** A condensed, technical grotesk used almost exclusively as small tracked uppercase — the system's substitute for chart chrome — paired with a legible body workhorse and a genuine tabular monospace for every measured value. Nothing is set in a "designer" display serif or script; this is an instrument-reading system, not an editorial one.

### Hierarchy
- **Display** (700, `text-2xl`–`text-5xl`, Barlow Condensed, tight tracking): Screen titles and the wordmark ("Pivot", "Log", "Forecast", "Setup"). Used sparingly — most of the system's typographic voice comes from Legend and Numeral, not Display.
- **Numeral** (700, tabular, `text-2xl`–`text-6xl`, JetBrains Mono): Every measured value — trend weight, entry weight, deltas, dates, percentages, velocity. Applied via the `.tabular` utility class.
- **Legend** (600, 8–11px, Barlow Condensed, `0.09em`+ tracking, uppercase): The system's signature micro-typography, applied via the `.legend-label` utility class — every card caption, section subtitle, nav label, status pill, and settings row description.
- **Body** (400–500, `text-sm`–`text-base`, Inter): Descriptions, helper copy, list content, form labels' associated values.

### Named Rules
**The Instrument Numeral Rule.** Any value the product actually measured or calculated — never decorative — is set in tabular monospace (JetBrains Mono). If it's a real number from the data, it gets the Numeral treatment; if it's a word or a label, it doesn't.

**The Legend-Not-Chrome Rule.** Section headers, captions, and status text use the small tracked uppercase Legend style instead of icons, dividers, or a heavier heading — the label itself does the work a chart's own axis legend would do.

## Layout

The same fixed, phone-width application shell as before (`max-width: 448px`, centered, full height) sits on a warm charcoal desk backdrop (`#2a2620`) rather than a neutral gray — the app reads as a physical instrument sitting on a desk, not a browser window. Content scrolls in one column inside `main`; a bottom instrument rail (icon + Legend-style text label per tab) stays pinned, with a squared-off coral "record a reading" button breaking its top edge. Cards stack with consistent gaps; the Dashboard's stat grid is the only place true two-up density appears, alongside the horizontally-scrolling milestone gauge strip.

## Elevation & Depth

Flat, deliberately. There are no soft drop-shadows anywhere in the built system — separation between surfaces comes entirely from hairline borders (`{colors.line}`) and background-value steps (`paper` → `surface` → `surface-hover` → `surface-active`), the same way a printed chart separates regions with rules and tone rather than cast shadow. The one exception is the Log Weight sheet and the sign-in button, which keep a conventional `shadow-lg`/`shadow-2xl` purely for the physical "this sheet is above the page" affordance — not as a hierarchy signal elsewhere in the system.

### Named Rules
**The Flat Instrument Rule.** Depth is drawn with a line and a tone step, not a shadow. A new component reaching for `box-shadow` to separate itself from its background is solving the problem the wrong way in this system — reach for a border or a surface-step instead.

## Shapes

Small and consistent: `4px` for chips, tags, and small controls; `6px` for cards, buttons, and legend tiles; fully round only for genuinely circular things (toggle tracks/thumbs, status pills). There is no large-radius "soft card" anywhere in the system — the closest thing, the Log Weight bottom sheet, only rounds its top corners at a modest `12px` (Tailwind `rounded-t-xl`), a deliberate step down from the prior system's dramatic `32px` sheet, consistent with the rest of the system's tighter, more structural corner language.

## Components

### Buttons
- **Shape:** `6px` radius (`rounded-md`), a clear step down from the prior system's `16px`.
- **Primary:** Track (`#c1502b`/`#e2795c`) background, white text, `rounded-md`, generous padding for full-width CTAs. `active:scale-95`/`scale-[0.98]` press feedback carried over unchanged.
- **Inverted (highest-commitment, e.g. Export JSON):** `bg-ink`/`text-paper` — because ink and paper are mirrored opposites across light/dark, this button flips from "dark text on cream" to "cream text on dark" between modes, reading as the system's single highest-contrast action either way.
- **Icon-only (nav, close, delete):** No fill at rest; a `surface-hover`/`danger-bg` hover background marks the click target.

### Chips (tag toggles)
- **Style:** `4px` radius (`rounded-sm`), `8px 14px` padding. Unselected: `surface-hover` fill with `ink-muted` text. Selected: Track fill, white text — no tinted shadow (the prior system's `shadow-brand-100` glow was dropped along with soft shadows generally).

### Cards / Legend Tiles
- **Corner Style:** `6px` (`rounded-md`) uniformly — no more three-tier 16/16/24px radius scale.
- **Background:** `surface`, no gradient, no texture.
- **Border:** `1px` `line` color on every card — doing all the separation work elevation used to share with borders in the prior system.
- **Shadow:** None (see Elevation & Depth).

### Inputs / Fields
- **Style:** Filled, `surface-hover` background, `4px` radius, no visible border at rest.
- **Focus:** A `2px` Track ring, or a Track border color shift (settings text fields), depending on context.
- **The hero numeral field (signature, carried over):** The weight-entry input in the Log Weight sheet still has zero visible field chrome — no background, no border — but the numeral itself is now tabular monospace in Track Deep, not the prior system's Inter black-weight.

### Navigation
- **Style:** Fixed bottom instrument rail, five slots: four icon+Legend-label nav links plus a centered, squared-off (`rounded-md`, not fully round) Track "record a reading" button breaking the bar's top edge.
- **States:** Active tab: Track-colored icon and label. Inactive: `ink-faint`. Text labels are always visible (a change from the prior system's icon-only nav, which an accessibility/first-time-user finding flagged directly).

### Forecast Sparkline (signature, new)
A small inline SVG on the Dashboard trend headline: the last ~14 trend points as a Track-colored line, with a triangular `cone`-colored wedge fanning out from the latest point toward the direction the forecast is heading — a literal, always-visible expression of the system's whole thesis, not just a chart-page feature.

### Milestone Gauge (signature, carried over, restyled)
Small hairline-bordered tiles with a bottom-up fill (Track/Track-Soft) standing in for a physical gauge tick — the mechanic is unchanged from the prior system, only the surface treatment (flat + bordered, not soft + shadowed) changed.

## Do's and Don'ts

### Do:
- **Do** keep exactly one accent hue (Track). New emphasis is a weight/shade change or a move to a semantic state color, never a second saturated hue.
- **Do** set every measured value (weights, deltas, dates, velocity, percentages) in tabular monospace (JetBrains Mono) — that's what separates a "reading" from a label in this system.
- **Do** use the Legend style (Barlow Condensed, 8–11px, tracked uppercase) for section chrome instead of icons, dividers, or a heavier heading.
- **Do** separate surfaces with a hairline border and a background-tone step, not a shadow.
- **Do** give dark mode its own considered "night chart room" values rather than mechanically inverting light-mode hex values — check contrast for both, not just one.
- **Do** keep celebratory/streak moments inside the calm bulletin-strip vocabulary — a quiet advisory strip with an icon and Legend label, never a badge or confetti.

### Don't:
- **Don't** reach for `box-shadow` to separate a component from its background — this system has none outside the Log Weight sheet and the sign-in CTA.
- **Don't** use a radius larger than `6px` on an ordinary card or button; the one deliberate exception (the Log Weight sheet's `12px` top corners) is already at the system's ceiling.
- **Don't** introduce Space Grotesk, Inter-as-display, or any other prior-system typographic choice — Barlow Condensed and JetBrains Mono are the new display/numeral identity.
- **Don't** add gamification chrome (badges, leaderboards, confetti, streak-shaming) — still the system's explicit anti-reference.
- **Don't** style a new destructive or status color without checking it reads as clearly distinct from Track's orange-leaning coral, especially in dark mode where warm hues cluster together easily.
