# Notification System Design

---

## Stage 1

### REST API Design for Campus Notification Platform

#### Core Actions / Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notifications` | Fetch all notifications for the logged-in student |
| GET | `/api/v1/notifications/:id` | Fetch a single notification |
| PATCH | `/api/v1/notifications/:id/read` | Mark a notification as read |
| PATCH | `/api/v1/notifications/read-all` | Mark all notifications as read |
| DELETE | `/api/v1/notifications/:id` | Delete a notification |
| GET | `/api/v1/notifications/unread-count` | Get count of unread notifications |

#### JSON Request / Response Schemas

**GET /api/v1/notifications**
```
Headers:
  Authorization: Bearer <token>
  Accept: application/json

Query Params (optional):
  ?type=Placement|Event|Result
  ?isRead=true|false
  ?page=1&limit=20

Response 200:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "Google hiring drive on 10th June",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

**PATCH /api/v1/notifications/:id/read**
```
Headers:
  Authorization: Bearer <token>

Response 200:
{
  "id": "uuid",
  "isRead": true,
  "updatedAt": "2026-04-22T18:00:00Z"
}
```

#### Real-Time Notifications Mechanism

Use **WebSockets (Socket.IO)** or **Server-Sent Events (SSE)**:

- Each student connects to a persistent channel on login.
- When the HR broadcasts a notification, the server pushes it instantly to all connected students.
- Channel naming convention: `notifications:student:<studentID>`

```
// Client subscribes:
socket.on("notification", (data) => {
  // data: { id, type, message, createdAt }
  displayNotification(data);
});
```

---

## Stage 2

### Persistent Storage

**Recommended DB: PostgreSQL (Relational)**

**Rationale:**
- Notifications have a clear relational structure (student → notifications).
- SQL joins are useful for queries like "all unread placements for student X".
- ACID compliance ensures no notification is lost during high-volume HR broadcasts.
- Mature tooling for pagination, indexing, and connection pooling.

#### DB Schema

```sql
CREATE TABLE students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Event', 'Result');

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  message           TEXT NOT NULL,
  is_read           BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### Problems at Scale (50,000 students, 5,000,000 notifications)

| Problem | Description |
|---------|-------------|
| Slow reads | Full table scans on large notifications table |
| Write bottleneck | Bulk inserts during "Notify All" |
| Storage | 5M rows grows fast with message text |
| Connection overload | 50k concurrent WebSocket + DB connections |

#### Solutions

- **Indexes** (see Stage 3)
- **Read replicas** for SELECT queries
- **Message queue** (Redis / RabbitMQ) for bulk inserts
- **Pagination** – never return all notifications at once
- **Archiving** – move notifications older than 6 months to cold storage

#### SQL Queries Based on API Design

```sql
-- GET /api/v1/notifications (with pagination)
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- PATCH /api/v1/notifications/:id/read
UPDATE notifications
SET is_read = TRUE, updated_at = NOW()
WHERE id = $1 AND student_id = $2;

-- PATCH /api/v1/notifications/read-all
UPDATE notifications
SET is_read = TRUE, updated_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;

-- GET /api/v1/notifications/unread-count
SELECT COUNT(*) FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

---

## Stage 3

### Query Analysis & Optimization

**Original Query:**
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

#### Is this query accurate?
Functionally yes, but it has performance problems:
- `SELECT *` fetches all columns including large `message` TEXT – wasteful.
- No index on `(student_id, is_read)` → full table scan as data grows.
- As the table hits millions of rows, this query will be slow.

#### What to change?
1. Select only needed columns.
2. Add a **composite index** on `(student_id, is_read, created_at)`.
3. Add **LIMIT** for pagination.

```sql
-- Optimized:
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = false
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

#### "Add indexes on every column" – Is this good advice?
**No.** This is harmful advice:
- Every index slows down INSERT / UPDATE / DELETE.
- Indexes consume disk space.
- The query optimizer may pick wrong indexes if too many exist.
- Only index columns used in WHERE, JOIN, or ORDER BY clauses.

**Recommended indexes:**
```sql
-- Composite index for the most common query pattern
CREATE INDEX idx_notifications_student_unread
  ON notifications (student_id, is_read, created_at DESC);

-- Index for type-filtered queries
CREATE INDEX idx_notifications_type
  ON notifications (student_id, notification_type, created_at DESC);
```

#### Query: Students who got Placement notification in last 7 days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### Caching Strategy for Notification Performance

