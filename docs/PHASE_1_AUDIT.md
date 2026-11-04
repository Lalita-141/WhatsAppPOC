# Phase 1 Audit: WhatsAppPOC

Audit date: 2026-11-02, at commit `25c872e`. Findings come from reading the code, not from earlier audits.

**How this was checked**

| Check | Result |
| --- | --- |
| Backend `tsc --noEmit` | Pass |
| Frontend `tsc --noEmit` (Node 22) | **2 errors** (`useContactSync.ts:76`, `src/hooks/index.ts:1`) |
| Frontend Jest | **The only suite fails**: `App.test.tsx` cannot transform `@react-navigation/native` ESM |
| Backend tests | **None exist** |
| Existing migrations on an empty throwaway MySQL | Both apply; `migrate diff` against `schema.prisma` is empty, so no drift |
| Real development database | **Not inspected.** Local MySQL rejects the `backend/.env` credentials (`ER_ACCESS_DENIED_ERROR`) |
| Native apps | Config read only; not built or run on a device |

Because the real database could not be read, its row counts, duplicates and `_prisma_migrations` state are unknown. `backend/scripts/preflight-auth-migration.sql` answers those questions read-only before any migration runs.

## 1. Existing architecture

**Backend.** Express 5, TypeScript ESM, Prisma 7 with the MariaDB adapter on MySQL, Socket.IO, Firebase Admin. Modules: `auth`, `user`, `organization`, `country`, `device`, `notification`, `chat` (with `conversation` and `personal` sub-modules). The Route → Controller → Service → Repository layering is mostly followed. `user.service` and `chat.service` also call Prisma directly.

**Identity model.** `user_master` holds the person and `user_organization` holds a membership. Every message, device and setting hangs off `user_organization_id`. The JWT carries exactly one membership, which suits multi-organization use. `personal_chat_history` is a flat message table with no conversation entity.

**Mobile.** React Native 0.87 CLI, React Navigation native stack with 5 routes, Zustand and MMKV for auth, TanStack Query, a singleton Socket.IO client, React Native Firebase. Chat is a state-driven overlay inside `HomeScreen`, not a navigation route.

**Duplicated or dead code**

- Two personal-message services (`chat.service` and `personal.service`). The REST one stores `media: "text"` and never delivers over the socket or push; the app does not use it.
- `src/theme` and `src/core/theme` differ from each other.
- Two MMKV instances; `storageService.getToken()` is never written, so it always returns null.
- Two FCM services (`notificationService.ts` and `notifications/fcmService.ts`).
- `services/api/axios.ts` wraps `fetch` and is unused.
- Empty files: `profileSetup.middleware.ts`, `backend/src/config/ApiConfig.ts`.
- A stray `backend/backend/` package.
- `zod`, `pino` and `pino-http` are installed but unused.

## 2. Completed features

These work in the code, subject to the defects in sections 3 and 4.

- OTP send and verify flow with cooldown and attempt counters (development-grade, see section 4)
- Profile setup and organization linking
- Countries API
- Contact check against the device address book
- 1:1 text over Socket.IO with persistence
- Cursor-paged history
- Optimistic send
- Sent, delivered and read status
- Typing indicator
- Multi-socket online presence and persisted last seen
- Unread counts in the conversation list
- FCM token registration, multi-device personal push, and invalid-token cleanup
- Light and dark theme switching

## 3. Incomplete or broken features

