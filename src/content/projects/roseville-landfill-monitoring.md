---
title: "City of Roseville — Closed Landfill Compliance Monitoring"
client: "City of Roseville"
siteType: "Closed MSW landfill — post-closure monitoring"
status: "active"
role: "Environmental Engineer (EIT) — report author & data-evaluation lead"
startDate: "2025-01"
summary: "Author and data-evaluation lead for the semiannual compliance reports at the City of Roseville's closed, unlined landfill: groundwater, surface water and landfill gas, read against decades of record."
techniques:
  - "Groundwater monitoring"
  - "Surface water monitoring"
  - "LFG monitoring"
  - "Field instrumentation (GEM 5000, PID)"
  - "QA/QC & trend analysis"
  - "Title 27 compliance reporting"
  - "Python report tooling"
featured: true
order: 0
location: "Roseville, CA"
lat: 38.75
lng: -121.29
published: true
problem: "An unlined landfill closed in 1995 still has to show the Regional Water Board, twice a year, that its groundwater, the creek running through it and the gas at its boundary are under control."
approach: "Turn each monitoring event into a regulator-ready report: QA/QC of the lab data, trends against the multi-year record, background against compliance wells, and a Python diff that keeps last cycle's text from going stale."
outcome: "Semiannual reports that are internally consistent and defensible, submitted on schedule under the site's Title 27 monitoring program."
---
## Setting

The Roseville Landfill took the city's waste from 1967 to 1979, on 115 acres
about a mile north-east of downtown. It was closed in 1995 under a clay cover,
and the city grew up around it: Roseville Parkway now runs across part of the
old waste, and the Antelope Creek Trail crosses the site where the creek itself
still flows through, between the waste units, on its way to Dry Creek.

Like most landfills of its age, it was never lined. Three units remain, one
of them two older units now regulated as one, sitting on native ground with no
leachate collection beneath them. Chlorinated solvents turned up in the
groundwater in the late 1980s, and landfill gas once reached high levels in the
perimeter probes. Closure, together with a set of passive, wind-turbine gas
vents, was the corrective action, and the monitoring is how anyone knows
whether it is still working.

## The monitoring

The site is regulated by the **Central Valley Regional Water Quality Control
Board** under Waste Discharge Requirements and a Monitoring and Reporting
Program (Order R5-2019-0056), written under **CCR Title 27**. The network is:

- **14 groundwater monitoring wells** on site (two more off site are sampled
  voluntarily), measured quarterly for water levels;
- **three surface-water stations on Antelope Creek**, upstream, between the
  waste units and downstream;
- **nine perimeter landfill-gas monitoring locations**, most with probes at two
  depths, checked for methane, carbon dioxide and organic vapors.

Twice a year all of it comes together in a **semiannual compliance report**,
filed with the Regional Board: every result compared against its limits, the
background wells against the compliance wells, each constituent read against
years of history, and a judgment on whether the corrective action is still
doing its job.

## My role

Since January 2025 I have been the **author and data-evaluation lead** for
those reports. That means taking a field event and a stack of laboratory
results and turning them into a compliance narrative a regulator can rely on:

- **Field data.** Groundwater, surface-water and gas monitoring, with
  instruments such as the Landtec **GEM 5000** gas analyzer and a **MiniRAE
  3000 PID**.
- **Evaluation.** QA/QC of the lab data; trends against the multi-year record;
  background against compliance wells; and a close read of the constituents
  that drive the corrective-action program.
- **The report.** Tables, figures and narrative, built on a controlled report
  template, drafted for project-manager and client review, then signed by a
  professional engineer and submitted.

## Keeping a cyclic report true

A report written every six months for decades has one characteristic failure:
a sentence carried over from the last cycle that is no longer true. The table
was updated, the paragraph that describes it was not, and nothing about the
document looks wrong.

I hold the report to one rule, **diff every number against its source**, and
built a small Python tool to make that rule cheap to follow: it compares the
new report to the last one paragraph by paragraph and color-codes what
carried over, what changed and what is new, so review goes where stale text
hides. I wrote about the method in
[“Diff every number”](/notes/diff-every-number-cyclic-reports/), and the tool
is in [Tools](/tools/cyclic-report-qc-tool/).

## Skills demonstrated

Title 27 compliance monitoring and reporting; groundwater, surface-water and
landfill-gas monitoring; field instrumentation; laboratory data QA/QC and
statistical trend review; corrective-action evaluation at an unlined closed
landfill; technical writing for regulators; and Python tooling for report QC.
