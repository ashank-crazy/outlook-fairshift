# Devpost submission: copy and paste

## Project name
**Fairshift: fair time-zone rotation for Outlook Calendar**

## App upgraded
**Microsoft Outlook (Calendar → Scheduling Assistant)**

## Tagline
Who's always taking the 10:30 PM call? Fairshift shares the after-hours load on recurring meetings across time zones.

## Problem statement
Global teams book recurring meetings at a time that suits headquarters, so the same people (often in India or APAC) join at 10 PM or 6 AM every week for months. Outlook's Scheduling Assistant shows free/busy in the organizer's time zone. For a recurring series, nothing tracks who keeps absorbing the inconvenience, and nothing can share it. This affects anyone on a distributed team, and it falls hardest on people far from HQ.

## Before and after
**Before (Outlook today):** The organizer picks 9:00 AM PT for a weekly sync. The Scheduling Assistant shows everyone as free, with at most a grey "outside working hours" shade. It never says that this is 10:30 PM in Bengaluru, and the recurring series stays at that time for all 26 weeks. *(Screenshot: docs/1-before-todays-outlook.png)*

**After (with Fairshift):** Each attendee's row is coloured by their own local time (work, edge, evening, late, sleep, weekend), with a local-time column. The insights panel shows that Priya carries 87% of the after-hours load (fairness score 37). One switch, **Rotate time fairly**, plans a DST-aware series that alternates 6:30 AM and 7:30 AM PT. Priya's load drops 61%, nobody joins during sleep hours, and the fairness score rises to 97. The invite explains the rotation. *(Screenshots: docs/2-fairshift-reveals-the-problem.png, docs/3-fair-rotation.png)*

## About the project (Devpost "Story" field)

### Inspiration
I'm in India, and for many people here "the global sync" means a 10:30 PM call every week. No one chose that on purpose: the organizer picked a sensible time in their own zone, the Scheduling Assistant showed everyone as free, and the series repeats forever. The calendar already knows everyone's time zone and working hours. It just never does the maths across the whole series.

### What it does
Fairshift adds a fairness layer to Outlook's Scheduling Assistant:
- **Local-time lens:** every attendee's row is painted in their own local time, including date-line weekends (Friday afternoon in the US is Saturday in Sydney).
- **Burden score:** every minute of every occurrence is scored in the attendee's own time zone with real DST rules (late night ×4, sleep ×10).
- **Fairness score (0–100):** 100 means the most-burdened person carries no more than the fairest schedule these time zones physically allow.
- **Rotate time fairly:** one switch plans the series, rotating between up to 3 times so the after-hours load is shared.
- **Protect sleep:** nobody is ever scheduled between 11 PM and 6 AM.
- **Fairness ledger:** optionally counts late calls people already take in other meetings, so the rotation spares them.
- **DST-aware series:** the US, UK and India change clocks on different dates, so every occurrence is re-scored.
- **Self-explaining invite:** the invitation tells attendees the time rotates and shows each person's local time.
- **Before/after toggle** and an 8-step **guided demo** built into the prototype.

### How I built it
A dependency-free JavaScript engine (`js/fairshift.js`) uses the browser's `Intl` time-zone database to convert each candidate time into every attendee's wall-clock time, per occurrence, in 15-minute slices. The planner:
1. Prunes times that would wake anyone up.
2. Keeps the Pareto front of candidate times.
3. Tries every rotation of 1–3 times, greedily assigning each occurrence to keep the most-burdened person's running total lowest (minimax), with a smaller weight on total burden.

The full search runs in about 10 ms. The UI is a Fluent-inspired recreation of Outlook's event composer and Scheduling Assistant in vanilla HTML, CSS and JS. Engine tests run on Node's built-in test runner.

### Challenges I ran into
- **Defining "fair".** Pure equality (Gini) would inconvenience the person in the middle time zone for no benefit. I switched to minimax, protecting the worst-off person first, and defined the score against the best achievable schedule.
- **Time zones.** DST transitions on different dates, half-hour offsets (India) and the date line all needed real per-occurrence calculation; a fixed offset table would have been wrong.

### Accomplishments that I'm proud of
- Fixed 9 AM PT: fairness **37**, with Priya carrying 87% of the load. Fair rotation: **97**, Priya's load **−61%**, and zero sleep-hour joins.
- In a four-city "follow the sun" team, fairness goes from **34 → 96**.
- The feature uses data Exchange already has, so it could ship.

