---
name: "This Portfolio"
summary: "Designed and built this site end to end: a static site with a hand-written WebGL terrain of California, and a browser-based Studio I use to publish from the field."
problem: "I wanted one place to present project work and writing that I could keep current myself, from a laptop or a phone on site, without it looking like a template."
tech: ["Astro", "TypeScript", "WebGL2", "React (Studio)", "Cloudflare"]
screenshots: []
codeLang: "typescript"
featured: false
order: 6
published: true
---

## The idea

The site is built around one idea from my work: *ground truth*, checking a map
against what's actually on the ground. It opens on a point cloud of California
drawn from real SRTM elevation data, and the pages read like the reports I
write, with title blocks, numbered sections and numbered figures.

## How it's built

- **Astro** renders every page to static HTML, so it's fast and cheap to host.
  The public pages ship no framework JavaScript at all.
- The terrain is about 40,000 points rendered with a **hand-written WebGL2**
  shader, fed by a 192 × 216 heightmap baked from elevation tiles. It only runs
  while it's on screen.
- Motion uses the platform: CSS scroll-driven animations and native view
  transitions, with a still, finished version of every moment for readers who
  prefer reduced motion.
- A strict **Content-Security-Policy** covers every page.

## The Studio

A private admin I built in **React** that commits straight to this repository
through a small **Cloudflare Worker**. Each save is one atomic commit, every
file has a version history I can restore from, and a field log works offline
on my phone. Photos are resized and stripped of location data in the browser
before they're uploaded.

## Why it's here

It's the most direct evidence of the other half of my work: I build the tools
I need, and this is one of them.