| Area | State |
| --- | --- |
| SMS | No provider. The OTP only reaches the user through the API response |
| Session | No refresh tokens. Access tokens last 15 minutes, then the app fails. No session restore: the app always opens on `login` |
| Logout | Client-side only. The FCM token stays registered, so a logged-out phone keeps receiving message text |
| International phones | `normalizeIndianPhoneNumber` rejects non-Indian numbers with an uncaught `Error` (HTTP 500) |
| Contacts API | `GET /chat/contacts` passes `(userId, organizationId)` to a function expecting `(organizationId, currentUserId)` |
| Organization link | `organization/setup` skips creating `user_setting`. A soft-deleted membership hits the unique key and returns 500 |
| Delivery | No offline catch-up: a message is marked delivered only if `message:new` reaches a connected client. No sync to the sender's other devices |
| Optimistic send | Matched by message text, so identical messages can match the wrong entry. No client message ID, no retry, no idempotency |
| Read handling | The client marks *all* own messages SEEN on any read event. `read_receipts` and `typing_indicator` settings are ignored. No read timestamp |
| Conversations | Loads every message for the user into memory on each call. No paging. Sorted by 1-second `send_time`. The client type expects `chatId` but the server sends `messageId` |
| Push | No `setBackgroundMessageHandler`. The Android `chat_messages` channel is never created. iOS has no `UIBackgroundModes`. Token refresh only logs. APNs badge is hard-coded to 1 |
| Device binding | `fcm_token` is globally unique, so a phone can receive push for only one organization |
| Groups | Tables only; no API, socket event or screen |
| Updates, Calls, Communities tabs | **Hard-coded mock data** with non-functional buttons. Must not count as features |
| Missing entirely | Self-chat (rejected in three places), organization permissions, broadcast, media, calling, status, reply/forward/edit/delete/reactions/star/pin/search, mute/archive/block/report, admin UI, audit log |
| Organization admins | `user_organization.role` is free text and only `"USER"` is ever written. There is no admin and no way to create one |
| Release config | Release builds sign with the debug keystore. iOS bundle ID is the template `org.reactjs.native.example`. `aps-environment` is `development`. All environments point to `http://172.20.1.72:5001`. Android allows cleartext traffic. Test buttons ship in Settings and Login |
| Tooling | `.env.example` names variables the code does not read. `prisma.config.ts` needs a `DATABASE_URL` that `.env` does not define, so the Prisma CLI fails out of the box |

## 4. Security vulnerabilities

Status reflects the end of Phase 2. "Fixed" means fixed in code and covered by tests; nothing is committed or deployed yet. See `docs/PHASE_2_REPORT.md`.

### Critical

| ID | Finding | Where | Status |
| --- | --- | --- | --- |
| C1 | **Any account can be taken over.** `send-otp` returns the OTP to the caller, so a phone number and organization code are enough to log in as anyone | `auth.service.ts` `sendOtp` | Fixed |
| C2 | **Unauthenticated registration of any phone number.** `POST /user/profile` has no middleware and trusts the body; the setup token is issued but never checked | `user.route.ts` | Fixed |
| C3 | **Phone identity ignores the country.** `user_master` has no country code and login looks up by digits alone. Once real SMS exists, `+1 5551234567` logs into the account of `+91 5551234567`. `mobile_no` is not unique either | `auth.repository.ts` `findUserByMobile` | Fixed by migration; **needs applying** |

### High

| ID | Finding | Where | Status |
| --- | --- | --- | --- |
| H1 | OTP is reusable for its 5 minutes after success; the app depends on this | `findLatestOtp`, `authStore` | Fixed |
| H2 | OTP block resets on the next `send-otp`, because counters live on each row. Weak `Math.random` 4-digit code, stored in plaintext and logged. Attempt counter is not atomic | `auth.service.ts` | Fixed |
| H3 | `authenticate` accepts `ORGANIZATION_SETUP` tokens on all protected routes, so a non-member can read an organization's directory via `contacts/check` | `auth.middleware.ts` | Fixed |
| H4 | Any authenticated user can delete anyone's FCM token | `device.repository.ts` | Fixed |
| H5 | Socket `presence:get` returns online state and last seen for **any** membership in any organization, ignoring privacy settings. `typing:*` can target anyone. REST conversation and contact lists also return last seen, about and photo without checking privacy | `socket.server.ts`, `conversation.service.ts`, `chat.service.ts` | Sockets fixed. **REST lists open**: Phase 4 |
| H6 | `GET /chat/contacts` argument swap: user 5 receives organization 5's directory including phone numbers | `chat.controller.ts` | Fixed |
| H7 | `contacts/check` returns the wrong membership ID for multi-organization users and reveals through omission whether a number is registered elsewhere | `chat.service.ts` | Fixed |
| H8 | Tokens are never re-checked: removed members and deleted users keep access, and sockets stay connected indefinitely | middleware, socket | Fixed |
| H9 | **Anyone holding an organization code joins that organization** with no invitation or approval. The app even defaults to `HNT001` | `organization.service.ts`, `authStore` | **Open**: needs Phase 5 invitations |
| H10 | `serviceAccountKey.json` is untracked but **not ignored**, so `git add .` would commit a Firebase admin key. Checked: it was never in git history | `.gitignore` | Fixed |
| H11 | Tokens stored in **unencrypted** MMKV | `core/store/storage.ts` | **Open**: see Phase 2 report |

