# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General public interested in long-term weight management — not yet launched, but built with public release as the goal, not a personal-only tool. Primary situation: people who weigh themselves regularly and find normal day-to-day fluctuation (water weight, sodium, sleep, travel) discouraging or anxiety-inducing when read as raw numbers. Job to be done: log a daily weight quickly, and see whether the real trend is moving in the right direction without being derailed by any single bad reading.

## Product Purpose

A motivational weight tracking app focused on long-term trends and insights rather than raw numbers (per the project's own description). It exists to make the *trend* the headline experience instead of the scale reading, so progress stays legible and encouraging even when individual days are noisy.

## Positioning

The mechanism a competitor can't casually copy: a configurable smoothing window that turns noisy daily weigh-ins into a trend line, paired with milestone bucketing, predictive goal-date projections, and contextual tagging (Ate Late, High Sodium, Travel, Heavy Workout, Poor Sleep, Stress, Sore) that *explains* spikes instead of just displaying them. "Hide raw numbers" is a first-class mode, not a hidden setting — the app can be used entirely trend-first.

## Operating Context

- One React codebase shipped two ways: a web PWA (served by Cloudflare Workers Static Assets) and a native iOS app (Capacitor wrapper, `com.pivot.weighttracker`, WKWebView). No Android target configured yet.
- Google sign-in uses the server-side OAuth flow in the Cloudflare Worker; per-user profiles, sessions, goals, settings, and entries live in D1.
- Optional one-way sync of logged weight to Apple Health / Health Connect on native builds.
- Daily reminder notifications: web push subscriptions stored in D1, dispatched by a Worker Cron Trigger every five minutes.
- CSV and JSON import/export so users can bring in or leave with their full history.

## Capabilities and Constraints

- Same-origin Cloudflare Worker hosting: `/api/*` runs through the Worker and the remaining routes resolve to the PWA assets. Access control is enforced by opaque HTTP-only sessions and per-user D1 queries.
- Reminder delivery is cron-polled on a 5-minute cadence, not real-time.
- iOS build runs inside WKWebView via Capacitor, which has already required web-only workarounds (e.g. stripping the `crossorigin` attribute from production HTML).
- The Cloudflare OAuth/session implementation is currently same-origin. A distributable iOS build needs a deployed Worker URL plus a native OAuth handoff before release.
- New users receive the standard `user` role in D1. Any future administration surface must explicitly authorize elevated roles server-side before public launch.
- Terminology: **trend weight** (smoothed value), **raw weight** (an actual logged entry), **milestone** (a chunk of progress toward the goal, sized by `milestoneSize`), **smoothing window** (number of days of data averaged into the trend).

## Brand Commitments

Name: **Pivot**. Existing tagline in the product: "Precision Weight Management." The app uses a flat, solid-color Pivot icon across its favicon, PWA manifest, Apple touch icon, and iOS asset catalog.

## Evidence on Hand

The product has a custom flat app icon but no testimonials, user counts, press, or case studies. Future work must not fabricate any of these.

## Product Principles

1. **Trend over noise.** The smoothed trend is always the headline; any single raw data point is secondary and should never read as the day's verdict.
2. **Reduce weight-related anxiety — deliberately, not incidentally.** This is a durable design principle, not a side effect of wanting cleaner data: copy, visuals, and future features should avoid shame- or urgency-based framing around numbers, and "hide raw numbers" is a respected, first-class way to use the app, not an edge case.
3. **Explain fluctuation, don't punish it.** Contextual tags exist so a spike gets attributed to a plausible cause (sodium, travel, poor sleep, a hard workout) instead of reading as personal failure.
4. **User-owned, portable data.** CSV/JSON import and export are core functionality, not an afterthought — a user should always be able to leave with everything they logged.
5. **One codebase, two shells.** Web and iOS share the same React UI; new work needs to stay responsive and WKWebView-safe, not silently assume a desktop browser or native-only APIs.

## Accessibility & Inclusion

No formal accessibility standard has been established yet. Given Product Principle #2, copy and imagery should default to being mindful of body image and disordered-eating sensitivities even where no explicit standard requires it.
