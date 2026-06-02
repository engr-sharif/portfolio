---
name: "Soil Sampling Planning Tool"
summary: "An interactive map for planning soil sampling at a mercury-mine Superfund site — combining current and historical data to surface data gaps and place new sample points, right in the browser."
problem: "Field teams needed a fast way to see where data already existed, spot the gaps, and plan new sample locations across a large investigation area — without standing up GIS software."
tech: ["JavaScript", "Leaflet.js", "GeoJSON", "HTML"]
repoUrl: "https://github.com/engr-sharif/sbmm-planning-tool"
screenshots: []
codeSnippet: |-
  document.getElementById('colorBySelect').addEventListener('change', function (e) {
    const analyte = e.target.value;
    samples2025.forEach(function (sample) {
      if (sample.sampled && sample.metals[analyte]) {
        const value = sample.metals[analyte];
        const rodLimit = (analyte === 'Mercury') ? 204 :
                         (analyte === 'Arsenic') ? 6.1 : 51;
        sample.color = (value > rodLimit) ? '#d63e2a' :
                       (value > 35) ? '#f0932b' : '#72af26';
      }
    });
    updateMapMarkers();
  });
codeLang: "javascript"
featured: true
order: 1
published: true
---

## The problem

Planning sampling at a large, long-running Superfund investigation means
holding a lot in your head: where samples were already taken, what they found,
where the gaps are, and where the next round should go. Doing that across
dozens of current and historical locations — on a laptop in the field, without
a GIS analyst on call — is slow and easy to get wrong.

## What I built

A **self-contained web map** (no server, just an HTML file) that loads the
current and historical sample data and lets the team:

- visualize current and historical sample locations together;
- **color-code contamination by analyte** (mercury, arsenic, antimony,
  thallium) against cleanup thresholds;
- run a **data-gap analysis** with an adjustable grid overlay;
- drop **proposed and step-out sample points** and export the plan to CSV.

## How I solved a piece of it

Color-coding is the fastest way to read a map at a glance, so the tool
re-classifies every marker against the relevant cleanup threshold whenever you
switch analytes — green / amber / red against the limit for that metal — then
repaints the map.

## Outcome

The team can plan a sampling round visually in minutes, share it as a CSV, and
walk into the field knowing exactly where the gaps are — instead of
reconstructing it from spreadsheets.
