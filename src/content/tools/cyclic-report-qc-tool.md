---
name: "Cyclic Report QC Tool"
summary: "A Python utility that diffs a new regulatory report against the prior cycle paragraph-by-paragraph and color-codes changes, so stale carryover gets caught before submittal."
problem: "Recurring compliance reports silently carry stale, copy-pasted values from the previous cycle — a quality risk that's invisible on a clean read."
tech: ["Python", "Document diffing", "QA/QC"]
screenshots: []
codeSnippet: |-
  for para in new_report:
      match = closest_paragraph(prior_report, para)
      if identical(para, match):
          tag(para, "carryover  → confirm still true")
      elif similar(para, match):
          tag(para, "updated     → verify the change")
      else:
          tag(para, "new/pending → review")
codeLang: "python"
featured: false
order: 5
published: true
---

## The problem

A lot of environmental work runs on **cyclic reports** — the same compliance
document, every quarter or six months, for years. The failure mode isn't
dramatic: it's a value from the *last* cycle that should have been updated this
cycle and wasn't. The document still reads cleanly; it just isn't true anymore.

## What I built

A small Python tool that diffs the new report against the previous cycle
**paragraph by paragraph** and color-codes the result — carryover, updated, or
new/pending — so review focuses on the lines most likely to be stale instead of
re-reading the whole document with fading attention.

## How it works

It doesn't decide whether the report is *right* — judgment stays with the
engineer. It makes the carryover **visible**, which is exactly where the cheap
errors hide.

## Outcome

A faster, harder-to-skip QC pass on recurring reports — catching stale values
before a project manager, client, or regulator ever sees them.
