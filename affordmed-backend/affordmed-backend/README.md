# AffordMed Backend Evaluation – Complete Solution

## Repository Structure

```
affordmed-backend/
├── vehicle_scheduling/
│   ├── solution.js          ← Main knapsack solver
│   └── package.json
│
└── campus_notifications/
    ├── notification_system_design.md   ← Stages 1–6 design
    ├── priority_inbox/
    │   └── priority_inbox.js           ← Stage 6 code
    └── package.json
```

---

## Setup (Both Microservices)

```bash
# Install dependencies for vehicle scheduling
cd vehicle_scheduling && npm install

# Install dependencies for campus notifications
cd ../campus_notifications && npm install
```

Set your auth token (required for both protected APIs):
```bash
export AUTH_TOKEN="your_token_here"
```

---

## Task 1 – Vehicle Maintenance Scheduler

### What it does
- Fetches all depots (`/evaluation-service/depots`) to get per-depot `MechanicHours`.
- Fetches all vehicle tasks (`/evaluation-service/vehicles`) to get `Duration` and `Impact`.
- Runs **0/1 Knapsack DP** for each depot to select the optimal subset of tasks that:
  - Does NOT exceed the depot's mechanic-hour budget.
  - **Maximises** the total operational impact score.

### Algorithm
- **Dynamic Programming Knapsack** – O(n × W) where n = number of tasks, W = mechanic hours.
- Backtracking reconstructs which tasks were selected.
- Efficient enough for large real-world inputs.

### Run
```bash
cd vehicle_scheduling
AUTH_TOKEN=your_token node solution.js
```

### Sample Output
```
============================================================
DEPOT ID        : 1
Mechanic Hours  : 60
Tasks Selected  : 12
Duration Used   : 59 / 60
Total Impact    : 87

Selected Tasks:
  TaskID: 264e638f-1c7a-4d67-9f9c-53f3d1766d37  Duration: 5h  Impact: 9
  ...
============================================================
```

---

## Task 2 – Campus Notifications Microservice

### Stage 1 – REST API Design
See `notification_system_design.md` → **Stage 1**

Endpoints designed:
- `GET /api/v1/notifications` – paginated list with type/read filters
- `GET /api/v1/notifications/:id` – single notification
- `PATCH /api/v1/notifications/:id/read` – mark read
- `PATCH /api/v1/notifications/read-all` – mark all read
- `GET /api/v1/notifications/unread-count`
- Real-time via **WebSockets / Socket.IO**

### Stage 2 – Database
See `notification_system_design.md` → **Stage 2**

- **PostgreSQL** chosen (ACID, relational, pagination-friendly)
- Schema: `students` + `notifications` tables
- SQL queries for all designed APIs

### Stage 3 – Query Optimisation
See `notification_system_design.md` → **Stage 3**

- Original query is accurate but slow (full table scan, `SELECT *`)
- Composite index on `(student_id, is_read, created_at DESC)` fixes it
- "Index all columns" advice debunked
- Query for placement notifications in last 7 days

### Stage 4 – Caching
See `notification_system_design.md` → **Stage 4**

- **Redis cache** with per-student key + invalidation on new notification
- **WebSocket push** replaces polling
- **ETag** for unread count

### Stage 5 – Bulk Notification Redesign
See `notification_system_design.md` → **Stage 5**

- Synchronous loop replaced with **Message Queue** (RabbitMQ/Redis Streams)
- Bulk DB insert in a single transaction
- Per-student email/push jobs processed concurrently by N workers
- Exponential backoff retry for failed emails

### Stage 6 – Priority Inbox
See `notification_system_design.md` → **Stage 6** and `priority_inbox/priority_inbox.js`

**Run:**
```bash
cd campus_notifications
AUTH_TOKEN=your_token node priority_inbox/priority_inbox.js
```

**Priority Formula:**
```
priority = type_weight * 1000 + max(0, 1000 - minutes_since_notification)
  where type_weight: Placement=3, Result=2, Event=1
```

**Algorithm:** Min-Heap of size N → O(total × log N), handles streaming new notifications.

---

## Logging

All code uses structured JSON logging (no console.log / inbuilt language loggers).
Replace the `log()` stub with your actual Logging Middleware by importing it and calling its methods.

```js
// Replace this in both files:
function log(level, message, meta) { ... }

// With your middleware, e.g.:
const logger = require("../path/to/logging-middleware");
logger.info(message, meta);
```