### What I learned
Fairness across time zones is a scheduling problem over the whole series, not a single-meeting one. Showing people their burden next to everyone else's makes the conversation easy.

### What's next / how Microsoft could roll it out
Everything Fairshift needs already exists in Microsoft Graph:
- `mailboxSettings.workingHours` for each attendee's time zone and hours
- `getSchedule` / `findMeetingTimes` for free/busy
- recurring events with modified occurrences to store a rotating series

Rollout:
1. Ship the local-time lens as a read-only overlay.
2. Add *Rotate time fairly* as an opt-in toggle for recurring meetings in Targeted Release.
3. Connect the fairness ledger to Viva Insights' after-hours collaboration data, visible only to the organizer and the attendee.

## Built with (tags)
javascript, html5, css3, intl-api, node.js, github-pages, claude, claude-code

## How it works (tools, APIs, languages, AI models)
- Languages: JavaScript, HTML, CSS
- APIs: ECMAScript `Intl.DateTimeFormat` time-zone database (DST-aware local times)
- Testing: Node.js built-in test runner (`npm test`, 7 tests)
- Hosting: GitHub Pages
- AI: Claude Code (Anthropic Claude Opus 5.5) used as an AI pair-programmer
- Production path (documented): Microsoft Graph `mailboxSettings.workingHours`, `getSchedule`, recurring events with modified occurrences

## Links
- Source code: https://github.com/ashank-crazy/outlook-fairshift
- Live demo: https://ashank-crazy.github.io/outlook-fairshift/
- Demo video: *(paste YouTube/Loom link)*

---

# Demo video script (about 2:30, under the 3:00 limit)

**Setup:** open the live demo full-screen in Chrome (Cmd+Ctrl+F) at about 1470 px wide. Record with QuickTime (File → New Screen Recording) or Loom, with your mic on. Click **▶ Guided demo** and use the tour's **Next** button while you narrate. Or drive it by hand with the shots below.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Title bar, "Today's Outlook" selected | "This is Fairshift, a feature Outlook Calendar is missing. I'm in India, and on global teams the weekly sync is often at 10:30 at night, every week, forever." |
| 0:15–0:35 | Today's Outlook grid, 9 AM selected | "Here's the Scheduling Assistant today. Maya in San Francisco books a weekly sync at 9 AM. Everyone's free. Looks perfect. But Outlook only shows free/busy in *her* time zone." |
| 0:35–1:00 | Click **With Fairshift ✦** | "With Fairshift, every row is painted in that person's own local time. 9 AM for Maya is 10:30 PM for Priya in Bengaluru, running into her sleep hours, for 26 meetings. The insights panel shows Priya carries 87% of the team's after-hours load. Fairness score: 37." |
| 1:00–1:30 | Toggle **Rotate time fairly**; point at the rings, bars and chart | "One switch. Fairshift searches every half-hour and every rotation of up to three times. It protects the most-burdened person first and keeps everyone out of sleep hours. It alternates 6:30 and 7:30 AM Pacific. Priya's load drops 61%, the organizer shares it, and fairness goes to 97, as fair as these time zones physically allow. The chart shows the burden piling up with a fixed time versus staying balanced with rotation." |
| 1:30–1:50 | Scroll the series list to the DST note; click a March meeting | "It's DST-aware. The US and UK change clocks on different dates in March, so every single occurrence is re-scored." |
| 1:50–2:10 | Example team → *Platform team · SF, London, Bengaluru, Sydney*; tick **Fairness ledger** | "For a follow-the-sun team it rotates across the world. With the fairness ledger it also remembers who already takes late calls in other meetings, and spares them. Here fairness goes from 34 to 96." |
| 2:10–2:25 | Click **Send** → invite preview | "The invite explains the rotation and shows each person's local time, so nobody is surprised." |
| 2:25–2:40 | README section "How Microsoft could ship it" (optional) | "It uses data Exchange already has (working hours, time zones and recurring events with exceptions) through Microsoft Graph, so Outlook could ship it as an opt-in toggle. Fairshift: share the late calls." |

Upload to YouTube as **Unlisted** (or Loom public link) and paste it into Devpost.
