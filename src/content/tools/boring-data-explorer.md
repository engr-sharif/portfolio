---
name: "Boring Data Explorer"
summary: "A geospatial explorer for subsurface boring records — a clustered map with filtering, side-by-side comparison, saved views, and export, built as an installable PWA."
problem: "Reviewing subsurface boring data meant digging through static files; the team needed an interactive, shareable way to explore and compare borings."
tech: ["JavaScript", "GeoJSON", "Leaflet", "PWA"]
repoUrl: "https://github.com/engr-sharif/sbmm-explorer-v2"
screenshots: []
codeLang: "javascript"
featured: false
order: 4
published: true
---

## The problem

Subsurface boring records are exactly the kind of data that's painful to review
as flat files — you want to see them in space, filter them, and compare a few
side by side. The legacy version worked but was clunky.

## What I built

A rebuilt explorer with a normalized GeoJSON data pipeline and a much better
interface:

- **marker clustering** so a dense map stays fast;
- **filtering** and a **comparison panel** (up to three borings at once);
- **boundary overlays** with labels;
- **saved views** in local storage and **CSV / GeoJSON export**;
- keyboard-accessible controls and a **Progressive Web App** baseline with
  service-worker caching, so it can be installed and used offline.

## How it works

A data pipeline normalizes the legacy sources into clean GeoJSON, validating
geometry and numeric fields up front — so the map layer can stay simple and the
explorer never chokes on a malformed record.

## Outcome

A fast, installable tool the team can use in the field or the office to explore
and compare boring data, instead of opening files one at a time.
