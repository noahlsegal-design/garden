# Supabase setup for the garden

Supabase is the online database behind the garden. It saves check-offs, plant changes, notes and photos, and the photo checks (health checks and the bug catalog).

**`setup.sql`** creates the tables and the security rules. Paste all of it into Supabase's **SQL Editor** and click **Run**. It's safe to run again, and you need to run it again whenever it changes.

## Photo checks: how they work

The photo checks use the Claude app on your phone and your own Claude plan. There's no separate Claude key and nothing extra to pay.

1. In the garden app, tap **Check its health** (or **Found a bug on it?**) on a plant's card, or **Photo check** at the top. Pick the photo and the plant, then tap **Next: ask Claude**. The app saves the photo with a check that's "waiting".
2. Tap **Open Claude**. The app copies a prompt (the check's id, the plant, and the garden's details) and opens Claude. If the prompt isn't already filled in, paste it. Attach the same photo and send.
3. Your **Plant Diagnostics** or **Friend or Foe** skill answers as usual, then saves the answer into the garden through the **Supabase connector**, with one command: `select private.record_check(...)`.
4. Back in the garden app, the check fills in. You'll find it in the **Health timeline** or the **bug catalog**, and on the plant's card.

## Setting it up (one time, about 15 minutes, on your computer)

### 1. Run `setup.sql` again

In Supabase, open **SQL Editor**, paste all of `supabase/setup.sql`, and click **Run**. This adds the `photo_checks` table and the `record_check` command. Your existing data stays as it is.

### 2. Connect Supabase to Claude

At **claude.ai** on your computer, go to **Settings → Connectors** and click **Add custom connector**:

- Name: `Supabase (garden)`
- URL: `https://mcp.supabase.com/mcp?project_ref=ydnnwuneimhrqymkkqtu&features=database`

Click **Add**, then **Connect**, sign in to Supabase, and allow access. The address keeps the connector to this one project and to its database tools only. A connector set up on claude.ai also works in the Claude app on your phone.

(Alternatively, **Browse connectors → Supabase** adds Supabase's own listing. It works too, but it can reach every project in your Supabase account.)

What this allows: the connector signs in as you, the project's owner, so Claude could in principle change anything in the garden's database. The skills only allow one command, `select private.record_check(...)`, which can only add or fill in a photo check. Claude asks before each save, and that's your check: approve it when it's that one command.

### 3. Add the two skills

At **claude.ai**, go to **Settings → Capabilities**. Make sure **Code execution and file creation** is on (skills need it). Then, under **Skills**:

- **Plant Diagnostics:** delete the one you have, then **Upload skill** and choose `skills/plant-diagnostics.zip` from this folder. It's your skill unchanged, plus a garden context section and a final "Saving to Noah's garden app" step.
- **Friend or Foe:** **Upload skill** and choose `skills/friend-or-foe.zip`.

The readable versions are `skills/plant-diagnostics/SKILL.md` and `skills/friend-or-foe/SKILL.md`. To change a skill, edit its SKILL.md, ask Claude to rebuild the zip, and upload it again.

### 4. Try it

On your phone, open the garden and run a health check on any plant. The first time Claude saves, it asks permission to use the Supabase tool: allow it.

## If something doesn't work

- **"run supabase/setup.sql again"** in the garden app: step 1 is missing.
- **Claude says it can't save** or doesn't have the Supabase tool: check that the connector from step 2 is connected (in the Claude app, it's under the "+" or tools menu in a chat), then send "save it to the garden" in the same chat.
- **Claude answered but didn't try to save:** the skill may not be the new one (step 3). Send "save it to the garden" in the same chat.
- **The check stays "Waiting"** after Claude says it saved: pull the app back into view, or close and reopen the Photo check screen.
- **Open Claude doesn't fill in the prompt:** that's expected on some phones. The prompt is copied, so paste it into the message box.
