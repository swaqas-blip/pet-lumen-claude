# PetLumen prototype

PetLumen helps first-time puppy owners manage their pet's everyday health by connecting a digital health profile, symptom history, and personalized wellness guidance in one place.

This is the working prototype for MGMT 485 (Prototype Assignment, Steps 1–3). It is a static web app with no build step and no server-side code. All data is saved in the browser (IndexedDB), so changes stay after a refresh.

## Run it

**Easiest:** download `PetLumen.html` from this repository and double-click it. It opens in your web browser, and you don't need to install anything.

**For development:** serve the folder with any static file server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

After changing anything in `css/` or `js/`, run `node tools/build-single-file.js` to rebuild `PetLumen.html`.

## The three core features

| Feature | What the user can do | Where |
|---|---|---|
| **Pet Health Profile** | Create and update a profile (species, breed, size, birth date, weight, spay/neuter status, medications, allergies, conditions, clinic, microchip). Add veterinary records with an optional PDF or photo upload. | My pets → pet → *Overview*, *Records*, *Edit profile* |
| **Symptom Tracking** | Log a dated symptom with area, 1–5 severity, duration, and optional warning signs. Review everything on a month-grouped health timeline next to records. | *Symptoms*, *Timeline* |
| **Wellness Guidance** | Rule-based care information matched to the pet's profile and recent log. Each item shows which profile details it used and links to its public source. Warning signs and higher-severity entries move to the top with "contact a veterinarian" items. | *Guidance* |

There is also a printable **Vet summary** (profile, last 30 days of symptoms, recent records, and the owner's own questions) to support veterinary conversations.

## Build requirements covered

- **Working forms that persist.** Profiles, records, uploads, and symptom entries are saved to IndexedDB and survive a refresh.
- **1,000 synthetic owner accounts.** These are generated on first load: `Synthetic Owner 0001`–`1000`, with `@example.test` emails, about 1,350 linked pets (weighted toward puppies under one year), records, symptom entries, and around 12,000 activity events. Every synthetic account, pet, and page is labeled **Synthetic**. The *Synthetic data* page lets you browse and search them, open one, export them as JSON, or reset everything.
- **Activity history.** Account creation, profile creation and updates, record additions and uploads, symptom entries, guidance requests, and vet summaries are each stored with the user, pet, action, detail, and timestamp. You can see them under *Activity*.
- **Out of scope.** The app has no shopping, community chat, payments, or live veterinary integrations. It never promises diagnosis, treatment, or a 24/7 veterinary service, and every guidance page says so.

## Five-minute demo script

1. **Minutes 0–2.** Choose *Continue as Demo Owner*, or create an account. Use *Add a pet* to create a profile, then open *Records*, add a record, and attach a file. Refresh the page: the profile, record, and file are still there.
2. **Minutes 2–3.** In *Symptoms*, log a dated entry. Open *Timeline* to see it next to earlier observations. The demo owner's sample puppy, Maple, already has two vaccine records and two earlier symptoms.
3. **Minutes 3–5.** Open *Guidance* to show the profile details it uses and its sources. Then open *Activity* to show the saved interactions.

## Guidance sources

Guidance summarizes public recommendations from AAHA (canine vaccination, life stage, and dental guidelines), AAHA/AAFP (feline guidelines), WSAVA (nutrition), the American Heartworm Society, CAPC, AVSAB (puppy socialization), the ASPCA Animal Poison Control Center, and AVMA. Some links point to the organization's home page rather than the exact document. **The team should check each statement and link before user testing.** The rules live in `js/guidance.js`.

## Validation caveats (from Step 1)

The synthetic users and their activity are test data, not customer validation. The survey slides report 10 responses, but only four raw response sets have been verified. The first-time puppy owner segment still needs direct testing: ask target owners to complete the three demo tasks without coaching, and record completion, confusion, and comments.

## Project structure

```
index.html          App shell
css/styles.css      Brand styles (navy, teal, gold accent), responsive and print layouts
assets/logo.svg     Paw-and-light-rays mark
js/store.js         Data layer: IndexedDB persistence, activity logging, file storage
js/seed.js          Synthetic dataset + demo owner
js/guidance.js      Rule-based wellness guidance with sources
js/app.js           Router, views, and event handlers
tests/demo-flow.test.js  End-to-end check of the demo script (Playwright)
tools/build-single-file.js  Bundles everything into PetLumen.html
PetLumen.html       Single-file version of the app (generated)
```

Run the end-to-end test with `node tests/demo-flow.test.js`. It needs the `playwright` package and Chromium.
