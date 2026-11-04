# Project status

State of the 12 phases from the project brief, as of 2026-11-03. Nothing is committed to git and nothing is deployed. All database migrations are applied to the local `enterprise_whatsapp` database, with a backup before each one in `/Users/rnt/Desktop/WhatsAppPOC/db-backups/`.

## Verification

| Check | Result |
| --- | --- |
| Backend type check | Passes |
| Backend tests (`npm test`, real MySQL) | 177 of 177 pass |
| App type check | Passes |
| App tests (`npx jest`) | 73 of 73 pass |
| Android debug build (`./gradlew assembleDebug`) | Succeeds with all native libraries |
| iOS simulator build | Release build succeeds; Debug build fails to link (see "Known problems") |
| Backend production build and start | Succeeds; `/api/v1/health` reports the database up |
| Migrations on the real database | All applied; no drift; every existing row kept |
| Tested on a real phone or simulator | **No** |

## What each phase delivered

| Phase | Delivered |
| --- | --- |
| 1. Audit | `docs/PHASE_1_AUDIT.md` |
| 2. Security and login | OTP hashing, limits and expiry; refresh tokens with rotation; logout one or all devices; session revocation closes sockets; international phone numbers; secrets checked at start-up. `docs/PHASE_2_REPORT.md` |
| 3. Users and devices | Message Yourself; tokens in iOS Keychain / Android Keystore; organization switching; profile editing; logged-in devices; privacy settings; account deletion |
| 4. Personal chat | Reply, forward, edit (15 min), delete for me / for everyone (48 h), reactions, star, pin (3 per chat), search, mute, archive, pin chats, block, report, paged chat list with unread counts, retry with no duplicates, catch-up after reconnecting, read receipts and typing respecting privacy |
| 5. Organizations | Settings for internal chat, external policy (own only / approved / all / disabled), groups, files, calls, upload size, broadcasts; partner organization requests; admin roles; invites and join approval; departments; audit log; broadcasts to organizations, departments or members with per-organization statistics |
| 6. Groups | Create, info, admins, add/remove, leave (admin handed on), delete, invite code, announcement-only groups, receipts per member, search, mute, pin, archive, forward, members from other organizations (suspended if the organizations disconnect) |
| 7. Media | Photos, videos, documents, voice messages, profile photos; type and size checks with file signature checking; location data stripped from photos; thumbnails; 10-minute signed download links; byte ranges for video; files only visible to people in the chat |
| 8. Notifications | Messages, groups, announcements, channels and calls; per-category switches and hidden previews; chat stacking; in-app banner instead of a pop-up; taps open the right screen; late notifications for another organization ignored; dead tokens removed; Android channels |
| 9. Updates | Status (text, photo, video; everyone / contacts / chosen people; viewers; 24 h); channels (follow, admin posts, followers never listed); communities (linked groups with an announcement group) |
| 10. Calls | One-to-one voice and video over WebRTC: ringing, accept, decline, cancel, missed after 45 s, busy, answered on another device, reconnect within 20 s, mute, speaker, camera on/off, camera switch, call history |
| 11. UI | Tabs Chats, Updates, Communities, Calls, Settings; contact info; chat export; app lock (Face ID, fingerprint or passcode); dark and light themes |
| 12. Production | Health check, graceful shutdown, upload cleanup, release signing from private settings, build-type API address, `docs/DEPLOYMENT.md` |

## Not done, or done with limits

- **iOS build:** see "Known problems" below.
- **Not tested on devices.** Camera, microphone, calls, push, photo picking, Keychain and app lock run only on a phone or simulator.
- **Real SMS:** only tested with Twilio mocked.
- **Calls:** no TURN server is configured (some networks will fail to connect); no native incoming-call screen (CallKit / ConnectionService); one-to-one only, no group calls.
- **Media:** only local disk storage; no cloud bucket provider. No server-side video thumbnails (videos show a play tile).
- **Scaling:** one backend instance only (socket rooms, presence, call state and rate limits are in memory). See `docs/DEPLOYMENT.md`.
- **Not implemented from the brief:** app language settings (the app is English only), chat backup and restore (only export as text), online dots in the chat list, an unsent-message queue that survives closing the app, message reactions and stars in groups.
- **End-to-end encryption:** not implemented and not claimed. Messages are readable by the server; they are encrypted in transit once HTTPS is used.
- **Production API address:** release builds still point at a plain-HTTP address; set an HTTPS one first.

## Known problems

- **iOS Debug build fails to link** with missing debug-only React symbols (`ShadowNode::getDebugName`, `Sealable`), all referenced from `react-native-screens`. That library predates this work and was not changed; the libraries added in this work are not in the errors. It looks like a mismatch between `react-native-screens` and React Native's prebuilt core in Debug. The iOS Release build succeeds, so every native library compiles and links. To run Debug on iOS, either build the Release configuration on the simulator, or set `RCT_USE_PREBUILT_RNCORE=0` before `pod install` to build React Native from source (slower builds).
- **Lint:** 11 ESLint errors remain, all in code that predates this work (unused variables and one hook dependency warning).
- **Join approval is on:** new people cannot join the existing organization until an admin exists. Run `npm run org:make-admin` first (see `docs/DEPLOYMENT.md`).

## How to test

1. Backend: `cd backend && npm run dev` (port from `PORT` in `.env`, currently 5001). For OTPs on screen during development add `OTP_DEV_ECHO=true` to `.env`; otherwise codes appear in the server log.
2. Make an admin: `npm run org:make-admin -- HNT001 +91 <your number>`.
3. App: set `dev` in `WhatsAppPOC/src/environments/environment_constant.ts` to this computer's address, then `cd WhatsAppPOC && npm start` and `npm run android` (Node 22: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`).
4. Use two phones or a phone and an emulator with two numbers to test chats, groups and calls.
5. Automated tests: `cd backend && TEST_DATABASE_URL=mysql://root@127.0.0.1:<port>/<name>_test npm test` (a local database whose name ends in `_test`; it is emptied), and `cd WhatsAppPOC && npx jest`.
