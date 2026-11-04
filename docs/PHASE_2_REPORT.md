# Phase 2 Report: Security and Authentication

**Status: code complete and tested, migrations applied to the local database on 2026-11-02.** Nothing is committed. The app has not yet been run on a device or simulator, and real SMS has not been tested.

Applied result: all three migrations recorded, no schema drift, and every existing row kept. Backups taken before each step are in `/Users/rnt/Desktop/WhatsAppPOC/db-backups/`, outside the repository.

## Apply it

The new backend needs the migrations first; without them, login fails on the missing `country_code` column.

1. Correct the database credentials in `backend/.env`.
2. Back up:
   ```sh
   mysqldump -u <user> -p <database> > backup-before-phase2.sql
   ```
3. Run the read-only checks:
   ```sh
   cd backend
   mysql -u <user> -p <database> < scripts/preflight-auth-migration.sql
   ```
   - Every `must be 0` row must be 0. **Duplicates need a decision from you**: the migration stops rather than merging accounts.
   - `0_init` and `20261012104212_add_user_device` must be listed as finished.
   - **If they are not listed, or `_prisma_migrations` does not exist, stop.** `migrate deploy` would try to run the baseline. If the tables already exist, mark what is already there with `npx prisma migrate resolve --applied <name>`, which records it without running any SQL.
4. Migrate and verify:
   ```sh
   npx prisma migrate status
   npx prisma migrate deploy
   npx prisma migrate status
   ```
   Then run the preflight again and compare the row counts.
5. For the in-app OTP helper during development, add `OTP_DEV_ECHO=true` to `backend/.env`. Without it, the code appears in the server log.
6. Restart the backend and rebuild the app. Use Node 22 or newer for the app (`react-native` requires 22.11+; your default is 20.19).

### What the migrations do

| Migration | Changes | Effect on existing data |
| --- | --- | --- |
| `20261102100000_add_user_session` | New `user_session`. Nullable `user_device.session_id`. `register_otp.otp` widened to 128 characters. One new index | None |
| `20261102100100_add_phone_identity_constraints` | Adds `user_master.country_code`, backfilled from each number's OTP history, then India. Unique `(country_code, mobile_no)` and unique `org_code` | Rows kept. Stops if a duplicate exists or a country cannot be resolved |

| `20261102100200_fix_backfilled_country_code` | No schema change. Moves a user to India when the backfill chose another country but the 10-digit number was verified with India and no other account holds it | Corrected users 2 and 12 from `+93` to `+91`, including `updated_at`. No other value changed |

The third migration exists because the backfill trusted the newest validated OTP. Users 2 and 12 had mostly verified with India, then a few times with Afghanistan selected, which would have locked them out of their accounts. It was rehearsed on a restored backup, then checked on the live database by comparing every table against the backup.

**Known leftover:** users 4 and 8 stay on `+93` with numbers the login rejects as invalid. They have no messages, and nothing proves which country is right, so they were not changed.

### What users will notice

- **Everyone must log in once more.** Older tokens have no session.
- OTP codes are now 6 digits, so **older app builds cannot log in**.
- After that, the app stays signed in for up to 30 days of inactivity, and opens directly to home.

## What changed

**OTP**
- Secure random 6-digit codes, stored only as a keyed hash
- Single use, enforced atomically
- 5 attempts, then a 15-minute block per phone number across all organizations; requesting a new code cannot reset it
- Limits: 60-second cooldown, 5 per 15 minutes, 20 per day, plus per-IP limits
- Never returned or logged in production. The server **refuses to start** in production with echo on, the console SMS provider, wildcard CORS, or weak secrets

**SMS**
- Provider interface with `console` for development and `twilio`
- Delivery failure returns an error and invalidates the code

**Phone identity**
- Numbers are identified by country and number together, with international parsing

**Registration**
- `POST /user/profile` and `POST /organization/setup` require their own verified short-lived token
- The phone and organization come from that token, never the request body
- Both now start the session directly, so the app no longer submits the OTP twice

