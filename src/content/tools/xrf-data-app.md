---
name: "XRF Data App"
summary: "A browser app that reconciles handheld-XRF field readings against a master tracker — linking thousands of readings to samples for browsing, QC, and export."
problem: "Two XRF guns produced raw CSV exports that had to be matched to a master spreadsheet by serial number and reading number — tedious, slow, and error-prone by hand."
tech: ["JavaScript", "Python", "openpyxl", "CSV", "HTML"]
repoUrl: "https://github.com/engr-sharif/XRF"
screenshots: []
codeLang: "javascript"
featured: true
order: 2
published: true
---

## The problem

A boulder-sampling campaign generated XRF readings from **two different guns**,
each exporting its own CSV. Those readings had to be reconciled against a master
tracker spreadsheet — matched by gun serial number and reading number — before
anyone could actually use the data. Done by hand across thousands of readings,
that's both slow and a reliable source of mistakes.

## What I built

A static web app that ingests the raw gun CSVs and the master tracker and gives
the team one queryable interface over all of it:

- a **drill-down browser** (areas → grids → boulders → individual readings);
- a **boulder detail view** with tabs for surface XRF, depth XRF, powder/lab
  data, and QC;
- a **customizable element picker** (8 common elements by default, expandable to
  45);
- **reconciliation** of unlinked readings, plus CSV export by reading range or
  sample ID.

## How it works

Reading-to-boulder linking uses the tracker's serial-number + reading-number
columns as the canonical mapping, with CSV fallback validation to catch
readings that don't line up — so QC problems surface immediately instead of
silently flowing into the dataset.

## Outcome

Field data that used to live in disconnected spreadsheets became a single,
browsable, exportable record — with the linking and QC handled automatically.
