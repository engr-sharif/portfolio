---
title: "The 'diff every number' rule: catching stale carryover in cyclic reports"
description: "Recurring regulatory reports fail QC at the copy-paste step. Here's the paragraph-diff workflow I use to catch it — and the small tool that automates it."
pubDate: 2026-05-29
tags: ["Data QA", "Compliance reporting", "Automation"]
category: "technical"
relatedProject: "roseville-landfill-monitoring"
featured: true
draft: false
---

A lot of environmental work runs on **cyclic reports** — the same compliance
document, produced every quarter or every six months, for years. Post-closure
landfill monitoring is a classic example: a semiannual report on groundwater,
surface water, and landfill gas, built on a controlled template that mostly
stays the same while the numbers underneath it change.

That structure is efficient. It's also where quality quietly fails.

## Where cyclic reports break

The failure mode isn't dramatic. It's a sentence from the *last* cycle that
should have been updated this cycle and wasn't:

- A value carried over from the previous event because someone updated the table
  but not the paragraph that references it.
- A "no exceedances were observed" line that's still true — or quietly isn't.
- A date, a well ID, or a trend statement that no longer matches the current
  data.

None of these throw an error. The document still reads cleanly. It just isn't
*true* anymore — and in a regulatory submittal, that's the failure that matters.

## The rule: diff every number against its source

The discipline I hold to is simple to state and tedious to do by hand: **every
value in the narrative gets checked against its source for this cycle — not
assumed correct because it was correct last time.** Tables against lab reports,
narrative against tables, trend statements against the multi-year record.

Done manually across a long report, that's exactly the kind of repetitive task
where attention erodes near the end — right where carryover errors hide.

## Automating the boring part

So I built a small **Python tool** that does the first pass for me. It diffs the
new report against the previous cycle's template **paragraph by paragraph** and
color-codes the result:

- **Unchanged** text — carried over from last cycle (verify it *should* be
  unchanged).
- **Updated** text — changed this cycle (verify the change is correct).
- **New / pending** text — added or flagged for review.

```text
For each paragraph in new_report:
  match = closest_paragraph(prior_report)
  if identical(paragraph, match):      tag = "carryover  → confirm still true"
  elif similar(paragraph, match):      tag = "updated     → verify change"
  else:                                tag = "new/pending → review"
```

It doesn't decide whether the report is *right* — judgment stays with the
engineer. What it does is make the carryover **visible**, so the review focuses
on the lines most likely to be stale instead of re-reading the whole document
with fading attention.

## Why it matters

A compliance report has to survive project-manager review, client review, PE
certification, and a regulator. The cheapest place to catch an error is before
any of them see it. "Diff every number" is the habit; the tool just makes the
habit faster and harder to skip.

The broader point: a lot of engineering quality lives in unglamorous, repetitive
review steps. Knowing enough to automate the repetition means you spend your
attention where judgment is actually required.
