# Enterprise Lead Management — Architecture

## Overview

Extends the existing HindHolidays lead module with 18 enterprise capabilities while preserving:
- Multi-branch scoping (`branchId`)
- RBAC (`requirePermission`, `authorize`)
- Real-time notifications (Socket + `Notification` model)
- Existing auto-assignment, reactivation, quotations, WhatsApp

Implementation is phased. **Phase 1** (this sprint) delivers persisted timeline, audit logs, duplicate detection, scoring/temperature/aging, soft-delete recycle bin, and API hooks for downstream features.

---

## MongoDB Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `leads` (extended) | Core lead record | `temperature`, `smartScore`, `agingBucket`, `alternatePhone`, `isDeleted`, `deletedAt`, `deletedBy`, `slaContactedAt`, `slaBreached`, `firstContactAt`, `responseRate`, `isVip` |
| `leadactivities` | **Timeline** (immutable events) | `leadId`, `branchId`, `type`, `title`, `description`, `actorId`, `actorName`, `meta`, `createdAt` |
| `auditlogs` | **Audit trail** (field-level) | `entityType`, `entityId`, `branchId`, `action`, `actorId`, `changes[]`, `ip`, `createdAt` |
| `callnotes` | Post-call mandatory notes | `leadId`, `branchId`, `userId`, `outcome`, `notes`, `duration`, `createdAt` |
| `leadescalations` | Follow-up SLA escalations | `leadId`, `followUpId`, `branchId`, `level` (15m/30m/1h), `notifiedRoles[]`, `resolvedAt` |
| `leadmergelogs` | Merge history | `sourceLeadId`, `targetLeadId`, `mergedBy`, `snapshot` |
| `leadassignmentlogs` (exists) | Transfer/assign history | extended for bulk transfer |

Existing: `leadnotes`, `followups`, `quotations`, `whatsappmessages`, `notifications`, `activitylogs` (24h TTL — kept for system panel; **not** per-lead audit).

---

## Lead Activity Types (Timeline)

```
lead_created | lead_assigned | lead_reassigned | lead_transferred
call_made | whatsapp_sent | followup_created | followup_completed | followup_missed
quotation_created | quotation_sent | quotation_approved | quotation_rejected
status_changed | lead_edited | lead_lost | lead_reactivated | lead_converted
lead_merged | lead_deleted | lead_restored | note_added | call_note_added
sla_breached | escalation_created
```

Display: `GET /api/leads/:id/timeline` → descending `createdAt`.

---

## Audit Log Actions

```
lead.created | lead.updated | lead.deleted | lead.restored
lead.assigned | lead.reassigned | lead.transferred | lead.merged
lead.status_changed | quotation.updated | user.deleted
```

Each entry stores `changes: [{ field, oldValue, newValue }]`.

---

## API Structure

