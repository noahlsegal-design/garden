# Noah's Garden

A 3D model of the yard you can move around and tap. Tap any plant to see what it needs this month and for the rest of the year.

## Open it

**Anywhere, on your phone or computer:** go to **https://noahlsegal-design.github.io/garden/**. Open **This week** and sign in with your own garden account (the email and password set up in Supabase). You and your partner each have your own sign-in and share one garden. On your phone, tap Share → **Add to Home Screen** for an app icon, then open it from that icon and sign in once more, since the home-screen app keeps its own sign-in.

If the app ever shows an older version after an update, pull down on the page (or reload) to refresh it.

**Your own copy on the Mac** shows changes the moment you edit a file here, before they're online:

1. In Finder, open this folder and double-click **Start Garden.command**.
   - The first time, macOS may say it's from an unidentified developer. If so, right-click the file, choose **Open**, then click **Open** again. You only need to do this once.
   - macOS may also ask whether Python can accept incoming connections. Click **Allow** if you want to open this copy on your phone at home.
2. Your browser opens the garden. A Terminal window also opens and shows two addresses (one for this Mac, one for your phone on the same Wi-Fi). Leave it open while you use the app, and close it when you're done.

### Keeping the online copy up to date

The online copy comes from this folder: it's uploaded to GitHub, which publishes it as a website. After you change something here (a plant name in `data/`, say), ask Claude to "publish the garden", and the website updates about a minute later.

Before publishing, Claude runs `node stamp-version.mjs`. It gives the app's files a new version tag in `index.html` whenever any of them changed, so phones and computers fetch all the new files together instead of mixing new ones with old ones they kept from before (which can stop the app from starting). There's nothing for you to do: `tests/version.test.mjs` fails until it's been run. If a phone does open a copy kept from just before a publish, the app reloads itself once to pick up the new version.

### Costs and privacy

GitHub and Supabase are both free at this size. The website is public like any web page: anyone with the link can see the yard and plants, but only the two of you can sign in, check things off, change plants, and see or add notes and photos. Changes made in the app (renames, confirmed IDs, finished plants, and plants added, moved, resized or removed) only show when you're signed in; the public site shows what's in `data/plants.json`. Your original photos and videos, and `NEXT-STEPS.md`, stay on this Mac and are never uploaded (the list is in `.gitignore`).

Notes and photos are private. They're kept in your Supabase project, and the photos sit in a private storage folder with no public address, so only people in the garden can see them. Each photo is made smaller on the phone before it's sent (about 1600 pixels on its long side, plus a small copy for the card, together usually well under 1 MB) and its location and camera details are removed. The free plan's 1 GB of storage holds a couple of thousand photos, and the app stops taking new photos at 900 MB. Each phone keeps the photos it has already shown, so looking at them again doesn't use any of the free plan's monthly downloads.

Supabase puts free projects to sleep after about a week of little use, and emails you first. If the app says it can't reach your garden account, sign in at supabase.com and click **Resume project**. Nothing is lost, and check-offs wait on your phone in the meantime.

## Use it

- **Move around like a map.** Drag with one finger (or the mouse) to slide around the yard. Pinch, or scroll on a computer, to zoom in on the spot under your fingers or pointer. Double-tap (or double-click) a spot to zoom in on it.
- **Turn** by twisting two fingers, or by sliding two fingers sideways. **Tilt** by sliding two fingers up or down. On a computer, use right-drag or Shift-drag. The **↺ ↻** buttons in the corner turn the view too, and **+ −** zoom.
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

Check-offs and recorded frost dates are saved to your shared garden on Supabase, so you and your partner see one list on every device. If a device can't reach it for a moment (say, at the far end of the Wi-Fi), check-offs wait on that device and save once it's back online.

### Change a plant

Open a plant's card while signed in. Under its badges:

- **Confirm ID** asks what kind of plant it is (its care, dog safety and This week jobs follow the kind) and lets you tidy its name. If the kind isn't in the list, ask Claude to add it.
- **Rename** changes its name.
- **Finished for the season** takes it off the 3D yard and out of This week. **Bring it back** undoes that.

### Edit mode: add, move, resize and remove plants

Tap **Edit** at the top right of the yard (it turns into **Done**). The bloom timeline makes way for the edit bar.