**Sessions**
- 15-minute access tokens and 30-day rotating refresh tokens, stored hashed
- Reuse of an old refresh token revokes the session, with a 15-second allowance for a retry after a lost response
- New: `POST /auth/refresh`, `/auth/revoke`, `/auth/logout`, `/auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`
- Each request re-checks the session, so logout and removal from an organization apply immediately, and live sockets are closed
- This adds one indexed database lookup per request

**Authorization**
- Setup tokens no longer work on protected routes
- Only the owner can delete a push token
- Fixed: directory leak in `GET /chat/contacts`, wrong membership and registration leak in contact check

**Sockets**
- Presence and typing are limited to the same organization, and presence honors last-seen privacy
- Payloads are validated, with per-event rate limits and a 64 KB size limit
- Arbitrary `media` JSON is refused until Phase 7
- Internal errors no longer reach clients

**HTTP**
- CORS allowlist, structured logs with redaction, consistent 404 and malformed-body errors

**App**
- Session restore, automatic refresh shared across parallel requests, and a network failure no longer logs anyone out
- Logout clears cached chats
- Removed personal data from logs and raw tokens from screens; developer tools are hidden in release builds
- Fixed the 2 existing TypeScript errors and the broken Jest setup

**Repo**
- Firebase key files are now ignored by git. `serviceAccountKey.json` was never committed, so it does not need replacing for that reason
- `.env.example` now matches the code
- The Prisma CLI works without a separate `DATABASE_URL`

## Verification

| Check | Result |
| --- | --- |
| Backend type check | Pass |
| Backend tests (real MySQL set to IST) | 70 pass, 0 fail, repeated 15 times to rule out flakiness |
| Frontend type check | Pass (was 2 errors) |
| Frontend tests | 27 pass, 0 fail (only suite previously failed). Jest still warns that a worker did not exit cleanly |
| Release JS bundles, Android and iOS | Build |
| Vulnerabilities reintroduced on purpose (7 backend, 2 frontend) | All 9 caught by the tests |
| ESLint | 6 errors, all pre-existing and unrelated; left alone |

**Not verified:**
- The migrations on your real database
- Real SMS: the Twilio request is tested against a mock only
- The app on a device or simulator: only JavaScript bundles were built, no native builds. No native code changed in this phase

### Running the backend tests

The tests erase their database, and refuse anything that is not local and named `*_test`.

```sh
cd backend
export TEST_DATABASE_URL="mysql://root:<password>@127.0.0.1:3306/whatsapp_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm test
```

## Still open

| Item | Risk | Planned |
| --- | --- | --- |
| **Anyone with an organization code can join it**, and the app pre-fills `HNT001` | High | Phase 5 invitations |
| **Tokens are in unencrypted MMKV**, and refresh tokens now last 30 days. Needs `react-native-keychain` and a native build | High | Start of Phase 3 |
| REST conversation and contact lists ignore privacy for last seen, about and photo | Medium | Phase 4 |
| `read_receipts` and `typing_indicator` settings still ignored | Medium | Phase 4 |
| Push tokens registered before this phase have no session, so logout cannot remove them until the app re-registers | Medium | Phase 8 |
| An offline logout clears the phone only. The server session lasts until it expires or is revoked from another device (UI in Phase 3) | Low | Phase 3 |
| HTTP rate limits are per server process, so they need Redis when running several servers. Phone limits are in the database and unaffected | Low now | Phase 12 |
| Set `TRUST_PROXY` correctly behind a proxy, or all users share one rate-limit bucket | Deployment | Phase 12 |
| Message text in the FCM payload, and hard-coded `http://172.20.1.72` URLs | Medium | Phases 8, 12 |

## You need to provide

- Correct database credentials
- Before production: an SMS account (Twilio, or another provider to add) and, for India, DLT registration of sender and template