**Problem:** DB gets overwhelmed fetching notifications on every page load for every student.

#### Solutions

**1. Server-Side Cache (Redis) – Primary Recommendation**

- Cache the notification list per student: key = `notifications:student:<id>`
- TTL = 60 seconds (balance freshness vs load).
- On new notification push → **invalidate** that student's cache key.
- On read/mark-as-read → invalidate cache.

```
GET notifications → check Redis → HIT: return cached → MISS: query DB, store in Redis, return
```

**Tradeoffs:**
| Aspect | Value |
|--------|-------|
| Read speed | Very fast (sub-ms) |
| Stale data risk | Low with proper invalidation |
| Complexity | Medium (cache invalidation logic) |
| Cost | Low (Redis is cheap) |

**2. HTTP Caching (ETag / Cache-Control)**
- Use `ETag` headers so the browser doesn't refetch unchanged data.
- Works well for "unread count" endpoint which rarely changes.

**Tradeoffs:** Works only for GET; doesn't reduce DB load for new sessions.

**3. Polling → WebSocket Upgrade**
- Replace periodic page-load polling with a WebSocket push model (already designed in Stage 1).
- Server pushes new notifications; client doesn't poll DB repeatedly.

**Tradeoffs:** Higher server resource for maintaining connections; eliminates unnecessary DB reads.

**Recommended combination:** Redis cache + WebSocket push + ETag for unread count.

---

## Stage 5

### Redesigning the Bulk Notification Flow

**Original pseudocode problem:**
```
function notify_all(student_ids, message):
    for student_id in student_ids:
        send_email(student_id, message)   # synchronous, blocks
        save_to_db(student_id, message)   # synchronous, blocks
        push_to_app(student_id, message)  # synchronous, blocks
```

**Shortcomings:**
1. **Synchronous loop** – 50,000 iterations blocks the event loop / thread pool.
2. **No error handling** – if `send_email` fails for student 200, the loop aborts; remaining 49,800 students never get notified.
3. **Tight coupling** – email, DB write, and push are all in one transaction; a slow email API holds up DB writes.
4. **No retry** – failed emails are silently lost.
5. **DB bottleneck** – 50,000 individual INSERT statements instead of a bulk insert.

#### Should saving to DB and sending email happen together?
**No.** They should be decoupled:
- DB write = fast, must succeed reliably (source of truth).
- Email send = slow, can fail, must be retried asynchronously.
- Mixing them means one failure blocks the other.

#### Redesigned Approach (Message Queue)

```
function notify_all(student_ids, message):
    # 1. Bulk insert all notifications to DB atomically
    bulk_insert_to_db(student_ids, message)  # single transaction, fast

    # 2. Enqueue one job per student for email + push
    for student_id in student_ids:
        enqueue("notification_job", {
            student_id: student_id,
            message: message,
            retry_count: 0
        })

# Worker process (runs concurrently, N workers):
function process_notification_job(job):
    try:
        send_email(job.student_id, job.message)
        push_to_app(job.student_id, job.message)
        mark_job_done(job.id)
    except EmailError:
        if job.retry_count < 3:
            requeue(job, delay=exponential_backoff(job.retry_count))
        else:
            log_failed_notification(job)  # dead-letter queue
```

**Why this works:**
- DB write is instant and atomic (all 50k rows in one transaction).
- Queue workers process emails concurrently (e.g., 100 workers in parallel).
- Failed emails are retried with exponential backoff; never silently lost.
- DB and email are fully decoupled – DB is never held waiting for SMTP.

---

## Stage 6

### Priority Inbox – Approach

**Priority scoring formula:**
```
type_weight = { Placement: 3, Result: 2, Event: 1 }

priority_score = type_weight[type] * 1000 + recency_score

recency_score = max(0, 1000 - minutes_since_notification)
```

**Why this formula?**
- Placement always ranks above Result, which ranks above Event.
- Within the same type, more recent notifications appear first.
- Multiplying type_weight by 1000 ensures type always dominates over recency.

**Maintaining top-N efficiently (as new notifications arrive):**
- Use a **min-heap of size N**.
- When a new notification arrives, compare with heap minimum.
- If new notification's priority > heap minimum → replace minimum → re-heapify.
- Time complexity: O(log N) per insertion, O(N log N) initial build.
- Much more efficient than sorting all notifications every time: O(total_notifications).

See `priority_inbox/priority_inbox.js` for the implementation.
