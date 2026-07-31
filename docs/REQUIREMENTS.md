# Listly — Requirements baseline

| Field                 | Value                                   |
| --------------------- | --------------------------------------- |
| Document              | `BW-LISTS-REQ-001`                      |
| Version               | 1.1                                     |
| Status                | Implemented (v1)                        |
| Last review           | 2026-07-30                              |
| Owner                 | Bruno Winkeler                          |
| Applies to            | `bwinkeler-lists` (`service_id: lists`) |
| Platform architecture | `BW-PLATFORM-ARCH-001` v1.3             |

Listly is a collaborative lists web application on the `bwinkeler.com` platform.
Authenticated users create lists of items, organize them into per-list categories,
and reorder by drag-and-drop; a list Owner invites other users to collaborate as
Editors; content changes propagate to connected members in near real time.

This document is the normative requirements baseline. It follows the platform
contract in `../../ARCHITECTURE.md` (`BW-PLATFORM-ARCH-001` v1.3); where the two
conflict, the architecture and its precedence rules prevail.

Legend: statements are mandatory (`shall`) unless marked otherwise. Verification
methods — **T** = Test, **A** = Analysis, **I** = Inspection, **D** = Demonstration.

---

## 1. Context and scope

The product replaces the earlier `shopping-list` and `home-quests` concepts from
the platform architecture with a single, generic collaborative-lists application.
It follows the platform contract: own repository/subdomain/Compose, shared Caddy
and shared PostgreSQL, same-origin WebSocket, single backend replica, no Redis, no
object storage, and invite-only accounts.

### 1.1 Objectives

| ID  | Objective                                                                                         |
| --- | ------------------------------------------------------------------------------------------------- |
| O1  | Let a user create and manage lists of items in both a simple kind and a richer task kind.         |
| O2  | Let a list Owner control who collaborates on each list.                                           |
| O3  | Reflect a shared list's changes to all active collaborators in near real time.                    |
| O4  | Keep list data private to its members, reliable, and portable per the platform architecture.      |
| O5  | Help users organize and reach lists at scale: per-list categories, list duplication, and pinning. |

### 1.2 Identity and publication

| Field               | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `service_id`        | `lists`                                                                                  |
| Domain              | `lists.bwinkeler.com`                                                                    |
| Compose project     | `bw-lists`                                                                               |
| Repository / folder | `bwinkeler-lists`                                                                        |
| List kinds (v1)     | `simple` (shopping, daily activities, goals) and `task` (adds due date, assignee, notes) |

### 1.3 Scope exclusions (v1)

Presence / typing indicators; offline editing; email or push notifications;
additional notification events beyond invitation and task assignment; file
attachments (object storage); ownership transfer; item priority, multi-label
tagging, and subtasks; a distinct `shopping` kind or item quantity; multiple
backend replicas and Redis; internationalization; native mobile applications;
public self-registration.

---

## 2. Assumptions and applicable standards

**Applicable references:** ISO/IEC/IEEE 29148 (requirements quality and
structure), ISO/IEC 25010 (product-quality attributes), EARS (requirement
phrasing), and `../../ARCHITECTURE.md` v1.3 (binding platform constraints).
General software context — no safety, medical, or other regulated regime is
assumed.

| ID  | Assumption                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Single generic application with list kinds `simple` and `task`.                                                                                                                                                   |
| A2  | Membership roles: Owner and Editor only (no Viewer).                                                                                                                                                              |
| A3  | Only the Owner manages membership, deletes a list, and sets its kind; an Editor may rename a list and perform all item operations.                                                                                |
| A4  | Task items add assignee, due date, and notes; manual ordering applies to all kinds. No priority, labels, subtasks, or attachments.                                                                                |
| A5  | Concurrency resolved by last-write-wins per field, using a server-authoritative version or timestamp.                                                                                                             |
| A6  | Online-only, optimistic UI, full resync on reconnect.                                                                                                                                                             |
| A7  | No presence or typing indicators.                                                                                                                                                                                 |
| A8  | Real-time propagation p95 ≤ 2 s.                                                                                                                                                                                  |
| A9  | In-app notifications only for two events (list invitation, task assignment); no email or push.                                                                                                                    |
| A10 | English-only UI, responsive web only.                                                                                                                                                                             |
| A11 | Invite-only accounts; a share target is identified by an existing account's email and must accept the invitation before gaining access.                                                                           |
| A12 | Single backend replica, no Redis, no object storage.                                                                                                                                                              |
| A13 | Family scale (fewer than 50 users); no special regulatory regime.                                                                                                                                                 |
| A14 | Implementation-independent; no fixed language or framework constraint recorded.                                                                                                                                   |
| A15 | Items may belong to at most one per-list category; categories are managed per list, may have a color, and have a manual order; items without a category appear in an "Uncategorized" group shown last.            |
| A16 | A user with access to a list may duplicate it; options exclude completed items or reset copied items to open; the copy is owned by the duplicating user, copies the categories, and does not copy item assignees. |
| A17 | A user may pin lists; pinned lists appear first in that user's own overview. Pinning is per user.                                                                                                                 |