### Medium and low

| ID | Finding | Status |
| --- | --- | --- |
| M1 | CORS reflects every origin with credentials; Socket.IO uses `*` | Fixed |
| M2 | No IP rate limits anywhere; no socket event limits; socket messages have no length limit; arbitrary JSON accepted as `media` | Fixed |
| M3 | Raw error messages sent to socket clients; malformed input causes 500s | Fixed |
| M4 | PII in logs: OTPs, profiles, request bodies, FCM tokens, full device contact list, message text. The app also displayed tokens on screen | Fixed. The console SMS provider logs the code by design; it cannot run in production |
| M5 | `presence:update` broadcasts every status change to the whole organization room | Privacy fixed. Targeted rooms: Phase 12 |
| M6 | Message text is stored in plaintext and sent through FCM in the notification body. **This product does not have end-to-end encryption and must not claim it** | Open; decide in Phase 8 |
| M7 | `org_code` is not unique | Fixed by migration; **needs applying** |
| M8 | Release signing, cleartext traffic, `WRITE_CONTACTS` unneeded, debug UI in release | Open: Phase 12 |
| L1 | `google-services.json` and `GoogleService-Info.plist` are tracked. Normal for client config, but restrict the API keys in Google Cloud | Open: Phase 12 |

## 5. Database changes required

Existing tables stay. All changes are additive, unless noted.

| Phase | Tables and changes |
| --- | --- |
| 2 | **`user_session`** (new). `user_device.session_id`. `user_master.country_code` and unique `(country_code, mobile_no)`. Unique `org_code`. Wider `register_otp.otp` for a hash |
| 3 | `conversation_state(owner_uo, peer_uo, last_message_id, unread_count, pinned_at, muted_until, archived_at)`, unique on the pair; self-chat is `owner = peer`. Backfill `user_setting` |
| 4 | `personal_chat_history`: `client_message_id` (unique with sender), `message_type`, `reply_to_chat_id`, `forwarded`, `edited_at`, `deleted_for_everyone_at`, `read_time`, composite `(sender, receiver, chat_id)` and `(receiver, sender, chat_id)` indexes. New: `personal_message_state`, `message_reaction`, `user_block`, `user_report`, `user_contact` |
| 5 | `organization_setting`, `organization_relationship`, `organization_audit_log`, `org_broadcast`, `org_broadcast_target`, `org_broadcast_recipient`. Membership role values. No department table exists, so **department announcements need a new `department` table** |
| 6 | `wp_group`: settings. `group_member`: `last_read_group_chat_id`, `muted_until`, `invited_by`, `status`. `group_chat`: same message fields as Phase 4, plus `(group_id, group_chat_id)` index. New: `group_invite` |
| 7 | `media_file` (owner, org, storage key, mime, size, checksum, thumbnail, scan state). `media` JSON then only references IDs |
| 8 | `notification_preference`. `user_device.last_seen_at` |
| 9 | `status_post`, `status_view`, `status_audience`, `community`, `community_group`, `channel`, `channel_subscriber`, `channel_post` |
| 10 | `call_session`, `call_participant`. `user_device.voip_token` |

### Self-chat architecture

A self message is a normal `personal_chat_history` row where `sender_user_organization_id = receiver_user_organization_id`.

- There is no participants table, so **duplicate participants and duplicate self-conversations cannot exist**.
- The single chat-list row comes from `conversation_state` with `owner = peer`. Its unique key prevents duplicates. It is created on registration and organization join, and backfilled for existing members.
- Delivery goes to the `user:<uo>` room only, so all of that user's devices in that organization sync, and nobody else is reachable.
- Rows are written as `SEEN`. No receipts, presence, typing or push.
- Access follows from the existing check: a user can only read rows where they are sender or receiver, and for self-chat both are the same person.
- It is per membership: self-chat in organization A is separate from organization B, matching "same user and organization".

### Existing group tables

`wp_group`, `group_member`, `group_chat` and `group_chat_view` are usable and should be reused.