### Core leads (`/api/leads`) — extended

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/check-duplicate` | `leads.view` | Query `phone`, `email`, `alternatePhone` |
| GET | `/:id/timeline` | `leads.view` | Persisted activity feed |
| GET | `/:id/audit` | `leads.view` | Field-level audit (admin/manager) |
| POST | `/:id/call-notes` | `leads.view` | Add call note (executive+) |
| GET | `/recycle-bin` | `leads.view` | Soft-deleted leads |
| POST | `/:id/restore` | `leads.edit` | Restore from recycle bin |
| DELETE | `/:id/permanent` | `leads.delete` | Admin permanent delete |
| POST | `/merge` | `leads.edit` | Merge duplicates |
| POST | `/bulk` | varies | Bulk assign/status/export/delete |
| GET | `/analytics/aging` | `reports.view` | Aging buckets |
| GET | `/analytics/sources` | `reports.view` | Source conversion analytics |

### Reminders (`/api/reminders`)

Centralized follow-up reminders: today, missed, upcoming, overdue.

### Escalations (`/api/escalations`)

Scheduler creates escalation logs + notifies TL/Manager/Admin.

---

## RBAC Mapping

### Extended `leads` actions

| Action | admin | sales_manager | team_leader | sales_executive |
|--------|-------|---------------|-------------|-----------------|
| view | ✓ | ✓ | ✓ | ✓ |
| create | ✓ | ✓ | ✗ | ✗ |
| edit | ✓ | ✓ | ✓ | ✗ |
| delete | ✓ | ✗ | ✗ | ✗ |
| assign | ✓ | ✓ | ✓ | ✗ |
| reassign | ✓ | ✓ | ✓ | ✗ |
| transfer | ✓ | ✓ | ✗ | ✗ |
| merge | ✓ | ✓ | ✗ | ✗ |
| restore | ✓ | ✓ | ✗ | ✗ |
| bulk | ✓ | ✓ | partial | ✗ |
| duplicate_override | ✓ | ✓ | ✗ | ✗ |
| export | ✓ | ✓ | ✓ | ✗ |

Enforced via `requirePermission('leads', action)` + role `authorize()` for sensitive ops.

---

## State Management (Frontend)

| Store / Hook | Data |
|--------------|------|
| React Query `['leads', filters]` | Paginated list (existing) |
| React Query `['lead', id]` | Detail + followups |
| React Query `['lead-timeline', id]` | Persisted timeline |
| React Query `['lead-duplicate']` | Duplicate check on wizard |
| React Query `['reminders']` | Reminder center |
| React Query `['dashboard-kpis']` | Role KPIs + aging |
| Redux `branch` | Branch filter (existing) |

---

## Notification Events (extended)

```js
lead_duplicate_detected | lead_merged | lead_deleted | lead_restored
lead_sla_breach | followup_escalation_15m | followup_escalation_30m | followup_escalation_1h
lead_temperature_hot | call_note_required
```

Scheduler (`notificationScheduler.js`) adds escalation + SLA breach checks every 5 min.

---

## Lead Scoring & Temperature

**`smartScore` (0–100)** computed on save:

| Factor | Weight |
|--------|--------|
| Budget | 25% |
| Travel date proximity | 20% |
| Response rate | 15% |
| Follow-up completion | 20% |
| Quotation status | 20% |

**`temperature`**: `hot` | `warm` | `cold` | `vip`

Rules: `isVip` OR budget ≥ ₹3L → VIP; score ≥ 75 → Hot; ≥ 45 → Warm; else Cold.

**`agingBucket`**: `0_7` | `8_15` | `16_30` | `30_plus` (from `createdAt`).

---

## SLA Tracking

- Default: contact within **15 minutes** of lead creation (`slaMinutes: 15`)
- `firstContactAt` set on first call/note/status→contacted
- `slaBreached: true` if exceeded → notify managers

---

## Implementation Phases

| Phase | Features |
|-------|----------|
| **1** (current) | Timeline, Audit, Duplicate check, Score/Temp/Aging, Recycle bin soft-delete, API hooks |
| **2** | Call notes, Escalation scheduler, Reminder center, Bulk actions |
| **3** | Merge tool, Transfer history, Kanban role expansion |
| **4** | Executive performance, Source analytics, Dashboard KPIs |
| **5** | SLA dashboard, Full audit UI, Polish |

---

## File Map (Phase 1)

```
backend/src/models/LeadActivity.js
backend/src/models/AuditLog.js
backend/src/services/leadActivityService.js
backend/src/services/leadAuditService.js
backend/src/services/leadScoringService.js
backend/src/services/duplicateDetectionService.js
backend/src/controllers/enterpriseLeadController.js
backend/src/routes/enterpriseLeadRoutes.js (mounted in leadRoutes)
frontend/src/services/leadEnterpriseApi.js
frontend/src/components/leads/DuplicateLeadWarning.jsx
frontend/src/components/leads/LeadScoreBadge.jsx
frontend/src/components/leads/LeadTemperatureBadge.jsx
```