- **Move a plant:** press on it and drag. Let go where it belongs. Moving it into a different bed changes its bed too. Pressing on open ground still slides the map, and putting down a second finger sets the plant back and turns or zooms the view as usual.
- **Size, stems, or remove:** tap a plant. Type its **Height** and **Width** in feet into the boxes (or use the sliders), and the 3D plant reshapes to match. They're separate, so a plant can be tall and narrow. Height is its full-grown height, so it still looks shorter in months when it's dormant or just coming up. **Main stems or trunks** records how many it has; for now that shows on the plant's card. Until you enter your own, the sizes are the app's guess for that kind of plant. **Remove** hides it from the yard and This week without erasing it. Removed plants are listed at the bottom of **All plants**, where **Put it back in the yard** brings one back.
- **Add a plant:** tap **Add a plant**, choose its kind, name it, tap **Next: place it**, then tap the spot in the yard. It's added right away, and This week includes it: a new dahlia gets its own box in the dahlia jobs. Drag it afterwards to fine-tune.
- **Undo** in the edit bar takes back your last move, resize, removal or addition.

Changes save to the shared garden, so they show on both your phones right away. Each one is listed on the card with who made it, when, and **Undo**.

The changes sit on top of `data/plants.json` rather than changing it. Now and then, on the Mac copy (open it with Start Garden.command and sign in), go to **All plants → Save app edits into files**. It shows each change, writes them into `plants.json` (new plants go in after the others in their bed), and clears them. Then ask Claude to "publish the garden". Until it's published, the website keeps showing the changes from Supabase, so nothing flips back in between.

### Notes and photos

Every plant card has **Notes and photos**: a log of what you notice, like "June 12: thrips on dahlia #9", newest first, each with who added it. Tap **Add a note**, write what you saw or did, and tap **Add a photo** to take one with the camera or pick one from your photos. The day starts as today; change it if you're catching up. **Save note**. Photos open full size when tapped. **Delete** asks first, and takes the photo with it.

If there's no signal in the yard, the note (photo and all) waits on your phone, marked "Waiting for a connection", and saves by itself once you're back online, even if you close the app in between.

### Adding someone to the garden

1. In Supabase, go to **Authentication → Users → Add user → Create new user**, enter their email and a password, tick **Auto Confirm User**, and click **Create user**.
2. In **SQL Editor**, run `select private.add_member('their@email.com', 'Sam');` with their email and the name to show on their notes. (Running it again with a different name renames them. Without a name, notes show the start of their email.)

They can then sign in on their phone. An account that hasn't been added sees a note saying so, and can't see or change anything.

## What's in this folder

| Folder / file | What it is |
|---|---|
| `data/` | Your garden: plants, care info and yard layout. Plain text you can edit (see `data/README.md`) |
| `app/` | The app's code. `app/config.js` says which Supabase project the shared garden is saved in |
| `photos/` | Smaller copies of your photos for fast loading, with the location data removed |
| `vendor/three/` | three.js, the free 3D library the app uses (MIT license) |
| `Source/` | Your original photos, videos and reference files. The app never changes these |
| `Start Garden.command` | Double-click to run the app |
| `stamp-version.mjs` | Puts the app's version tag into `index.html` before publishing (see above) |
| `serve.py` | The tiny web server that `Start Garden.command` runs. It makes browsers check for updated files so you never get a stale version. It also does **Save app edits into files**, and with no garden account connected, it saves check-offs on the Mac |
| `supabase/setup.sql` | The setup for your garden in Supabase: who shares it, where check-offs, plant changes, notes and photos are stored, and the rules that keep them private. Safe to run again |
| `.gitignore` | The list of what stays on this Mac and is never uploaded |
| `tests/` | Automatic checks Claude runs after changes (`node tests/tasks.test.mjs`, and the same for `store`, `cloud`, `notes`, `edits`, `serve`, `shapes` and `version`) |
| `NEXT-STEPS.md` | Your plan and ready-to-paste prompts for future Claude sessions. Stays on this Mac |

After editing a file in `data/`, refresh your Mac copy to see it. The online copy updates once it's published.

## New photos

Put originals in `Source/photos/`, then ask Claude to "refresh the web photos". It re-makes the small copies in `photos/`.
