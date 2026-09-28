---
title: "City of Roseville — Closed Landfill Compliance Monitoring"
client: "City of Roseville"
siteType: "Closed MSW landfill — post-closure monitoring"
status: "active"
role: "Deputy project manager (DPM)"
startDate: "2025-01"
summary: "Deputy project manager for Title 27 compliance at the City of Roseville's closed, unlined landfill: coordinating the semiannual groundwater sampling, running the landfill gas monitoring, and helping write the reports the Regional Water Board relies on."
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
approach: "Run each semiannual cycle end to end: coordinate the groundwater sampling, monitor the landfill gas, then turn the results into a regulator-ready report, with a Python diff that keeps last cycle's text from going stale."
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

I am the **deputy project manager (DPM)** for the City's compliance program
at the landfill, keeping it in line with **Title 27** and the site's
Monitoring and Reporting Program, for groundwater and for landfill gas. Each
six-month cycle:

- **Groundwater.** I coordinate the semiannual groundwater sampling event:
  scheduling, the sampling team, laboratory analyses and deliverables.
- **Landfill gas.** I conduct the semiannual landfill gas monitoring at the
  perimeter probes, with a Landtec **GEM 5000** gas analyzer and a **MiniRAE
  3000 PID**.
- **Reports.** I help draft the semiannual and annual monitoring reports:
  QA/QC of the laboratory data, trends against the multi-year record,
  background against compliance wells, and the corrective-action picture,
  prepared for review, certification by a professional engineer, and
  submittal.
- **The project.** As DPM, I help keep the schedule, scope and deliverables
  on track for the City.

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

Deputy project management of a Title 27 compliance program; coordinating
groundwater sampling; landfill gas monitoring and field instrumentation;
laboratory data QA/QC and trend review; corrective-action evaluation at an
unlined closed landfill; technical writing for regulators; and Python tooling
for report QC.
