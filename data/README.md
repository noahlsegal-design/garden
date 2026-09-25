# Garden data

These files are the app's whole memory of the yard. They're plain text, so you can open them in any text editor (TextEdit works; VS Code is nicer) to fix a name or move a plant.

| File | What's in it | Edit it when… |
|---|---|---|
| `plants.json` | One entry per plant in the yard: name, where it is, ID confidence, photos, current issues | You confirm an ID, rename a plant, add an issue, or move a plant |
| `species.json` | Care info for each *kind* of plant (all 9 peonies share one "peony" entry): month-by-month care, dog toxicity, wildlife value, cut-flower tips, sources | Care advice changes. One edit updates every plant of that kind |
| `layout.json` | Beds, fences, shed, etc. for the 3D view, plus frost dates and zone | You measure something, or your soil-test zones need mapping |
| `checkoffs.json` | Your This week check-offs and recorded first-frost dates. The app creates it the first time you check something off | Never. The app keeps it up to date |

## Common edits

**Confirm a plant's ID** (in `plants.json`): find it by its `label` (for example `"#26"`), then change `"name"`, set `"idConfidence": 100` and `"confirmedByOwner": true`. If it turns out to be a different kind of plant, change `"speciesId"` to one of the `id` values in `species.json`.

**Move a plant:** change its `"position"`. Units are feet. `x` runs left (negative) to right (positive) as you face the yard from the deck, and `z` is how far out from the deck edge it is.

**Mark a problem:** add text to `"issues"`, for example `"issues": ["Thrips on flowers"]`, and set `"needsAttention": true`.

**Mark a plant finished** (for example, a crop that's done for the season): add a line like `"finished": "2026-09-24",` under its `"name"`. From that date it leaves the 3D yard and This week, and its card says it's finished. Delete the line to bring it back. Cucumbers and squash are marked this way.

## How care becomes "This week" tasks

Each entry in a plant kind's `"care"` list (in `species.json`) shows up in **This week** during the months it lists:

- **Water, harvest and pest** entries go into the weekly rounds (Watering, Picking & cutting, Pest & disease check). They start fresh every Monday.
- **Everything else** is a one-time job for its stretch of months. Once you check it off, it stays done until those months come around again.

A few optional fields change that. Put them after `"text"`, with a comma after the line before:

| Field | What it does | Example in the data |
|---|---|---|
| `"repeat"` | `"weekly"`, `"monthly"` or `"once"`, overriding the rule above | Deadheading is `"weekly"`, and checking stored dahlia tubers is `"monthly"` |
| `"tip": true` | A reminder with no checkbox. It shows under Heads-up | The poison ivy warning |
| `"after"` | Waits for one of the dates below | Peony cleanup: `"after": "firstFallFrost"` |
| `"afterDays"` | How many days to wait after that date | Dahlia digging: `"afterDays": 7` |
| `"before"` | Stops at one of the dates below | Basil harvest: `"before": "firstFallFrost"` |

The dates are `lastSpringFrost`, `safePlantingDate`, `earlyFrostWatch`, `firstFallFrost` and `hardFreeze`. They're typical dates, written `"MM-DD"`, in `layout.json` → `site`. When you record your real first frost in the app, it replaces `firstFallFrost` for that year.

If you reword a care entry, the app treats it as a new task, so a check-off on it this season goes away. One-time jobs have a check-off for each plant they cover, so adding a plant to a kind adds a box to that kind's jobs.

## Rules that keep the app working

- Keep the quotes, commas and brackets exactly as they are. A missing comma is the most common way to break a JSON file. If the app stops loading after an edit, that's usually why, and Claude can find it quickly.
- Anything with `idConfidence` under 50 shows an "unconfirmed" badge.
- Two distances are measured (deck to shed ≈ 27.5 ft, left fence ≈ 63 ft 8 in). Everything else is estimated from photos and scaled to fit those two.
