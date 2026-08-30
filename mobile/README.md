# SideQuest ATX · iPhone app

Native capture app for the SideQuest ATX map. Expo SDK 57, React Native, TypeScript. Built from Windows on a cloud macOS runner: an unsigned .ipa from GitHub Actions for your own phone (Sideloadly), or EAS to TestFlight when other people need it.

**What it does**

- **Report a hazard**: rear camera, GPS locked at the instant the shutter fires (best fix of the last 12 s, with the accuracy radius shown live), compass heading, then a draggable pin on Apple Maps with the accuracy ring. Duplicate check against everything already on the phone (15 m / 40 m rules, same as the site). Type + severity, a line of context, done.
- **Every photo carries its own location.** The JPEG's EXIF gets `GPSLatitude/Longitude`, altitude, `GPSImgDirection` (which way the camera faced), `GPSHPositioningError` (the ± metres), `DateTimeOriginal`, and a `UserComment` with the report id. If the pin is nudged, the file is rewritten before it is saved. Photos go into a **"SideQuest ATX" album in Photos** (with the tag) and into the app's own folder.
- **Glasses Walk** (Meta Ray-Ban glasses, or any camera without GPS): the phone records a background GPS trail while it sits in your pocket; you shoot with the glasses' capture button; afterwards the app finds the photos taken during the walk in your camera roll and places each one on the trail by its timestamp. Inspired by Cascade's glasses companion: the phone is the sensor hub, the glasses are eyes and a button. No Meta SDK, no extra app.
- **Quest Drive**: passenger-seat interval capture (tap / 5 s / 10 s) with a GPS trail, batch dedup, review list, resumable if interrupted.
- **Reports**: list, detail (map, priority breakdown identical to the portal's `rank.ts`, "check the file's GPS tag" read-back), moderator status changes, 311 ticket, resolve-with-after-photo (enforced: no after-photo, no "resolved"), delete.
- **Export**: GeoJSON / CSV via the share sheet (same columns as the site plus `accuracy_m`, `heading_deg`, `fix_method`, `photo_file`). Data is local-first; nothing leaves the phone until you export.
- **AI hook**: set `EXPO_PUBLIC_AI_ENDPOINT` at build time (same `{op:"classify", image}` contract as the site's `VITE_AI_ENDPOINT`) and the classify step shows the model's read as a suggestion. Without it the app says so and you pick the type; the model name is recorded on every report either way.

## Getting the build onto the phone

Two routes. The first needs nothing from you but a USB cable; the second needs ten minutes with your Apple password.

### 1. Unsigned IPA from CI, installed with Sideloadly (default)

`.github/workflows/ios-ipa.yml` builds the app on a macOS runner with signing switched off and
uploads the .ipa as a run artifact. No Apple session, certificate, or provisioning profile ever
touches CI, so it does not care that the June Apple cookie expired.

```powershell
cd C:\Users\james\Projects\sidequest-atx
gh workflow run "iOS unsigned IPA" -f note=phone
gh run watch                                     # ~4 min of checks, then ~7 min on the Mac
gh run download --name SideQuestATX-unsigned-<run>-phone --dir "$HOME\Downloads\SideQuest-ipa"
```

Then Sideloadly: plug the phone in, drag `SideQuestATX-unsigned.ipa` in, enter the Apple ID, install.
Sideloadly's own history on this PC (`%LOCALAPPDATA%\Sideloadly\installations.db`) records the last
two installs, Spotify and Sundial, with a 365-day TTL and their bundle ids left intact, so this Apple
ID is on the paid developer program: SideQuest installs as `com.sidequestatx.app`, lasts a year, and
the three-app free-account limit does not apply. (On a free Apple ID it would be 7 days and 3 apps.)
Either way the app asks for no paid-tier entitlements (no push, no associated domains, no app groups),
and `UIBackgroundModes: location` is an Info.plist key rather than an entitlement, so the Glasses Walk
trail records under free provisioning too.

Cost note: macOS runner minutes bill at 10x on a private repo, so a 7-minute build spends about 70
of the free plan's 2,000 monthly minutes. The workflow is manual-dispatch only for that reason, and
the typecheck and Metro bundle run first on a Linux runner so a broken bundle never reaches the Mac.

Two things in that workflow are load-bearing and will look strange later:

- **Xcode is chosen, not defaulted.** The image defaults to 16.4, whose Swift is 6.1, and
  ExpoModulesJSI's SwiftPM manifest asks for tools 6.2. Xcode 26.0 and 26.1 then fail on `weak let`
  in expo-modules-jsi. Only 26.2 and 26.3 get through, and the step tries them in that order.
- **expo-modules-jsi is patched before prebuild.** It annotates the two `RuntimeScheduler`
  constructors with `SWIFT_RETURNS_RETAINED`, which every Xcode 26 clang rejects: a constructor does
  not return, so the attribute never applied. The class still declares `SWIFT_SHARED_REFERENCE` and
  Swift imports a foreign reference type's constructors at +1 regardless, so removing it changes no
  ownership behaviour. The step no-ops once Expo drops the attribute.

### 2. TestFlight through EAS (when you want it on other people's phones)

TestFlight needs an interactive Apple sign-in, which is the one step that cannot be automated here.

```powershell
cd C:\Users\james\Projects\sidequest-atx\mobile
eas build --platform ios --profile production --auto-submit
```

What it will ask, in order:

1. **"Do you want to log in to your Apple account?"** -> `Y`. Apple ID defaults to `jamesjli2025@gmail.com`; enter the password and the 2FA code.
2. **Distribution certificate**: the Slyce certificate lives in the `slyce` EAS account, so EAS will offer to **generate a new Apple Distribution certificate** for this app -> `Y`. If Apple says the certificate limit is reached, do **not** revoke anything (that breaks Slyce builds).
3. It registers `com.sidequestatx.app`, makes a provisioning profile, and builds (~10-15 min). `--auto-submit` creates the App Store Connect record and uploads to TestFlight.
4. If submit fails with a generic "Something went wrong", it is almost always an **unaccepted agreement** in App Store Connect (Agreements, Tax, and Banking). Accept, wait a few minutes, then `eas submit -p ios --latest`.
5. **TestFlight** -> *Internal Testing* -> create a group -> add yourself. Internal testers need no review. The build carries `ITSAppUsesNonExemptEncryption = false`, so there is no export-compliance question.

Later builds either way: EAS auto-increments `buildNumber`; the CI route keeps whatever is in
`app.json`, so raise it there when you want two installable builds side by side.

## First run on the phone

- Sign in with your name and the **moderator** role (status changes and resolve need it; it is a local mock, same shape as the site's session).
- Allow **Camera** and **Location → Precise → While Using**. The camera HUD shows `GPS ±N m`; wait for green (≤8 m) before the first shot if you can. If the pill says Precise Location is off, flip it in Settings → SideQuest → Location.
- The first photo becomes **SQ-P0001** (P = captured on a phone; the shared `SQ-0001` counter is assigned when reports are merged into the site's store). Check Photos → Albums → "SideQuest ATX": the photo's location should show in Photos' info pane.
- For a Glasses Walk, iOS will ask for location **Always** on the first start. The blue indicator stays on for the length of the walk.

## Meta glasses workflow

1. Home → **Glasses Walk** → Start. Pocket the phone.
2. Shoot with the capture button on the glasses. No voice step.
3. End the walk in the app. Open the **Meta AI** app so the captures import (Settings → your glasses → turn on *auto-import to camera roll* once, and this step disappears).
4. Back in SideQuest: it finds photos whose creation time falls inside the walk (±3 min) and places each on the trail. Set the type per photo, uncheck non-hazards, Import.
   - If every pin sits consistently early or late along the trail, use the **clock offset** (−5/+5 s) and the pins re-place live.
   - If the Meta AI import stamps photos with the import time instead of the capture time, use **Pick by hand** (multi-select from the camera roll; EXIF `DateTimeOriginal` is used when present).
   - Photos that already carry GPS (a phone photo taken on the same walk) use their own tag instead of the trail.

## Layout

```
App.tsx                navigation (native stack), splash, theme
index.ts               registers the background trail task before the app mounts
src/types.ts           domain types (mirrors ../src/types.ts; adds fix metadata + "glasses" source)
src/theme.ts           tokens (hex approximations of ../src/styles/tokens.css)
src/ui/                Button, Card, Badge, Notice, OptionGrid, Segmented, KPI …
src/components/        Maps (PinPicker, ReportsMap, TrailMap), GpsHud
src/data/              fs (documents layout), store (ledger + rules), session + prefs, places
src/lib/               location (live GPS + snapshot at shutter, reverse geocode), photos (resize → EXIF → album), exif (piexif GPS writer/reader), geo, format, export
src/ai/                classify (endpoint hook), dedup, rank (same math as the site)
src/glasses/           trail (background task, JSONL breadcrumbs), match (photos → trail by time)
src/screens/           SignIn, Home, ReportFlow, Drive, GlassesWalk, ReportsList, ReportDetail, Settings
scripts/make_icons.py  app icon / splash / adaptive icons from the brand mark
```

On-device files (`Paths.document/sidequest/`): `reports.json`, `drives.json`, `walks.json`, `session.json`, `prefs.json`, `walk-active.json`, `walk-trail.jsonl`, `drive-queue.json`, `photos/<id>.jpg` (+ `<id>.t.jpg` thumbs).

## Next

- Supabase: `supabase/schema.sql` already accepts `source = 'glasses'`; a `SupabaseStore` behind `ReportStore` + photo upload to the `hazard-photos` bucket is the sync path. Until then, GeoJSON export + the Photos album are the hand-off.
- Ray-Ban **Display** HUD (Cascade's `/glasses` pattern, 600×600 web app added via Meta AI → Developer Mode): needs the site hosted with a small read API; the app's trail + reports would feed "nearby unreported stretch" prompts.
- Meta Wearables Device Access Toolkit (live glasses camera into the app): native SDK, needs a Mac + Meta developer registration; the time-match import above covers the use case without it.
- Vision model behind `EXPO_PUBLIC_AI_ENDPOINT`.