---

## 3. Requirement catalog

### 3.1 Accounts and access (LST-ACC)

| ID          | Requirement                                                                                                                                                                                                                                                              | Trace        | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| LST-ACC-001 | The system shall require an authenticated session for every list, item, sharing, and real-time operation.                                                                                                                                                                | O4; §14, §15 | T      |
| LST-ACC-002 | The system shall not provide public self-registration; accounts shall be created only by an administrator or by invitation.                                                                                                                                              | A11; §15     | I      |
| LST-ACC-003 | The system shall store user passwords using Argon2id or a framework-approved memory-hard algorithm.                                                                                                                                                                      | §15          | A      |
| LST-ACC-004 | The system shall persist sessions in PostgreSQL and issue session cookies with the Secure, HttpOnly, and an appropriate SameSite attribute.                                                                                                                              | §14.2        | T      |
| LST-ACC-005 | While handling authentication and account-recovery requests, the system shall apply rate limiting and shall return messages that do not reveal whether an account exists.                                                                                                | §15          | T      |
| LST-ACC-006 | The system shall support session revocation, rotation, and a bounded session lifetime.                                                                                                                                                                                   | §14.2        | T      |
| LST-ACC-007 | When a user account is deleted, the system shall cascade-delete all lists owned by that account, including their items, memberships, and pending invitations, and shall remove that account's memberships in lists owned by others. Ownership transfer is not supported. | O4; §3       | T      |

### 3.2 Lists (LST-LST)

| ID          | Requirement                                                                                                                                                                                                                                                         | Trace           | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| LST-LST-001 | The system shall allow an authenticated user to create a list with a non-empty name and a kind chosen from the supported kinds.                                                                                                                                     | O1              | T      |
| LST-LST-002 | The system shall support the list kinds `simple` and `task` in v1, where `simple` serves shopping, daily-activity, and goal lists.                                                                                                                                  | O1; A1          | T      |
| LST-LST-003 | The system shall assign the creating user as the single Owner of a new list.                                                                                                                                                                                        | O2              | T      |
| LST-LST-004 | The system shall treat a list's kind as immutable after creation.                                                                                                                                                                                                   | A1              | T      |
| LST-LST-005 | The system shall allow a user to view all and only the lists they own or of which they are a member.                                                                                                                                                                | O4; LST-SEC-001 | T      |
| LST-LST-006 | The system shall allow an Owner or an Editor of a list to rename it.                                                                                                                                                                                                | A3              | T      |
| LST-LST-007 | Only the Owner shall be able to delete a list.                                                                                                                                                                                                                      | A3              | T      |
| LST-LST-008 | When a list is deleted, the system shall remove all of that list's items, memberships, and pending invitations.                                                                                                                                                     | O4              | T      |
| LST-LST-009 | The system shall allow a user to own and be a member of multiple lists simultaneously.                                                                                                                                                                              | O1              | T      |
| LST-LST-010 | The system shall allow a user with access to a list to duplicate it, copying its categories and items, with options to exclude completed items or to reset copied items to open; the copy shall be owned by the duplicating user and shall not copy item assignees. | O5; A16         | T      |
| LST-LST-011 | The system shall allow a member to pin or unpin a list for their own account and shall present that user's pinned lists before their other lists.                                                                                                                   | O5; A17         | T      |
| LST-LST-012 | The list-creation form shall select the `simple` list kind by default while allowing the user to choose `task`.                                                                                                                                                     | O1; A1          | T      |

### 3.3 Items (LST-ITM)

