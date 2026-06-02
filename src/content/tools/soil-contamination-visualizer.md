---
name: "Soil Contamination Visualizer"
summary: "A self-contained figure tool that loads GeoJSON soil data and renders contamination maps and figures, filtered live by analyte, sampling round, and threshold."
problem: "Producing consistent contamination figures from sampling data was slow and manual — the team needed quick, filterable visuals they could regenerate as data changed."
tech: ["JavaScript", "GeoJSON", "HTML"]
repoUrl: "https://github.com/engr-sharif/ABP"
screenshots: []
codeSnippet: |-
  const getFilteredFeatures = () => {
    const dsFilter = Array.from(document.querySelectorAll('.dsFilter:checked'))
      .map((cb) => cb.value);
    return DATA.features.filter((f) =>
      dsFilter.includes(f.properties.round.toString()) &&
      f.properties.sampled === true &&
      (f.properties.Hg || 0) > parseInt(document.getElementById('fThr').value)
    );
  };
codeLang: "javascript"
featured: false
order: 3
published: true
---

## The problem

Contamination figures get regenerated constantly as new sampling rounds come
in. Building them by hand each time is slow, and small inconsistencies creep in
between versions.

## What I built

A **single-file visualizer** that reads the sample data as GeoJSON and renders
maps and figures that update live as you change the filters — sampling round,
"sampled only," and a mercury threshold slider — with statistics recomputed on
the fly.

## How I solved a piece of it

A single filter function is the heart of it: it reads the active dataset
checkboxes and the threshold input, then returns only the sampled features above
that threshold. Everything the figure draws — points, counts, stats — derives
from that one filtered set, so the whole view stays consistent as you adjust
controls.

## Outcome

Figures that used to be hand-assembled became a few clicks, consistent across
versions, and easy to regenerate whenever the data changed.
