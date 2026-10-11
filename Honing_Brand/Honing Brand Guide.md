Identity system · v1.0 · October 2026

# Your record, honed.

Honing is the career command center formerly called ApplyOS. One immutable master record, and a precise, reviewable edit for every role. The identity is built from that idea and nothing else: two stems, one cut, one floating patch.

Angle**1 : 2 bevel**

Accent**Edge indigo**

Type**Geist family**

01 · The mark

## An H that tells the product's story

Every part of the mark maps to how Honing works. Stems and gaps sit on a 64-unit grid with a 4-unit module, so it holds together from a 16px favicon to a billboard.

### The master stem never changes

A full, untouched block. It is the append-only master resume: the source of truth every variant is measured against.

### The variant is cut, never stretched

Its top is honed on a 1 : 2 bevel, and the tip reaches exactly the master's height. A tailored resume can be sharpened toward a role, but it never claims more than the record holds.

### The delta floats

The crossbar is the patch. It runs on the same angle as the cut and stops three units short of each stem, because a patch is stored beside the master and never written into it.

02 · Logo suite

## Lockup, wordmark, symbol

The horizontal lockup is the default. The mark sits exactly at cap height, separated by two stem widths. In the wordmark, the tittle of the i is redrawn as the delta, cut on the same angle.

Lockup · primary

Lockup · inverse

Wordmark

Mark · one color

Clear space = one mark height on every side

Lockup min · 96px

78px

Mark min · 24px

16px favicon

Below 24 · use favicon cut

03 · Color

## Graphite, Steel, and one Edge

These are the values already in the app, named for their job. Graphite and Steel do almost all the work. Edge is reserved for the delta, the primary action, and focus, so on any screen it marks what is being changed or what to do next.

bg · page

**Graphite 950**#09090B · zinc-950

Page ground. Pair with a 9% Edge glow from the top edge.

card

**Graphite 850**#131316

Raised surfaces, at 60% with blur.

fg

**Steel 50**#F4F4F5 · zinc-100

Text and the mark's stems.

accent

**Edge 400**#818CF8 · indigo-400

Delta on dark. 6.7 : 1 on Graphite.

950

900

800

line

500

400

E 600

E 500

E 200

Proportion on a screen

80 Graphite, 12 surface, 6 Steel, 2 Edge. If Edge covers more than a button, it stops meaning anything.

Edge on light

#4F46E5 indigo-600. Used for the delta on white and light documents (6.3 : 1 on white).

Semantic, not brand

Added #4ADE80, Removed #71717A struck, Danger #F87171. Never used in logos or marketing.

04 · Typography

## One engineered family, one editorial voice

Geist matches the Next.js stack and loads free through `next/font`. Instrument Serif Italic appears only in marketing headlines, as the human counterweight to the grid.

Display & UI\
\
Geist 400 / 500 / 600

Shortlisted → Offer

Headings at 600 with −2% to −3% tracking. Interface text at 13–14px, weight 400 or 500.

Data & diffs\
\
Geist Mono 400 / 500

match 87% · patch 3f2a9c · +4 −1 words\
2026-10-14 09:30 · Interview · Stripe

IDs, scores, dates, keyboard hints and diff counts. Always tabular figures.

Editorial\
\
Instrument Serif Italic

Sharpened, never stretched.

Marketing headlines and the social card only. Never inside the product UI, never for body text.

Product scale (px / weight / tracking)

32/600Pipeline

20/600Senior Product Engineer · Linear

14/500Ready to submit · 3 approvals pending

13/400Tailored from master v12. Nothing was added that the master does not contain.

11/500Workspace · Settings

05 · App icon & favicon

## One tile, hinted per size

The tile is Graphite 900 with an Edge glow from above and a hairline rim. Below 24px the mark is redrawn on whole pixels and the delta closes up to the stems, since a three-unit gap cannot survive at that size.

App icon

512 · app / PWA

App icon

180 · apple-touch

App icon

48

Favicon 32

32

Favicon 16

16

Favicon 16 enlarged

16 at 6×

06 · In the product

## The brand at work

The top bar carries the lockup and links to the dashboard. In the diff view, the same rule holds as in the mark: the master on the left is never touched; the variant on the right shows every change.

Workspace › **Resume**

Master · v12

Built a reporting pipeline that cut month-end close from 6 days to 2.

Led migration of 40 services to Kubernetes.

Variant · Platform Engineer

Built an event-driven reporting pipeline that cut month-end close from 6 days to 2.

Led ~~migration~~ the zero-downtime migration of 40 services to Kubernetes.

07 · Misuse

## Four ways to break it

Each of these changes what the mark says about the product.

Don't join the delta to the stems above 24px. A patch that touches the master is a destructive edit.

Don't let the variant rise above the master. That is a claim the record can't back.

Don't recolor the delta. It is Edge, or the same color as the stems.

Don't rotate, skew, outline, or add effects. The angle already lives inside the mark.

08 · Files & tokens

## What's in the kit

Every file is in the project's shared folder under `brand/honing`. SVGs are outlined, so they render identically without the fonts installed.

svg/

- honing-lockup-{dark,light}
- honing-wordmark-{dark,light}
- honing-mark-{dark,light}
- …-mono-{white,black}
- honing-app-icon
- favicon, favicon-16

png/

- logo/ · 512, 1024, 2048w
- app-icon/ · 1024, 512, 192
- app-icon/apple-touch-icon
- favicon/ · 16, 32, 48, .ico
- social/ · og 1200×630
- social/ · avatar 400

code/

- honing-tokens.css
- brand-guide.html

```
/* Honing brand tokens. Drop-in for src/app/globals.css :root.
   Values are the app's existing palette, renamed to brand roles. */
:root {
  /* Graphite: neutral foundation (zinc) */
  --honing-graphite-950: #09090b; /* page */
  --honing-graphite-900: #111114; /* app icon tile, sidebar */
  --honing-graphite-850: #131316; /* card surface */
  --honing-graphite-800: #1c1c20; /* muted surface */
  --honing-graphite-line: rgb(39 39 42 / 0.8); /* borders */

  /* Steel: text and the mark's stems */
  --honing-steel-50: #f4f4f5;  /* primary text, mark stems on dark */
  --honing-steel-400: #a1a1aa; /* secondary text */
  --honing-steel-500: #71717a; /* tertiary text, removed words */

  /* Edge: the single accent. Reserved for the delta and primary action. */
  --honing-edge-200: #c7d2fe; /* accent text on dark */
  --honing-edge-400: #818cf8; /* mark delta on dark, links */
  --honing-edge-500: #6366f1; /* primary buttons, focus ring */
  --honing-edge-600: #4f46e5; /* mark delta on light */
  --honing-edge-glow: rgb(99 102 241 / 0.09);

  /* Semantic (never used as brand color) */
  --honing-added: #4ade80;
  --honing-warning: #fbbf24;
  --honing-danger: #f87171;

  /* Type */
  --honing-font-sans: "Geist", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --honing-font-mono: "Geist Mono", ui-monospace, "SFMono-Regular", monospace;
  --honing-font-editorial: "Instrument Serif", Georgia, serif; /* italic, marketing only */

  /* Geometry */
  --honing-bevel: 26.565deg; /* 1:2 rise, the angle of every cut */
  --honing-radius-tile: 22.5%;
  --honing-ease: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Honing identity systemGraphite · Steel · Edge