| ID          | Requirement                                                                                                                                                         | Trace  | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| LST-ITM-001 | The system shall allow an Owner or Editor to add an item with a non-empty title directly to a selected category or to the Uncategorized group.                      | O1; O5 | T      |
| LST-ITM-002 | The system shall allow an Owner or Editor to edit an item's title.                                                                                                  | O1     | T      |
| LST-ITM-003 | The system shall allow an Owner or Editor to toggle an item's status between open and done.                                                                         | O1     | T      |
| LST-ITM-004 | The system shall allow an Owner or Editor to delete an item.                                                                                                        | O1     | T      |
| LST-ITM-005 | The system shall allow an Owner or Editor to set the manual position of items within a list and shall persist that order.                                           | A4     | T      |
| LST-ITM-006 | Where the list kind is `task`, the system shall allow an Owner or Editor to set or clear an item's optional due date.                                               | A4     | T      |
| LST-ITM-007 | Where the list kind is `task`, the system shall allow an Owner or Editor to set or clear an item's optional notes.                                                  | A4     | T      |
| LST-ITM-008 | Where the list kind is `task`, the system shall allow an Owner or Editor to assign an item to a current member of the list or leave it unassigned.                  | A4     | T      |
| LST-ITM-009 | If an item is assigned to a user who is not a current member of the list, then the system shall reject the assignment.                                              | A4     | T      |
| LST-ITM-010 | Where the list kind is `simple`, the system shall use only the core item attributes (title, status, position) and shall not require a due date, assignee, or notes. | A1     | T      |
| LST-ITM-011 | The system shall record creation and last-update timestamps for each item.                                                                                          | O4     | I      |

### 3.4 Categories (LST-CAT)

| ID          | Requirement                                                                                                                                           | Trace   | Verify |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| LST-CAT-001 | The system shall allow an Owner or Editor to create a category with a non-empty name within a list.                                                   | O5; A15 | T      |
| LST-CAT-002 | The system shall allow an Owner or Editor to rename a category.                                                                                       | O5; A15 | T      |
| LST-CAT-003 | When a category is deleted, the system shall move its items to the Uncategorized group rather than deleting them.                                     | O5; A15 | T      |
| LST-CAT-004 | The system shall allow an Owner or Editor to set the manual order of categories and shall persist that order.                                         | O5; A15 | T      |
| LST-CAT-005 | The system shall allow an Owner or Editor to set or clear a category's color from a defined palette.                                                  | O5; A15 | T      |
| LST-CAT-006 | The system shall allow an Owner or Editor to place an item in at most one category or leave it uncategorized, and to move an item between categories. | O5; A15 | T      |
| LST-CAT-007 | The system shall display the Uncategorized group after all categories and shall preserve a manual item order within each group.                       | O5; A15 | T      |
| LST-CAT-008 | The system shall scope categories to a single list and make them accessible only to that list's members.                                              | O4; A15 | T      |

### 3.5 Sharing and authorization (LST-SHR)

| ID          | Requirement                                                                                                                                                                                                     | Trace      | Verify |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| LST-SHR-001 | Only the Owner of a list shall be able to invite a user to that list as an Editor.                                                                                                                              | A3         | T      |
| LST-SHR-002 | The system shall support exactly two membership roles: Owner and Editor.                                                                                                                                        | A2         | T      |
| LST-SHR-003 | The system shall grant an Editor the ability to perform all item operations (add, edit, complete, delete, reorder, and task-field operations) and to rename lists of which they are a member.                   | O2; A3     | T      |
| LST-SHR-004 | Only the Owner shall be able to remove a member from a list.                                                                                                                                                    | A3         | T      |
| LST-SHR-005 | When the Owner removes a member, the system shall revoke that user's access to the list, including terminating any active WebSocket subscription for that list, within the real-time propagation window.        | O2, O4     | T      |
| LST-SHR-006 | The system shall enforce role-based authorization for every list and item operation on both the HTTP and the WebSocket interface.                                                                               | §12.4, §14 | T      |
| LST-SHR-007 | The system shall let the Owner invite a share target by the target user's registered account email and shall reject an invitation addressed to a non-existent account.                                          | A11        | T      |
| LST-SHR-008 | The system shall ensure a list has exactly one Owner at all times.                                                                                                                                              | O2         | A      |
| LST-SHR-009 | The system shall create an invitation in a pending state and shall not grant the invited user any access to the list until the invitation is accepted.                                                          | A11        | T      |
| LST-SHR-010 | The system shall allow the invited user to accept or decline a pending invitation; on acceptance the user shall become an Editor member, and on decline the invitation shall be removed with no access granted. | A11        | T      |
| LST-SHR-011 | The system shall allow the Owner to cancel a pending invitation before it is accepted.                                                                                                                          | A11        | T      |

### 3.6 Real-time collaboration (LST-RTC)

