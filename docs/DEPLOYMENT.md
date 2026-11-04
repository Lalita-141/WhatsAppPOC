# Deployment and operations

How to configure, release and run the backend and the mobile app. Nothing here has been deployed; production needs your approval and the items marked **Required**.

## 1. Backend

### Requirements

- Node.js 20 or newer, MySQL 8 (or MariaDB 10.6+).
- A persistent disk for uploaded files (`MEDIA_STORAGE_DIR`).
- HTTPS in front of the API (a reverse proxy such as nginx or a cloud load balancer). Set `TRUST_PROXY=1` behind one proxy.

### Environment variables

All settings live in `backend/.env` (template: `backend/.env.example`). The server refuses to start in production (`NODE_ENV=production`) with an unsafe value.

| Variable | Required in production | Notes |
| --- | --- | --- |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` | Yes | Use a dedicated database user, not `root` |
| `JWT_ACCESS_SECRET`, `JWT_PROFILE_SETUP_SECRET` | Yes, 32+ characters, different from each other | `openssl rand -base64 48` |
| `OTP_HASH_SECRET` | Yes, 32+ characters | Changing it invalidates codes already sent |
| `MEDIA_URL_SECRET` | Yes, 32+ characters | Signs the 10-minute file download links |
| `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID` | Yes | `console` is refused in production |
| `CORS_ORIGINS` | If a web admin exists | Comma-separated; `*` is refused. Phones are not affected by CORS |
| `MEDIA_STORAGE_DIR` | Yes | Default `storage/media`. Only local storage exists; a cloud bucket provider is not implemented |
| `STUN_URLS` | No | Default `stun:stun.l.google.com:19302` |
| `TURN_URLS`, `TURN_SECRET` | Strongly recommended | See section 4. Without TURN, some calls on strict networks cannot connect |
| `FIREBASE_*` / service account file | For push | The service account JSON is ignored by git; never commit it |
| `OTP_DEV_ECHO`, `RATE_LIMIT_MULTIPLIER` | Must be unset | Refused in production |

### Build and start

```sh
cd backend
npm ci
npx prisma generate
npm run build
NODE_ENV=production npm start      # node dist/server.js
```

`GET /api/v1/health` returns 200 when the database answers and 503 when it does not. The server finishes open requests and exits on `SIGTERM`.

### Database migrations (every release)

Never run `prisma migrate reset`, `prisma migrate dev` or `db push` against a real database.

1. Back up: `mysqldump --single-transaction --no-tablespaces -u <user> -p <db> > backup.sql`. Also copy `MEDIA_STORAGE_DIR`.
2. Rehearse: restore the backup into a scratch database and run `DATABASE_URL=mysql://…/scratch npx prisma migrate deploy` against it.
3. Check: `npx prisma migrate status`, then compare row counts with the backup.
4. Apply: `npx prisma migrate deploy` on the real database.
5. Verify: `npx prisma migrate status` reports "up to date", and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` prints an empty migration.

All migrations in `prisma/migrations` are additive: they add tables, columns and indexes and do not drop data.

### First organization admin

There is no API that makes someone the first admin. On the server:

```sh
npm run org:make-admin -- <ORG_CODE> <COUNTRY_CODE> <MOBILE_NO>
npm run org:make-admin -- HNT001 +91 9876543210
```

The person must already be a member. Further admins are managed in the app (Settings → Organization admin).

New members need an invite or admin approval by default (`join_mode = APPROVAL`). An admin can switch an organization to "Anyone with the code can join".

### Scaling limits today

One backend instance only. These are kept in process memory and would need Redis before running several instances:

- Socket.IO rooms and presence (needs `@socket.io/redis-adapter`).
- Live call state (who is in a call, which device answered).
- Rate limit counters (needs a shared `express-rate-limit` store).

### Logs and monitoring

Logs are JSON lines from pino on stdout, with tokens, OTPs and authorization headers redacted. Send stdout to your log system. Alert on: `/api/v1/health` not 200, error-level (`"level":50`) lines, and MySQL disk usage.

### Backup and recovery

- Daily `mysqldump` of the database, kept for at least 30 days, and a copy of `MEDIA_STORAGE_DIR` taken at the same time (files are referenced by database rows).
- To restore: stop the backend, load the dump into an empty database, restore the media directory, run `npx prisma migrate status`, then start.
- Test a restore at least once before going live.

## 2. Mobile app

### API address

`WhatsAppPOC/src/environments/environment_constant.ts`:

- Debug builds use `dev`. Set it to the address of the machine running the backend (the phone must reach it; Android emulator: `http://10.0.2.2:5001/api/v1/`, iOS simulator: `http://localhost:5001/api/v1/`).
- Release builds use `prod`. **Required:** set it to your HTTPS address before a store release. It currently holds the same plain-HTTP address as `dev`, which is fine for internal testing only. iOS blocks plain HTTP in release builds unless an exception is added, and one should not be.

### Android release signing

1. Create an upload key once and keep it safe outside the repository:
   `keytool -genkeypair -v -storetype PKCS12 -keystore whatsapppoc-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Add to `~/.gradle/gradle.properties` (not to the project):
   ```
   WHATSAPPPOC_UPLOAD_STORE_FILE=/absolute/path/whatsapppoc-upload.jks
   WHATSAPPPOC_UPLOAD_STORE_PASSWORD=…
   WHATSAPPPOC_UPLOAD_KEY_ALIAS=upload
   WHATSAPPPOC_UPLOAD_KEY_PASSWORD=…
   ```
3. `cd WhatsAppPOC/android && ./gradlew bundleRelease`. Without these properties the release build is signed with the debug key and prints a warning; such a build cannot be published.

### iOS signing and push

1. In Xcode, set the team and a unique bundle identifier for the `WhatsAppPOC` target.
2. Push: enable the Push Notifications capability, create an APNs key in the Apple Developer portal, and upload it in the Firebase console (Project settings → Cloud Messaging). For production builds change `aps-environment` in `ios/WhatsAppPOC/WhatsAppPOC.entitlements` from `development` to `production`.
3. `cd WhatsAppPOC/ios && pod install` after any dependency change.

### Firebase

`google-services.json` (Android) and `GoogleService-Info.plist` (iOS) must come from the production Firebase project for release builds.

## 3. Permissions the app asks for

| Permission | Why | When |
| --- | --- | --- |
| Contacts | Find which contacts use the app | Contact sync |
| Notifications | Message, group, announcement and call alerts | After login |
| Camera | Photos, videos, video calls | When used |
| Microphone | Voice messages, calls | When used |
| Photo library | Send photos, set profile photo | When used |
| Face ID | App lock | When app lock is turned on |

The privacy policy must cover: phone numbers and contacts uploaded for matching, message storage on the organization's server (messages are not end-to-end encrypted), files stored on the server, push notifications through Google/Apple, and call signaling through the server (call audio and video go directly between phones, or through your TURN server).

## 4. Calls: TURN server

Calls use WebRTC. On many mobile and corporate networks a direct connection is impossible and a TURN relay is required. Run coturn with a shared secret:

```
# /etc/turnserver.conf
use-auth-secret
static-auth-secret=<same value as TURN_SECRET>
realm=<your domain>
listening-port=3478
tls-listening-port=5349
```

Then set `TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp` and `TURN_SECRET`. The backend hands out credentials that expire after 6 hours.

When the app is closed, an incoming call arrives as a high-priority notification. The native incoming-call screen (CallKit on iOS, a full-screen intent on Android) is not implemented: it needs VoIP push certificates and the CallKit/ConnectionService integration.
