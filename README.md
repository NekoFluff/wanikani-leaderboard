# WaniKani Leaderboard 2

A Tampermonkey userscript that adds a leaderboard to the WaniKani dashboard, so you
can track your progress against friends: levels, burn %, and SRS stage breakdown,
plus trend charts over time.

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager)
- [WaniKani Open Framework](https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549) —
  the script will prompt you to install this if it's missing

## Installation

1. Install Tampermonkey and WaniKani Open Framework (see above).
2. Open Tampermonkey's dashboard, create a new script, and paste in the contents of
   [`Wanikani Leaderboard.js`](Wanikani%20Leaderboard.js).
3. Visit your [WaniKani dashboard](https://www.wanikani.com/dashboard) — the
   Leaderboard card appears near the bottom.

There's no build step; the script is a single self-contained file.

## Features

- **Leaderboard table** — rank, avatar, level, and burn % for every user you add,
  with small delta badges showing change since your last refresh.
- **Add / remove users** via the settings gear icon; import or export your list as
  CSV from the toolbar.
- **Sort order** — level, burn %, or name, ascending or descending.
- **Charts panel** (toolbar icon) with three views:
  - _SRS Stages_ — a stacked bar comparing everyone's Apprentice/Guru/Master/Enlightened/Burned counts.
  - _Burn % Trend_ — a line chart of burn % over time, one line per user.
  - _Level Trend_ — the same, for level.
- Trend charts are built from a daily snapshot of each user's stats, recorded
  automatically on refresh — history accumulates from whenever you install the
  script (there's no way to backfill the past).

## Credits

Originally by crazyfluff, faraplay, and Dani2. Licensed under MIT.