| ID          | Requirement                                                                                                                                                                                                                                                                                                            | Trace       | Verify |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| LST-RTC-001 | When an Owner or Editor changes the content of a shared list (item add, edit, status change, delete, reorder, move between categories, task-field change; category add, rename, delete, reorder, or recolor; or membership change), the system shall propagate the change to all other connected members of that list. | O3          | T      |
| LST-RTC-002 | The system shall deliver real-time changes to connected members with a 95th-percentile end-to-end propagation time ≤ 2 s under the expected concurrent load on a single backend instance.                                                                                                                              | A8          | T      |
| LST-RTC-003 | The system shall provide the real-time channel over an authenticated WebSocket at path `/ws`, on the same origin as the application, using wss.                                                                                                                                                                        | §9.4, §10.3 | T      |
| LST-RTC-004 | When a client establishes or re-establishes a subscription to a list, the system shall send the authoritative current state of that list.                                                                                                                                                                              | O3; §12.4   | T      |
| LST-RTC-005 | The system shall resolve concurrent edits to the same item field using last-write-wins based on a server-assigned version or timestamp, so that all connected clients converge to identical state.                                                                                                                     | A5          | T      |
| LST-RTC-006 | After a disconnection, the client shall reconnect using backoff with jitter and shall perform a full state resynchronization on reconnect.                                                                                                                                                                             | A6; §12.4   | D      |
| LST-RTC-007 | The system shall authorize each real-time message against the sender's role and membership for the target list.                                                                                                                                                                                                        | §12.4       | T      |
| LST-RTC-008 | The system shall treat mutating real-time commands as idempotent via a client-provided idempotency key, so that a retried command is applied at most once.                                                                                                                                                             | §12.4       | T      |
| LST-RTC-009 | The system shall persist a content change to PostgreSQL before or atomically with broadcasting it, so that no acknowledged change is lost on backend restart.                                                                                                                                                          | §12.1       | T      |
| LST-RTC-010 | While the real-time channel is unavailable, the system shall remain usable for reading and editing over HTTP and shall reconcile state when the channel is restored.                                                                                                                                                   | A6          | D      |
| LST-RTC-011 | The client may apply a change locally before server confirmation and shall reconcile to the server's authoritative state when they differ.                                                                                                                                                                             | A6          | D      |

### 3.7 Notifications (LST-NTF)

| ID          | Requirement                                                                                                                         | Trace  | Verify |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| LST-NTF-001 | When the Owner invites a user to a list, the system shall create an in-app notification for the invited user.                       | O2; A9 | T      |
| LST-NTF-002 | Where the list kind is `task` and an item is assigned to a member, the system shall create an in-app notification for the assignee. | A9     | T      |
| LST-NTF-003 | The system shall present a user's in-app notifications only to that user.                                                           | O4     | T      |
| LST-NTF-004 | The system shall allow a user to mark their in-app notifications as read.                                                           | A9     | T      |

### 3.8 Data and persistence (LST-DAT)

| ID          | Requirement                                                                                                                                                             | Trace   | Verify |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| LST-DAT-001 | The system shall persist all account, list, category, item, membership, invitation, notification, and session data in the application's PostgreSQL database `lists_db`. | O4; §11 | I      |
| LST-DAT-002 | The system shall treat PostgreSQL as the single source of truth for list state; the backend shall not hold list state that cannot be reconstructed from PostgreSQL.     | §12.1   | A      |
| LST-DAT-003 | The system shall manage all schema changes exclusively through versioned migrations.                                                                                    | §11.6   | I      |
| LST-DAT-004 | The runtime backend shall connect using the least-privilege `lists_runtime` role and shall not perform DDL.                                                             | §11.2   | A      |
| LST-DAT-005 | The system shall not store permanent data in the container filesystem.                                                                                                  | §14     | A      |
| LST-DAT-006 | The backend shall retry its PostgreSQL connection with backoff and shall not rely on a fixed startup order.                                                             | §11.5   | T      |

### 3.9 Quality (LST-QUA) — ISO/IEC 25010

