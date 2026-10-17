# Ghostlap Roma on TestFlight

The web app is wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com) 8. The Xcode project is already in
`ios/` and uses Swift Package Manager, so there is no CocoaPods and no `pod install`. Everything below happens on the Mac.

What is already set up in the repo:

- `capacitor.config.json`: app ID `com.muro8120.ghostlap`, name Ghostlap Roma, web files from `www/`, dark background `#0b0d12`.
- `ios/App/App/Info.plist`: home-screen name **Ghostlap** (same as the PWA; "Ghostlap Roma" gets cut off under the icon),
  portrait only, light status-bar text on the dark app, dark launch screen, and `ITSAppUsesNonExemptEncryption = NO`.
- iPhone only (no iPad build), iOS 15 or later. App icon and launch screen are rendered from `tools/icon.svg` by
  `npm run build:icon` (also the PWA icons); a new icon shows up with the next TestFlight build, no reinstall.
- No service worker in the native app: the files are inside the app, so the launcher just says **✓ Ready**.

## One-time setup

1. **Xcode:** install the current Xcode from the Mac App Store, open it once and let it install its components.
   Sign in under **Xcode > Settings > Accounts** with the Apple ID of your developer account.
2. **Node 22 or later:** from [nodejs.org](https://nodejs.org) (LTS installer) or `brew install node`. Check with `node -v`.
3. **Get the code and install:**
   ```sh
   git clone https://github.com/muro8120/ghostlap-roma.git
   cd ghostlap-roma
   npm install
   ```
4. **Pick the Bundle ID.** `com.muro8120.ghostlap` is a placeholder. Use it if you like it, or change it, but it must be the
   same in three places: `appId` in `capacitor.config.json`, Xcode's Bundle Identifier (step 7), and the app record in
   App Store Connect (step 8). It cannot be changed in App Store Connect after the first upload.

## Build and upload

5. **Build the web files and copy them into the Xcode project:**
   ```sh
   npm run build:www      # copies the app files listed in sw.js into www/
   npx cap sync ios       # copies www/ into ios/App/App/public and updates the Swift packages
   npx cap open ios       # opens ios/App/App.xcodeproj in Xcode
   ```
   (`npm run sync:ios` does the first two in one go.) The first time, Xcode downloads the Capacitor Swift package; wait
   for the progress in the toolbar to finish. If it complains about packages, use **File > Packages > Resolve Package Versions**.
6. **Try it first (optional but worth it):** pick your iPhone (plugged in, Developer Mode on) or a simulator at the top
   of the window and press **Run** (⌘R). Check the launcher, a race, and a chess game against the engine.
7. **Signing:** in the left sidebar click the blue **App** project, then the **App** target, then the
   **Signing & Capabilities** tab. Tick **Automatically manage signing**, choose your **Team**, and check that
   **Bundle Identifier** is your ID from step 4. Xcode registers the ID with Apple for you.
8. **Create the app record** (once): in [App Store Connect](https://appstoreconnect.apple.com) go to **Apps**, press
   **+ > New App**. Platform iOS, a name (it has to be unique across the whole App Store, so "Ghostlap Roma" may be taken;
   it is only the store name, the home-screen name stays Ghostlap), language, your Bundle ID from the list, and any SKU
   (e.g. `ghostlap-roma`).
9. **Version and build:** still on the App target, **General** tab, **Identity**: Version `1.0`, Build `1`. Every upload
   needs a higher Build than the last one you uploaded for that Version.
10. **Archive:** at the top of the window set the run destination to **Any iOS Device (arm64)**, then **Product > Archive**.
    When it finishes the **Organizer** window opens with the new archive selected.
11. **Upload:** press **Distribute App**, choose **App Store Connect** (newer Xcode versions call it
    **TestFlight & App Store**; look for that wording), then **Distribute** / **Upload** and accept the defaults
    (automatic signing, upload symbols). It takes a few minutes. Apple then processes the build, usually 5 to 30 minutes,
    and emails you when it is ready.

## TestFlight testers

12. In App Store Connect open the app, then the **TestFlight** tab. The build appears under **iOS Builds** once processed.
13. **Export compliance:** the Info.plist already says the app uses no non-exempt encryption, so App Store Connect should
    not ask. If it does ask ("Missing Compliance"), answer that the app uses **no encryption** / **none of the algorithms
    listed**: Ghostlap has no network code, no logins and no custom cryptography; anything iOS itself does is exempt.
14. **Internal testers** (no review, available minutes after processing): internal testers must be members of your App
    Store Connect team.
    - You: under **Internal Testing** press **+** to create a group (e.g. "Us"), add yourself, and add the build to the group.
    - Your friend: first invite them under **Users and Access** (any role, e.g. Marketing; up to 100 people). Once they
      accept the email invite, add them to the same internal group.
    - Both of you install the **TestFlight** app from the App Store on the iPhone and accept the invite there.
    - Alternative for the friend: an **External Testing** group only needs their email (or a public link), but the first
      build in an external group goes through a short Beta App Review (usually under a day). TestFlight builds expire
      after 90 days either way.

## Shipping an update

1. Change the web files as usual (and bump `CACHE` in `sw.js` for the web version, as before).
2. `git pull`, then `npm run build:www` and `npx cap sync ios` (or `npm run sync:ios`).
3. In Xcode raise **Build** (e.g. `1` to `2`; raise **Version** too for a bigger release). The Build number must always go up.
4. **Product > Archive**, **Distribute App**, upload, and add the new build to the tester group if it is not added
   automatically. Testers get it through the TestFlight app.

## Or skip TestFlight: install by cable, once a year

TestFlight builds expire after 90 days. A build installed straight from Xcode over a cable is signed with your paid
developer account's development profile and runs for **12 months**. For two phones this is less work than three
re-uploads a year. Nothing is submitted to Apple and nothing is visible in the App Store.

1. On the iPhone, turn on **Settings > Privacy & Security > Developer Mode** (iOS 16 and later; the phone restarts).
2. Plug the phone into the Mac with a cable, unlock it, and tap **Trust** if asked.
3. `npm run build:www && npx cap sync ios && npx cap open ios`.
4. In Xcode pick the phone as the run destination (the device menu at the top, next to the scheme name). The first time,
   Xcode registers the phone on your developer account by itself when **Automatically manage signing** is on.
5. For a smooth build, **Product > Scheme > Edit Scheme > Run > Build Configuration: Release**.
6. **Product > Run**. Xcode installs the app and launches it. Unplug; it stays.
7. Repeat steps 2 to 6 for the second phone. Each phone counts against the 100 devices a year your account allows.
8. When the year is up the app stops opening. Plug in and **Product > Run** again.

Updates go the same way: pull, build, sync, Run. No build numbers to raise. If one of you is not around to plug in,
TestFlight above still works for that phone; the two routes do not interfere, but they are separate installs with
separate saved data.

## Notes

- **Saved data does not move across.** Times, ghosts and chess history live in the web view's storage, which is separate
  for the native app, the home-screen PWA and Safari. The app starts fresh.
- **Upgrading Capacitor later:** change the three `@capacitor/*` versions in `package.json` together, `npm install`,
  then `npx cap sync ios`. `ios/App/CapApp-SPM/Package.swift` is managed by Capacitor; do not edit it by hand.
- **If `ios/` ever gets lost or broken:** delete it, run `npm run build:www && npx cap add ios`, then redo the plain-text
  edits listed at the top (Info.plist keys, iPhone-only `TARGETED_DEVICE_FAMILY = 1`, launch screen colour, icon and splash).
- **Licences:** Stockfish is GPL-3.0 and its licence file is bundled. That is fine for you and friends on TestFlight; if
  the app ever goes on the public App Store, keep the source public (it is, on GitHub) and read up on GPL and App Store terms first.

## The web version still works

Nothing above replaces the PWA. The GitHub Pages site keeps working exactly as before: open it in Safari,
**Share > Add to Home Screen**, open it once online, and wait for **✓ Ready offline** (see README, "Install on iPhone").
That is still the quickest way to get it onto a phone without Xcode or TestFlight.
