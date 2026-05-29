---
title: "Reading an XRF in the Field"
description: "What a handheld XRF analyzer actually tells you during site characterization — and the field habits that keep the data defensible."
pubDate: 2026-04-18
coverImage: "xrf-field.jpg"
coverAlt: "Handheld XRF analyzer over a sampling grid"
tags: ["XRF", "Field methods", "Site characterization"]
category: "technical"
featured: true
draft: false
---

Handheld X-ray fluorescence (XRF) is one of the most useful tools in
environmental site characterization: it gives near-real-time, non-destructive
estimates of elemental concentrations in soil right where you're standing. But
"real-time" doesn't mean "no discipline" — the value of the data depends almost
entirely on how you collect it.

## What XRF measures

An XRF analyzer excites the sample with X-rays and reads the fluorescent energy
that comes back. Each element fluoresces at a characteristic energy, so the
instrument can estimate concentrations for a range of metals in seconds.

## Field habits that keep data defensible

A few practices separate screening-grade numbers from numbers a project can
actually rely on:

### Prepare the surface

Loose debris, moisture, and uneven surfaces all bias a reading. A consistent,
prepared measurement point matters more than measurement count.

### Log everything against the grid

Every reading should tie back to a known node on the sampling grid. A reading
without a location is noise. This is exactly the problem that pushed me to build
a small navigation tool — more on that in a separate post.

### Verify against the lab

XRF is a screening method. Pairing a subset of readings with laboratory
confirmation lets you understand the instrument's bias for *that* site and *that*
matrix.

```text
Field workflow (simplified):
  1. Locate grid node  →  2. Prepare surface
  3. Take reading      →  4. Log value + node ID
  5. Flag confirmation samples for the lab
```

## Why it matters

Good field discipline turns a fast screening tool into a genuine
decision-support instrument — guiding where to dig, where to sample next, and
where to stop. The instrument is only as good as the habits around it.

> Screening data collected carefully beats lab data collected from the wrong
> place.