| ID          | Requirement                                                                                                                                                | Trace   | Verify |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| LST-QUA-001 | The system shall open a list of up to 500 items with a load time ≤ 1.5 s p95 on the target VPS.                                                            | O1      | T      |
| LST-QUA-002 | The system shall support at least 50 accounts, 20 members per list, 1000 items per list, and 20 concurrent WebSocket clients without functional failure.   | §2, §23 | T      |
| LST-QUA-003 | The system shall meet a recovery point objective ≤ 24 h and a recovery time objective ≤ 4 h via the platform backup and restore.                           | §20     | A      |
| LST-QUA-004 | After any disconnect and reconnect cycle, all connected clients of a list shall converge to identical state.                                               | A5, A6  | T      |
| LST-QUA-005 | The web UI shall be usable from a 320 px viewport up to desktop without horizontal overflow, including viewport-contained notification and color popovers. | A10     | D      |
| LST-QUA-006 | The web UI shall conform to WCAG 2.2 level AA.                                                                                                             | A10     | A      |
| LST-QUA-007 | The application shall satisfy the platform portability checklist.                                                                                          | §25     | I      |
| LST-QUA-008 | The UI shall present all content in English in v1.                                                                                                         | A10     | I      |

### 3.10 Security and privacy (LST-SEC)

| ID          | Requirement                                                                                                                                                                  | Trace      | Verify |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| LST-SEC-001 | The system shall make a list's contents accessible only to that list's Owner and members.                                                                                    | O4         | T      |
| LST-SEC-002 | The system shall validate input on the server and shall use parameterized queries to prevent injection.                                                                      | OWASP      | T      |
| LST-SEC-003 | The system shall encode user-supplied content (titles and notes) on output to prevent stored cross-site scripting.                                                           | OWASP      | T      |
| LST-SEC-004 | The system shall protect state-changing HTTP requests against CSRF and shall verify the Origin of WebSocket connections.                                                     | OWASP      | T      |
| LST-SEC-005 | The system shall record an audit entry (actor, action, target, timestamp) for membership changes — invitations, acceptances, declines, and removals — and for list deletion. | §15        | T      |
| LST-SEC-006 | The system shall not write passwords, tokens, session identifiers, or full item content to logs.                                                                             | §22.2      | I      |
| LST-SEC-007 | The system shall not include any secret in Git, Docker images, or the frontend bundle.                                                                                       | §17, §13.3 | I      |
| LST-SEC-008 | When a user's membership or account is revoked, the system shall deny all subsequent access, including active sessions and WebSocket subscriptions.                          | O4         | T      |
| LST-SEC-009 | The system shall serve all traffic over HTTPS and wss with Cloudflare Full (strict) to the origin.                                                                           | §10.2      | T      |

### 3.11 Operations and deployment (LST-OPS)

| ID          | Requirement                                                                                                                                                         | Trace     | Verify |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| LST-OPS-001 | The application shall deploy as immutable, versioned images built in CI, with no build on the VPS.                                                                  | §18       | I      |
| LST-OPS-002 | The application containers shall not publish host ports and shall join the external networks `bw-edge` and `bw-data` plus a private network `bw-lists-private`.     | §7        | I      |
| LST-OPS-003 | The application shall expose the globally unique network aliases `lists-web` and `lists-api`.                                                                       | §5        | I      |
| LST-OPS-004 | The backend shall expose `/health/live` and `/health/ready` endpoints that reveal no secrets, versions, or stack traces.                                            | §14.1     | T      |
| LST-OPS-005 | The backend shall shut down gracefully on SIGTERM, ceasing acceptance of new traffic before finishing in-flight work.                                               | §14       | T      |
| LST-OPS-006 | The backend shall emit structured logs to stdout and stderr.                                                                                                        | §22.2     | I      |
| LST-OPS-007 | Public routing shall serve `/` to `lists-web` and `/api` and `/ws` to `lists-api` on `lists.bwinkeler.com`, configured in the infrastructure repository.            | §9        | T      |
| LST-OPS-008 | The repository shall include a completed `docs/SERVICE_MANIFEST.md` and a current copy of the platform architecture.                                                | §1.1, §26 | I      |
| LST-OPS-009 | The database `lists_db` shall be included in the platform daily backup.                                                                                             | §20       | I      |
| LST-OPS-010 | Schema changes shall be applied by a single migration job using the migrator role before rollout.                                                                   | §11.6     | T      |
| LST-OPS-011 | The repository shall provide repeatable production scripts for versioned deployment with health verification and rollback, and for securely creating user accounts. | §19; §23  | I      |

### 3.12 Constraints (LST-CON)

