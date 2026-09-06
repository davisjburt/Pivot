---
name: Pivot
description: Precision weight tracking that reads the trend, not the noise.
colors:
  primary: "#1e40af"
  primary-deep: "#1e3a8a"
  primary-soft: "#e0effe"
  primary-pale: "#f0f7ff"
  ink: "#0f172a"
  paper: "#f8fafc"
  surface: "#ffffff"
  surface-hover: "#f8fafc"
  surface-active: "#f1f5f9"
  line: "#e2e8f0"
  text-muted: "#94a3b8"
  text-secondary: "#64748b"
  success: "#059669"
  success-bg: "#ecfdf5"
  warning: "#d97706"
  warning-bg: "#fffbeb"
  danger: "#dc2626"
  danger-bg: "#fef2f2"
typography:
  display:
    fontFamily: "'Space Grotesk', sans-serif"
    fontWeight: 700
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.1em"
  numeral:
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
    fontWeight: 900
    letterSpacing: "-0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  "2": "8px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.numeral}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  chip-tag-selected:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  chip-tag-unselected:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  stat-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Pivot

## Overview

**Creative North Star: "The Quiet Clinician"**

Pivot reads like a discreet, precise health companion, never a hospital dashboard and never a leaderboard. One instrument-blue accent (`#1e40af`) carries every action and every moment that matters; everything else recedes into a slate neutral scale that is calm at rest and only ever raises its voice for a genuine warning (amber) or a destructive action (red). The interface is confident about hierarchy — a single giant, 900-weight numeral commands each screen — but restrained about ornament: flat white cards, soft single-direction shadows, and generous rounded corners instead of borders, gradients, or texture.

The density is mobile-first and unapologetically single-column: every surface is built inside a fixed, phone-width frame (max 448px) with a bottom tab bar and a floating action button, even when viewed on desktop. Motion is physical rather than decorative — spring-damped sheets, `active:scale-95` presses — which reinforces the "instrument you hold" feeling rather than a "page you browse." Data visualization (the trend chart) is intentionally the quietest element on the Dashboard: a thin, low-opacity area fill with no gridlines beyond a faint horizontal rule, so the number above it stays the hero.

Confirmed anti-reference: **gamified fitness apps.** Pivot already celebrates streaks and milestones, but never with badges, leaderboards, confetti, or streak-shaming language — celebration stays inside the same calm, single-accent vocabulary as everything else (a quiet amber banner, not a burst).

**Key Characteristics:**
- One true accent hue (instrument blue); every other color is neutral or reserved for state (success/warning/danger)
- A single 900-weight "black" numeral or word per moment of commitment — brand mark, hero reading, primary action
- Tiny, bold, uppercase, wide-tracked "eyebrow" labels used everywhere instead of visible section chrome
- Flat cards with soft shadows and no borders-as-decoration; shadow weight itself signals importance
- Mobile-app shell (fixed phone frame, bottom nav, floating action button) regardless of viewport
- Physical motion: spring sheets, scale-press feedback, no gratuitous decorative animation

## Colors

A near-monochrome neutral system built entirely from one slate ramp, punctuated by exactly one accent hue and three small state colors that only appear when they have something specific to say.

### Primary
- **Instrument Blue** (`#1e40af` / brand-500): The single accent. Every primary action (Log Weight, Continue with Google, Connect to Health), every active nav icon, every "this is the number that matters" moment (trend headline, hero weight figure) uses this one hue. It never competes with itself — there is no secondary brand color.
- **Instrument Blue, Deep** (`#1e3a8a` / brand-600): Hover/pressed state for primary actions, and the resting state of the highest-commitment button (Google sign-in).
- **Instrument Blue, Soft** (`#e0effe` / brand-100): Fills behind small icon badges and active nav pills — enough presence to mark "selected," not enough to compete with content.
- **Instrument Blue, Pale** (`#f0f7ff` / brand-50): Faint tint backgrounds for banners (the streak card) and progress-track fills — color as atmosphere, not as content.

### Neutral
- **Ink** (`#0f172a`): Primary text and the dark-mode page background — the neutral ramp's darkest step.
- **Paper** (`#f8fafc`): Page background in light mode, and primary text in dark mode — the same ramp's lightest step.
- **Surface** (`#ffffff`): Card and sheet background at rest (light mode).
- **Line** (`#e2e8f0`): Every border and divider in the system — there is exactly one border color.
- **Text, Secondary** (`#64748b`): Body copy that isn't the headline (descriptions, helper text).
- **Text, Muted** (`#94a3b8`): Eyebrow labels, placeholder text, and disabled/inactive nav icons.

### Semantic (state only — never decorative)
- **Success** (`#059669` on `#ecfdf5`): Health-sync "Connected" status only.
- **Warning** (`#d97706` on `#fffbeb`): Spike-detected banners, new-streak-record banners, and "permission needed" states — Pivot's warmest color is reserved for moments that are informative, never alarming.
- **Danger** (`#dc2626` on `#fef2f2`): Destructive actions only (delete-entry hover) and hard errors.

