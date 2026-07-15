# Offline POS Authorization Policy

## Decision Status

- **Status:** Accepted
- **Effective date:** 2026-07-14
- **Scope:** Sales Point of Sale (POS) terminals only
- **Decision:** A successfully paired POS terminal does not lose offline access because of a local time limit.

This is a deliberate operational decision. The bakery requires an already-enrolled sales terminal to remain usable during extended network outages, including after the POS page or browser is reloaded.

## Policy

An enrolled POS terminal may continue operating offline for an indefinite period while all of the following remain available on the device:

- The terminal's local pairing identity and device credential.
- The cached POS application shell.
- The last synchronized terminal snapshot in IndexedDB.
- The browser's site data and service-worker storage.

The application must not reject an otherwise valid local terminal snapshot solely because of its age. There is no maximum offline authorization duration in the current design.

This policy does not guarantee that browser storage will persist forever. Clearing site data, using browser privacy controls, storage eviction, device loss, or application removal can delete the local terminal identity and require Admin-controlled re-pairing.

## Items That Still Expire

Indefinite terminal offline access does not remove expiry rules from other credentials or business approvals:

- A POS pairing code is an enrollment credential and remains valid for one hour or until it is used.
- Retailer credit-order approvals retain their own expiry and usage rules.
- A terminal-specific approval cannot be reused after it has been consumed.
- Online authentication cookies and public display tokens retain their configured server-side rules.

## Revocation Semantics

An offline device cannot receive an immediate server-side revocation. The following Admin actions become enforceable on that device when it reconnects and communicates with the server:

- Deactivating the terminal.
- Disabling offline operation.
- Re-pairing the terminal or rotating its device credential.
- Changing stock or retailer-credit allocations.
- Updating products, prices, retailer status, or other POS configuration.

Queued transactions are validated against current server rules during synchronization. A transaction that is no longer valid may be rejected or placed in reconciliation instead of being silently accepted.

## Accepted Security Tradeoff

The bakery accepts that a lost, stolen, or improperly retained device may continue using its last synchronized permissions while it remains disconnected. It may also operate with stale prices, allocations, or account information until reconnection.

The financial exposure is constrained by terminal stock custody, terminal retailer-credit allocations, single-use approvals, synchronization reconciliation, and terminal-aware day close. These controls reduce risk but do not provide immediate remote revocation while the device has no network connection.

## Required Operational Controls

The following controls are mandatory while indefinite offline access remains enabled:

1. Assign each POS terminal identity to one controlled physical device or browser profile.
2. Protect the device with an operating-system account, screen lock, and restricted physical access.
3. Do not share pairing codes or terminal device credentials between devices.
4. Reconnect and synchronize each active terminal regularly, preferably before daily close.
5. Review terminal `lastSeenAt` and `lastSyncedAt` values and investigate stale terminals.
6. Resolve failed or conflicting offline transactions through the reconciliation workflow.
7. Deactivate a lost or retired terminal immediately and reconcile its remaining stock and credit allocations.
8. Clear browser site data before a device is reassigned, sold, or removed from service.
9. Use the terminal-aware day-close controls to identify terminals that have not synchronized through the close cutoff.

## Lost Device and Replacement Procedure

When a terminal device is lost, compromised, or replaced:

1. Admin deactivates the affected terminal immediately.
2. Admin reviews its last synchronization time, queued-sale risk, stock custody, and retailer-credit allocation.
3. Management reconciles any unresolved stock or credit exposure.
4. Admin creates or re-pairs a terminal for the replacement device using a new pairing code and device credential.
5. The old terminal identity must not be reused until its custody and synchronization state are reconciled.

## Verification Requirements

Automated and browser testing should verify that:

- A paired POS terminal survives reloads and extended offline operation without a time-based authorization failure.
- An offline cold start loads the cached POS shell and terminal snapshot when browser data still exists.
- Clearing browser storage removes the local terminal identity and requires Admin-controlled re-pairing.
- A deactivated or re-paired terminal is rejected when it reconnects.
- Invalid queued transactions are surfaced for reconciliation during synchronization.
- Expired or consumed retailer approvals cannot be used, even though terminal offline access itself has no expiry.

## Review Triggers

This decision must be reviewed if any of the following changes occur:

- POS devices become shared, unmanaged, or routinely taken off-site.
- The bakery expands to multiple branches with longer synchronization gaps.
- Fraud, compliance, insurance, or audit requirements demand bounded offline authorization.
- Terminal stock or credit allocations no longer provide an acceptable exposure limit.
- The business requires immediate remote revocation of disconnected devices.

Possible future controls include a local cashier PIN, device certificates, managed-device enforcement, a configurable maximum offline period, or a branch-local server. Introducing any of these would be a new architecture and business-policy decision.