| ID          | Requirement                                                                                                                      | Trace |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| LST-CON-001 | The application shall comply with `../../ARCHITECTURE.md` v1.3 and its precedence rules.                                         | §1.4  |
| LST-CON-002 | The application shall not introduce Redis in v1 and shall run a single backend replica.                                          | §12.1 |
| LST-CON-003 | The application shall not use object storage (R2) in v1.                                                                         | §16   |
| LST-CON-004 | The application shall remain implementation-independent regarding language and framework; no stack constraint is recorded in v1. | A14   |
| LST-CON-005 | The v1 scope shall be limited to responsive web and an English-only UI.                                                          | A10   |

---

## 4. Traceability matrix

| Objective                              | Need addressed                          | Requirement groups                              | Architecture references |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------- | ----------------------- |
| O1 — create and manage lists and items | simple and task kinds                   | LST-LST, LST-ITM                                | §2                      |
| O2 — controlled sharing                | Owner manages access; invite-to-accept  | LST-SHR, LST-ACC, LST-NTF                       | §15                     |
| O3 — real-time collaboration           | live updates and resync                 | LST-RTC                                         | §9.4, §10.3, §12        |
| O4 — private, reliable, portable       | privacy, persistence, backup, lifecycle | LST-SEC, LST-DAT, LST-QUA, LST-OPS, LST-ACC-007 | §11, §14, §17, §20, §25 |
| O5 — organize and reach lists at scale | categories, duplication, pinning        | LST-CAT, LST-LST-010, LST-LST-011               | §2                      |

Every catalog item traces to an objective or to a binding architecture clause; no
orphan requirements. Non-behavioral platform obligations (LST-OPS, LST-CON) trace
directly to architecture sections.

---

## 5. Coverage and quality risks

- **Notes-field concurrency (Major, accepted).** Last-write-wins per field
  (LST-RTC-005) overwrites the whole `notes` field, so simultaneous edits to the
  same task's notes can lose text. Accepted for v1; character-level merge is out
  of scope.
- **Cascade delete is destructive (Major, accepted).** Deleting an Owner's account
  (LST-ACC-007) irreversibly removes their lists and revokes every collaborator's
  access to that shared data, with no ownership transfer. The UI should confirm
  this consequence before deletion.
- **Single backend replica (Minor, accepted).** Real-time availability is bound to
  one instance; a restart drops WebSocket connections, mitigated by reconnect and
  resync (LST-RTC-006). Adding replicas later requires a message bus (architecture
  §12.5).
- **Pending-invitation visibility (Minor).** A list invited but not yet accepted
  grants no access until acceptance (LST-SHR-009); the Owner should see the pending
  state to avoid confusion.

---

## 6. Decision log

| ID     | Decision                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-01 | One generic "lists" application with kinds `simple` and `task`, rather than separate apps per list type.                                                                  |
| DEC-02 | Naming: `service_id` `lists`, domain `lists.bwinkeler.com`, repository `bwinkeler-lists`, Compose project `bw-lists`.                                                     |
| DEC-03 | Membership roles limited to Owner and Editor.                                                                                                                             |
| DEC-04 | Only the Owner manages membership, deletes a list, and sets its kind; Editors may rename and edit content.                                                                |
| DEC-05 | Sharing is invite-to-accept, addressed to a registered account email.                                                                                                     |
| DEC-06 | Concurrency resolved by last-write-wins per field.                                                                                                                        |
| DEC-07 | Online-only with resync on reconnect; no presence or typing indicators.                                                                                                   |
| DEC-08 | In-app notifications for two events — list invitation and task assignment; no email or push in v1.                                                                        |
| DEC-09 | Account deletion cascade-deletes owned lists; no ownership transfer.                                                                                                      |
| DEC-10 | English-only, responsive web only; implementation-independent.                                                                                                            |     | DEC-11 | Items are organized into optional per-list categories (at most one per item), each with a color and a manual order; an Uncategorized group is always shown last. Multi-label tagging remains out of scope. |
| DEC-12 | A list can be duplicated with options to exclude or reset completed items; the copy is owned by the duplicating user, copies the categories, and does not copy assignees. |
| DEC-13 | Lists can be pinned per user to appear first in that user's overview.                                                                                                     |
| DEC-14 | Product/display name is "Listly"; the platform identifiers (`service_id` `lists`, domain, repository, Compose project, database) are unchanged.                           |

---

## 7. Deferred and future scope

Ownership transfer; email and push notifications; additional notification events;
offline editing; presence and typing indicators; item priority, labels, subtasks,
and attachments (object storage); optional item quantity or a distinct `shopping`
kind; multiple backend replicas with Redis or an equivalent bus;
internationalization; and native mobile applications. Each remains addable without
breaking the v1 contract, per the platform's gradual-evolution strategy
(architecture §24).