### Named Rules
**The One Voice Rule.** There is exactly one accent hue in this system. A second "brand" color is never introduced; new emphasis is expressed through the blue ramp's weight (50→900), not a new hue.

**The Mirror Rule.** Light mode and dark mode are the *same* neutral (slate) ramp, just read in opposite directions — `ink`/`paper` swap ends, `line`/`surface-hover`/`surface-active` each swap to their mirrored step. A new neutral token must define both ends of its own mirror; never hand-pick an unrelated dark-mode color.

**The State-Only Rule.** Success, warning, and danger colors appear only attached to a real system state (connected, spike detected, destructive action) — never as page decoration, never to differentiate content that isn't actually in that state.

## Typography

**Display Font:** Space Grotesk (with sans-serif fallback)
**Body Font:** Inter (with ui-sans-serif, system-ui, sans-serif fallback)

**Character:** A geometric, slightly technical display face (Space Grotesk) for headings paired with a highly legible, neutral workhorse (Inter) for everything else — precise without feeling cold, because the numerals (set in Inter at black weight, not the display face) are what actually carry emotional weight.

### Hierarchy
- **Display** (700, `text-2xl`–`text-4xl`, tight tracking): Screen titles and the wordmark ("Pivot", "Entry Log", "Trend: 178.4 lbs"). Space Grotesk.
- **Numeral** (900 "black", `text-3xl`–`text-6xl`, tight tracking): The one number or word each screen is organized around — today's weight, the LogModal entry field, milestone targets, the primary CTA label. Inter, not the display face.
- **Body** (400–500, `text-sm`–`text-base`): Descriptions, helper copy, list content.
- **Label** (700, 9–10px, `0.1em`+ letter-spacing, uppercase): The system's signature micro-typography — every stat-card caption, section subtitle, settings row description, and tag chip uses this exact treatment.

### Named Rules
**The Black Weight Rule.** Font-weight 900 is reserved for text that carries a decision or a commitment: the brand mark, a hero reading, a milestone numeral, or a primary action's own label. It is never used for supporting copy, however short.

**The Eyebrow Rule.** Any secondary or contextual label (card captions, view subtitles, status text, delta indicators) is set at 9–10px, bold, uppercase, and wide-tracked (`letter-spacing: 0.1em`+). This is the system's substitute for visible chrome (icons, dividers, section headers) — the label itself does that job.

## Layout

A fixed, phone-width application shell (`max-width: 448px`), centered and full-height, with a heavy drop shadow separating it from the surrounding viewport — the app presents as a single physical device even inside a desktop browser window. Content scrolls in one column inside `main`, padded `24px` on the sides and pulled up top by the device's safe-area inset; a fixed bottom tab bar (with a floating circular action button breaking its top edge) stays pinned regardless of scroll position. Card sections stack vertically with `24px` gaps (`space-y-6`/`space-y-8`); the only place true two-up density appears is the stat-card grid (`grid-cols-2`) and the horizontally-scrolling milestone strip. Internal card padding scales with the card's importance: small stat cards use `24px`, hero/settings cards use `32px`.

## Elevation & Depth

Hybrid: flat surfaces at rest, with shadow weight used deliberately as a hierarchy signal rather than uniform "material" elevation. Ordinary cards (stat cards, list containers, chart panels) sit at a soft, almost-invisible `shadow-sm` — presence without weight. Shadow escalates specifically at moments of commitment: the primary Log Weight button, the Google sign-in button, the app's own outer frame, and the Log Weight bottom sheet all jump to `shadow-xl`/`shadow-2xl`. The escalation is the point — it marks "this is the thing to press" or "this is the whole app," not just "this is a raised panel."

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` / `shadow-sm`): Default for every card, list container, and chart panel.
- **Commitment** (`shadow-xl`/`shadow-2xl`, sometimes tinted `rgba(30,64,175,…)` — e.g. `shadow-brand-500/20`, `shadow-brand-600/25`): Reserved for primary CTAs, the app shell itself, and modal sheets. The tinted variant (a soft blue glow instead of neutral black) appears only under brand-blue elements — the sign-in button, the hero icon badge.
- **Micro-lift** (`shadow-md`): A small number of secondary emphasis spots (fullscreen chart toggle) between resting and commitment.

### Named Rules
**The Escalation Rule.** Shadow depth tracks importance, not surface type. A card doesn't get heavier shadow because it's "raised" — it gets heavier shadow because pressing it (or being it) is the most important thing on screen.

## Shapes

Rounded-everything, no sharp corners and almost no borders-as-decoration (the one exception is the `1px` `line` border used consistently on cards and dividers). Radius scales with element size rather than being uniform: small interactive controls (icon buttons, range inputs, date pickers) use `12px`; the default for cards, primary buttons, and tag chips is `16px`; a handful of hero-level surfaces (chart panels, the settings card, the History container) step up to `24px`. Pills (nav active-state, toggle tracks, status badges, the floating action button) are fully round. The one deliberate outlier is the Log Weight bottom sheet, whose top corners round at `32px` — larger than anything else in the system, marking it as the single most physical, "reach out and touch it" surface in the app.

## Components

### Buttons
- **Shape:** `16px` radius (`rounded-2xl`), matching cards and chips.
- **Primary:** Instrument Blue (`#1e40af`) background, white text, black (900) weight, generous padding (`20px 24px` for full-width CTAs). Always paired with `active:scale-95` (or `scale-[0.98]`) press feedback.
- **Hover / Focus:** Background deepens to Instrument Blue Deep (`#1e3a8a`); no separate focus ring style beyond the browser default is currently used on buttons (inputs do use a visible focus ring — see Inputs).
- **Icon-only (nav, close, delete):** No fill at rest; `12px` radius hover background in a neutral or danger tint (`hover:bg-red-50` for delete) makes the click target obvious without adding a permanent border.