- `user_organization_id`-based membership already allows cross-organization members.
- `uq_group_member` plus soft delete means re-adding must revive the row, not insert.
- `group_chat.status` means little for many recipients; per-recipient state lives in `group_chat_view`.
- `read_by_user_organization_id` duplicates `received_to_user_organization_id`; keep it, but stop relying on it.
- Writing a `group_chat_view` row per member needs a group size limit.

### Existing `user_device` FCM implementation

Keep it. Registration, multicast and invalid-token cleanup are sound. Gaps: ownership on delete (fixed), link to session (added), token refresh not re-registered, one organization per phone, `is_active` never set false.

**Decision for Phase 8:** change the unique key to `(fcm_token, user_organization_id)` so a phone receives push for every organization it is signed in to.

## 6. New API endpoints required

All are under `/api/v1`. Every list is cursor-paged.

| Phase | Endpoints |
| --- | --- |
| 2 (done) | `POST /auth/refresh`, `POST /auth/revoke`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` |
| 3 | `GET /auth/organizations`, `POST /auth/switch-organization`, `DELETE /user/account`, `PUT /user/photo`, `GET/PUT /user/settings/privacy`, `GET /chat/self`, `GET /chat/self/messages` |
| 4 | `PATCH/DELETE /chat/messages/:id`, `POST /chat/messages/:id/forward`, `PUT/DELETE /chat/messages/:id/reaction`, `.../star`, `.../pin`, `GET /chat/starred`, `GET /chat/search`, `PATCH /chat/conversations/:id` (pin, mute, archive), `GET /chat/sync?since=`, `POST/DELETE/GET /user/blocks`, `POST /user/reports` |
| 5 | `GET/PUT /organization/settings`, `GET /organization/directory`, `GET/POST /organization/relationships`, `POST .../:id/approve`, `/reject`, `/revoke`, `GET/POST /organization/members/:id/role`, `GET /organization/audit-log`, `POST/GET /broadcasts`, `GET /broadcasts/:id`, `GET /broadcasts/:id/stats`, `GET /broadcasts/inbox`, `POST /organization/invites` |
| 6 | `POST/GET /groups`, `GET/PATCH/DELETE /groups/:id`, `POST/DELETE /groups/:id/members`, `PATCH .../members/:id/role`, `POST /groups/:id/leave`, `POST/GET /groups/:id/invites`, `POST /groups/join/:code`, `GET/POST /groups/:id/messages`, `GET .../messages/:mid/receipts`, `GET /groups/:id/search`, `PATCH /groups/:id/preferences` |
| 7 | `POST /media/uploads`, `PUT /media/uploads/:id`, `POST /media/uploads/:id/complete`, `GET /media/:id/url`, `GET /media/:id` |
| 8 | `GET/PUT /notifications/preferences`, `PATCH /user/device` |
| 9 | `POST/GET /status`, `DELETE /status/:id`, `POST/GET /status/:id/views`, `communities` and `channels` CRUD, subscribe, post |
| 10 | `POST /calls`, `GET /calls`, `GET /calls/:id`, `GET /calls/turn-credentials` |

## 7. New Socket.IO events required

| Phase | Events |
| --- | --- |
| 2 (done) | Server closes sockets on session revocation; `message:error` is sanitized |
| 3 | `self:message`, `session:revoked`, `organization:switched` |
| 4 | `message:ack` (keyed by `clientMessageId`), `sync:request`, `sync:response`, `message:edited`, `message:deleted`, `message:reaction`, `conversation:updated`, sender multi-device `message:new` |
| 5 | `broadcast:new`, `broadcast:stats`, `organization:relationship`, `organization:settings` |
| 6 | `group:message:send`, `group:message:new`, `group:message:delivered`, `group:message:read`, `group:typing:start/stop`, `group:updated`, `group:member:added/removed/role`, `group:removed` |
| 9 | `status:new`, `status:viewed`, `status:deleted`, `channel:post:new` |
| 10 | `call:invite`, `call:ringing`, `call:accept`, `call:reject`, `call:cancel`, `call:end`, `call:busy`, `call:offer`, `call:answer`, `call:ice`, `call:reconnect`, `call:answered-elsewhere` |

## 8. Frontend screens required

| Phase | Screens |
| --- | --- |
| 2 (done) | Session restore and refresh; 6-digit OTP |
| 3 | Sessions and devices, Profile, Organization selection, Self-chat |
| 4 | Contact profile, Message search, Starred, Blocked contacts, Forward picker, plus chat-screen reply, edit, reactions, retry |
| 5 | Organization communication settings, Approved organizations, Pending requests, Broadcast create, Broadcast history and stats, Announcement inbox, Audit log |
| 6 | New group, Group details, Add members, Invite link, Group chat |
| 7 | Attachment menu, Media preview, Viewer, Video player, Voice recorder and player, Document viewer |
| 8 | Notification settings |
| 9 | Replace mock Updates and Communities tabs; status viewer, status editor, status privacy, community, channel |
| 10 | Replace mock Calls tab; Incoming call, Outgoing and active call |
| 11 | Real Settings tab (fifth tab), Privacy, Appearance, Language, App lock, navigation move for chat, shared design components |

## 9. Dependencies and external services

Native libraries must be confirmed against React Native 0.87 and the New Architecture when adopted; none has been tested here.

| Need | Requirement | Who provides it |
| --- | --- | --- |
| SMS | Twilio implemented; other providers plug in. Account, sender ID. For India, DLT registration of sender and template | **You** |
| Database access | Working credentials in `backend/.env` | **You** |
| Firebase | Service account (present locally). **APNs `.p8` key uploaded to Firebase**; production `google-services.json` and plist for final IDs | **You** |
| Apple | Developer account, final bundle ID, push and background capabilities. VoIP push for calls. CallKit | **You** |
| Android | Release keystore, Play Console, full-screen intent declaration for calls | **You** |
| Calls | `react-native-webrtc`, CallKit and ConnectionService integration, **TURN server** (coturn or paid) with time-limited credentials | Library + **your server** |
| Storage | S3-compatible bucket for production; local disk for development. Optional virus scanning | **You** for production |
| Scaling | Redis for Socket.IO adapter, presence and shared rate limits | **You** for production |
| Media libraries | Picker, camera, video player, audio recorder, compressor, thumbnailing (`ffmpeg` or similar on the server) | Library |
| Secure storage | `react-native-keychain` | Library |
| Notifications | `@notifee/react-native` for channels and foreground display | Library |
| Legal and hosting | Privacy policy, HTTPS domain, monitoring, backups | **You** |

## 10. Decisions on ambiguous requirements

| Topic | Decision |
| --- | --- |
| `INTERNAL_ONLY` vs `DISABLED` | Both block external messaging. `INTERNAL_ONLY` still allows relationship requests. `DISABLED` also rejects requests, hides the organization from the directory, and suspends approved relationships without revoking them |
| Is `ALL_ORGANIZATIONS` one-sided? | **No.** Both sides must allow it: `allows(A,B) && allows(B,A)`, where `allows` is true for `ALL_ORGANIZATIONS`, or for `SELECTED_ORGANIZATIONS` with an approved relationship. One organization can never override another's restriction |
| Default for existing organizations | `INTERNAL_ONLY`, internal chat on, so behavior does not change on upgrade |
| Revocation effects | History stays readable by its participants. New messages are blocked immediately. External group members become suspended, not deleted |
| Where permissions live | One `communicationPolicy` service called by REST, sockets and push |
| Broadcast privacy | Each recipient gets their own copy and sees only the sender organization. Other organizations and recipients are never listed. The sender sees **per-organization totals** and individual names only for its own members. A target organization must permit the sender under the policy above. Replies are off for announcements, and any allowed reply goes only to the sender |
| Departments | Not in the data model. A `department` table is added in Phase 5 |
| First organization admin | Phase 5 ships a server-side CLI command that promotes a named member. There is no API path for becoming the first admin |
| Joining an organization | The code alone stops being sufficient in Phase 5: invitation or admin approval is required |
| "Contacts" in privacy settings | Until `user_contact` exists in Phase 4: someone you have exchanged a message with |
| End-to-end encryption | Not implemented, and not to be claimed. Messages are encrypted in transit once HTTPS is deployed, and readable by the server |

## 11. Phased checklist

Phases 1 to 12 are implemented. What each delivered, what is limited or missing, and how to test it are in `docs/PROJECT_STATUS.md`; deployment is in `docs/DEPLOYMENT.md`.
