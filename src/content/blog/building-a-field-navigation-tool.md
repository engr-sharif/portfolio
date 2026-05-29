---
title: "Building a Field-Navigation Tool for Grid Sampling"
description: "Why I built a lightweight tool to find sampling-grid nodes in the field, and what it changed about how the team collects data."
pubDate: 2026-05-09
coverImage: "field-tool.jpg"
coverAlt: "Sampling grid overlaid on a site map"
tags: ["Tools", "Grid sampling", "Field navigation"]
category: "professional"
relatedProject: "sulphur-bank-mercury-mine"
featured: true
draft: false
---

On grid-based sampling work, a surprising amount of field time goes into one
unglamorous task: *standing in the right spot.* Predetermined sample nodes look
tidy on a map and much less tidy on uneven terrain with no obvious landmarks.

## The problem

A sampling plan defines nodes on a grid. In the field, finding each node by eye
— or by pacing from a reference point — is slow and inconsistent. Inconsistent
positioning means inconsistent data, which undermines the whole point of a
systematic grid.

## The approach

I built a lightweight navigation tool that takes the planned grid and helps the
team walk directly to each node, then confirm they're standing close enough
before logging a reading. The goals were simple:

- **Fast** — usable with gloves, in sun, without a manual.
- **Offline-friendly** — field sites rarely have reliable signal.
- **Honest about accuracy** — show how close you actually are.

### What it changed

Two things improved immediately: the time spent orienting between nodes dropped,
and the *consistency* of where samples were taken went up. Both feed directly
into more defensible data.

## Why an engineer should build tools

Most of environmental engineering isn't code — but small, targeted software can
remove real friction from fieldwork. Knowing enough to build the tool yourself
means you can fix the actual problem instead of working around it.

```js
// The core idea, simplified: distance to the nearest planned node.
function nearestNode(position, nodes) {
  return nodes
    .map((n) => ({ node: n, meters: haversine(position, n) }))
    .sort((a, b) => a.meters - b.meters)[0];
}
```

The tool itself is modest. The mindset behind it — treat field friction as a
solvable engineering problem — is the part worth keeping.
