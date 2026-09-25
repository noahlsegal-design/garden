# Noah's Garden

A 3D model of the yard you can move around and tap. Tap any plant to see what it needs this month and for the rest of the year.

## Open it

**Anywhere, on your phone or computer:** go to **https://noahlsegal-design.github.io/garden/**. Open **This week** and sign in with your garden account (the email and password you set up in Supabase). On your phone, tap Share → **Add to Home Screen** for an app icon, then open it from that icon and sign in once more, since the home-screen app keeps its own sign-in.

If the app ever shows an older version after an update, pull down on the page (or reload) to refresh it.

**Your own copy on the Mac** shows changes the moment you edit a file here, before they're online:

1. In Finder, open this folder and double-click **Start Garden.command**.
   - The first time, macOS may say it's from an unidentified developer. If so, right-click the file, choose **Open**, then click **Open** again. You only need to do this once.
   - macOS may also ask whether Python can accept incoming connections. Click **Allow** if you want to open this copy on your phone at home.
2. Your browser opens the garden. A Terminal window also opens and shows two addresses (one for this Mac, one for your phone on the same Wi-Fi). Leave it open while you use the app, and close it when you're done.

### Keeping the online copy up to date

The online copy comes from this folder: it's uploaded to GitHub, which publishes it as a website. After you change something here (a plant name in `data/`, say), ask Claude to "publish the garden", and the website updates about a minute later.

### Costs and privacy

GitHub and Supabase are both free at this size. The website is public like any web page: anyone with the link can see the yard and plants, but only you can sign in and check things off. Your original photos and videos, and `HANDOFF.md`, stay on this Mac and are never uploaded (the list is in `.gitignore`).

Supabase puts free projects to sleep after about a week of little use, and emails you first. If the app says it can't reach your garden account, sign in at supabase.com and click **Resume project**. Nothing is lost, and check-offs wait on your phone in the meantime.

## Use it

- **Move around like a map.** Drag with one finger (or the mouse) to slide around the yard. Pinch, or scroll on a computer, to zoom in on the spot under your fingers or pointer. Double-tap (or double-click) a spot to zoom in on it.
- **Turn and tilt** by sliding two fingers, or with right-drag or Shift-drag on a computer. The **↺ ↻** buttons in the corner turn the view too, and **+ −** zoom.
- **Views** jumps to a vantage point: the deck (the start view), straight above like a map, the back corner, the shed, or across the lawn. It can also zoom to one bed. Trees that block your view step aside, so you can see what's behind them.
- **Reset view** brings you back to the starting view.
- **Tap a plant** to open its card. The card shows what the plant is doing this month, the care due now, dog safety, the rest of the year, cut-flower tips, wildlife value and sources.
- **Month buttons** along the top change the whole yard. Annuals disappear in winter, dahlias show as crates (tubers in storage), shrubs go bare and trees change color. The small pink dot marks the current month.
- **All plants** opens a searchable list with filters: area, unconfirmed ID, toxic or maybe toxic to dogs, and needs attention. **Show these in the yard** zooms to the matching plants and puts colored rings around them.
- You can bookmark a plant. The address changes to `…#plant=pb-05` when a card is open.

### This week

The dark **This week** button shows what to do now. The number on it counts what's still open.

- **To do** lists one-time jobs, each with the date it's due by. Tap a job for the full instructions, its sources, and **Show in yard**, which zooms to those plants and rings them. Tap the box to check it off.
- A job that covers several plants has a box for each one inside, so you can tick off each dahlia as you dig it. The job's own box ticks them all at once. Once some are done, **Show in yard** rings just the ones still to do.
- **Every week** holds the rounds that repeat: watering, picking, pest checks, and deadheading and weeding. Check off a whole round, or open it and check plants one at a time. Rounds start fresh every Monday.
- **Heads-up** holds reminders with nothing to check off, like the poison ivy warning.
- **Coming up** shows what starts in the next 4 weeks. Tap a date to jump to that week, or use the arrows at the top to look at any week.
- The **frost note** at the top follows frost season. When your first frost comes, tap **Record first frost**. After-frost jobs, like cutting peonies to the ground and digging dahlias a week later, then use your real date instead of the typical Oct 15.
- Bookmark `…/#tasks` to open straight to this list.

Check-offs are saved to your garden account on Supabase, so every device you sign in on shares one list. If a device can't reach it for a moment (say, at the far end of the Wi-Fi), check-offs wait on that device and save once it's back online.

## What's in this folder

| Folder / file | What it is |
|---|---|
| `data/` | Your garden: plants, care info and yard layout. Plain text you can edit (see `data/README.md`) |
| `app/` | The app's code. `app/config.js` says which Supabase garden account check-offs are saved to |
| `photos/` | Smaller copies of your photos for fast loading, with the location data removed |
| `vendor/three/` | three.js, the free 3D library the app uses (MIT license) |
| `Source/` | Your original photos, videos and reference files. The app never changes these |
| `Start Garden.command` | Double-click to run the app |
| `serve.py` | The tiny web server that `Start Garden.command` runs. It makes browsers check for updated files so you never get a stale version. With no garden account connected, it saves check-offs on the Mac |
| `supabase/setup.sql` | The one-time setup for your garden account: where check-offs are stored, and the rules that keep them private |
| `.gitignore` | The list of what stays on this Mac and is never uploaded |
| `tests/` | Automatic checks Claude runs after changes (`node tests/tasks.test.mjs`, and the same for `store` and `cloud`) |
| `NEXT-STEPS.md` | Your plan and ready-to-paste prompts for future Claude sessions. Stays on this Mac |

After editing a file in `data/`, refresh your Mac copy to see it. The online copy updates once it's published.

## New photos

Put originals in `Source/photos/`, then ask Claude to "refresh the web photos". It re-makes the small copies in `photos/`.