### Chips (tag toggles)
- **Style:** `16px` radius, `10px 16px` padding, bold body text. Unselected: neutral surface-active fill (`#f1f5f9`) with secondary text. Selected: Instrument Blue fill, white text, plus a soft tinted shadow (`shadow-brand-100`).
- **State:** Binary toggle only (selected/unselected) — no third "disabled" chip state exists yet.

### Cards / Containers
- **Corner Style:** `16px` for stat cards and list containers; `24px` for hero-level panels (chart, settings).
- **Background:** White surface, no gradient, no texture.
- **Shadow Strategy:** `shadow-sm` at rest (see Elevation & Depth); never heavier unless the card itself is the primary action of its screen.
- **Border:** `1px` `line` color — present on nearly every card, doing the job borders usually share with shadow.
- **Internal Padding:** `24px` standard, `32px` for hero/settings cards.

### Inputs / Fields
- **Style:** Filled, not outlined — neutral `surface-active` background, no visible border at rest, `12px` radius.
- **Focus:** A visible `2px` Instrument Blue ring (`focus:ring-2 focus:ring-brand-500`) rather than a border-color shift.
- **The hero numeral field (signature):** The weight-entry input in the Log Weight sheet has no visible field chrome at all — no background, no border, just a 6xl/black-weight number centered on the sheet. It reads as a display numeral you happen to be able to edit, not a form field.

### Navigation
- **Style:** Fixed bottom tab bar, five slots: four icon-only nav links plus a raised circular Instrument Blue floating action button (the "+", always centered, always breaking the bar's top edge by `-mt-10`).
- **States:** Active tab icon turns Instrument Blue with a soft blue pill background (`bg-brand-50`, `12px` radius) behind it; inactive icons are muted slate with no background. No text labels — icon + color + pill is the entire active-state language.

### Status Pills (signature)
Small, fully-rounded (`rounded-full`) badges used for connection/permission state (Health sync: Connected / Permission needed / Unavailable). Always paired icon + label, always the 9–10px bold uppercase eyebrow treatment, background always the state color's `-bg` token with matching darker text — never a solid-fill badge.

### Toggle Switches
`48px × 24px` fully-rounded track, neutral slate when off, Instrument Blue when on; a `16px` white circular thumb slides between `left: 4px` and `left: 28px`. Used for every boolean setting (Privacy Mode, Dark Mode) — there is no checkbox anywhere in the system.

## Do's and Don'ts

### Do:
- **Do** keep exactly one accent hue. New emphasis is a weight or shade change on Instrument Blue, never a second brand color.
- **Do** reserve font-weight 900 for numerals and words that represent a decision or commitment (see The Black Weight Rule).
- **Do** use the 9–10px bold-uppercase-wide-tracked label style for any new secondary/contextual text instead of inventing a new caption style.
- **Do** let shadow weight communicate importance (The Escalation Rule) — a new primary action earns `shadow-xl`, not just a slightly darker `shadow-sm`.
- **Do** register both light- and dark-mode values for any new neutral token, mirrored from the existing slate ramp (The Mirror Rule), before using it anywhere.
- **Do** keep celebratory/streak moments inside the existing calm vocabulary — a quiet amber banner with the eyebrow label style, not a badge, confetti, or a new visual language.

### Don't:
- **Don't** introduce a second accent color, even for a "special" feature — extend the existing blue ramp or use a state color instead.
- **Don't** add a new destructive- or status-colored utility class without a matching `--theme-*` variable pair. Several existing classes (`red-100`, `red-500`, `red-700`, `emerald-700`) were used directly from Tailwind's default palette without a light/dark override and will render wrong in dark mode — don't repeat that gap.
- **Don't** add gamification chrome (badges, leaderboards, confetti, "you beat 87% of users" comparisons) — it's the system's explicit anti-reference.
- **Don't** give a card heavier elevation than `shadow-sm` unless it is genuinely the primary action or the whole app shell.
- **Don't** use a bordered/outlined input style — every field in this system is filled, with focus communicated by a ring, not a border-color change.
