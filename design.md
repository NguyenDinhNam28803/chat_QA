---
version: alpha
name: Ubuntu
description: Open-source earth: fedora brown, terminal amber, community warm.
colors:
  primary: "#EDE5D4"
  secondary: "#A2957C"
  tertiary: "#E69E30"
  neutral: "#1C150F"
  surface: "#261B13"
  on-primary: "#1C150F"
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 3.75rem
    fontWeight: 600
    letterSpacing: "-0.02em"
  h1:
    fontFamily: Space Grotesk
    fontSize: 2rem
    fontWeight: 600
  body:
    fontFamily: IBM Plex Sans
    fontSize: 0.95rem
    lineHeight: 1.6
  label:
    fontFamily: IBM Plex Mono
    fontSize: 0.72rem
    letterSpacing: "0.06em"
rounded:
  sm: 4px
  md: 6px
  lg: 10px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
---
## Overview

An open-source community palette: fedora brown, terminal amber, community warmth.

## Colors

The palette is built around high-contrast neutrals and a single accent that drives interaction.

- **Primary (`#EDE5D4`):** Headlines and core text.
- **Secondary (`#A2957C`):** Borders, captions, and metadata.
- **Tertiary (`#E69E30`):** The sole driver for interaction. Reserve it.
- **Neutral (`#1C150F`):** The page foundation.

## Typography

- **display:** Space Grotesk 3.75rem
- **h1:** Space Grotesk 2rem
- **body:** IBM Plex Sans 0.95rem
- **label:** IBM Plex Mono 0.72rem

## Do's and Don'ts

- **Do** use Tertiary for exactly one action per screen.
- **Do** let Neutral carry the composition — negative space is a feature.
- **Don't** introduce gradients. This system is flat on purpose.
- **Don't** mix Tertiary with alternate accents; the single-accent rule is load-bearing.
