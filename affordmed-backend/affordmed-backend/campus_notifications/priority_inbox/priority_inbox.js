/**
 * Stage 6 – Priority Inbox
 *
 * Fetches notifications from:
 *   GET http://4.224.186.213/evaluation-service/notifications
 *
 * Priority formula:
 *   type_weight  : Placement=3, Result=2, Event=1
 *   recency_score: max(0, 1000 - minutes_since_notification)
 *   priority     : type_weight * 1000 + recency_score
 *
 * Uses a Min-Heap of size N to maintain top-N efficiently.
 * Set AUTH_TOKEN env var before running.
 */

const axios = require("axios");

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = "http://4.224.186.213/evaluation-service";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const TOP_N = 10; // find top 10

const headers = AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level, message, meta = {}) {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta })
  );
}

// ─── Priority helpers ─────────────────────────────────────────────────────────
const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function priorityScore(notification) {
  const weight = TYPE_WEIGHT[notification.Type] ?? 0;
  const ts = new Date(notification.Timestamp).getTime();
  const minutesAgo = (Date.now() - ts) / 60000;
  const recency = Math.max(0, 1000 - minutesAgo);
  return weight * 1000 + recency;
}

// ─── Min-Heap implementation ──────────────────────────────────────────────────
class MinHeap {
  constructor() {
    this._heap = [];
  }

  size() {
    return this._heap.length;
  }

  peek() {
    return this._heap[0];
  }

  push(item) {
    this._heap.push(item);
    this._bubbleUp(this._heap.length - 1);
  }

  pop() {
    const top = this._heap[0];
    const last = this._heap.pop();
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._heap[parent].score <= this._heap[i].score) break;
      [this._heap[parent], this._heap[i]] = [this._heap[i], this._heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._heap[l].score < this._heap[smallest].score) smallest = l;
      if (r < n && this._heap[r].score < this._heap[smallest].score) smallest = r;
      if (smallest === i) break;
      [this._heap[smallest], this._heap[i]] = [this._heap[i], this._heap[smallest]];
      i = smallest;
    }
  }
}

// ─── Core algorithm ───────────────────────────────────────────────────────────
/**
 * Returns top-N notifications by priority using a min-heap of size N.
 * Time: O(total * log N)  Space: O(N)
 *
 * @param {Array} notifications  - full list from API
 * @param {number} n             - how many top notifications to return
 */
function getTopN(notifications, n) {
  const heap = new MinHeap();

  for (const notif of notifications) {
    const score = priorityScore(notif);
    const entry = { score, notif };

    if (heap.size() < n) {
      heap.push(entry);
    } else if (score > heap.peek().score) {
      heap.pop();
      heap.push(entry);
    }
  }

  // Extract and sort descending (highest priority first)
  const result = [];
  while (heap.size() > 0) {
    result.push(heap.pop());
  }
  return result.reverse(); // highest score first
}

// ─── Fetch & Display ─────────────────────────────────────────────────────────
async function fetchNotifications() {
  log("info", "Fetching notifications", { url: `${BASE_URL}/notifications` });
  const res = await axios.get(`${BASE_URL}/notifications`, { headers });
  const notifications = res.data.notifications;
  log("info", "Notifications fetched", { count: notifications.length });
  return notifications;
}

async function main() {
  try {
    log("info", "=== Priority Inbox Started ===");

    const notifications = await fetchNotifications();
    const top = getTopN(notifications, TOP_N);

    console.log("\n" + "═".repeat(70));
    console.log(`  TOP ${TOP_N} PRIORITY NOTIFICATIONS`);
    console.log("═".repeat(70));

    top.forEach((entry, idx) => {
      const n = entry.notif;
      console.log(
        `#${String(idx + 1).padStart(2, "0")}  [${n.Type.padEnd(9)}]  ` +
        `Score: ${entry.score.toFixed(2).padStart(10)}  ` +
        `Timestamp: ${n.Timestamp}  ` +
        `Msg: ${n.Message}`
      );
    });

    console.log("═".repeat(70) + "\n");

    // Also output as JSON for programmatic use
    const output = top.map((entry, idx) => ({
      rank: idx + 1,
      id: entry.notif.ID,
      type: entry.notif.Type,
      message: entry.notif.Message,
      timestamp: entry.notif.Timestamp,
      priorityScore: parseFloat(entry.score.toFixed(2)),
    }));

    console.log("JSON Output:");
    console.log(JSON.stringify({ topNotifications: output }, null, 2));

    log("info", "=== Priority Inbox Completed ===", { topN: TOP_N });
  } catch (err) {
    log("error", "Fatal error", { message: err.message, stack: err.stack });
    process.exit(1);
  }
}

main();
