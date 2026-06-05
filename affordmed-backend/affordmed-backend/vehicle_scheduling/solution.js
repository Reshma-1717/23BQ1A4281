/**
 * Vehicle Maintenance Scheduler Microservice
 * Solves the 0/1 Knapsack Problem:
 *   - Capacity  = depot's MechanicHours
 *   - Weight    = task Duration
 *   - Value     = task Impact score
 *
 * APIs used:
 *   GET http://4.224.186.213/evaluation-service/depots
 *   GET http://4.224.186.213/evaluation-service/vehicles
 *
 * NOTE: Both APIs are "protected routes" – pass your auth token
 *       via the  Authorization: Bearer <token>  header.
 *       Set the env-var  AUTH_TOKEN  before running.
 */

const axios = require("axios");

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = "http://4.224.186.213/evaluation-service";
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""; // set via env

const headers = AUTH_TOKEN
  ? { Authorization: `Bearer ${AUTH_TOKEN}` }
  : {};

// ─── Logger Middleware (console-based stub; replace with your actual middleware) ─
function log(level, message, meta = {}) {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta })
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchDepots() {
  log("info", "Fetching depots", { url: `${BASE_URL}/depots` });
  const res = await axios.get(`${BASE_URL}/depots`, { headers });
  log("info", "Depots fetched", { count: res.data.depots.length });
  return res.data.depots; // [{ ID, MechanicHours }]
}

async function fetchVehicles() {
  log("info", "Fetching vehicles", { url: `${BASE_URL}/vehicles` });
  const res = await axios.get(`${BASE_URL}/vehicles`, { headers });
  log("info", "Vehicles (tasks) fetched", { count: res.data.vehicles.length });
  return res.data.vehicles; // [{ TaskID, Duration, Impact }]
}

// ─── 0/1 Knapsack ─────────────────────────────────────────────────────────────
/**
 * Standard DP knapsack.
 * @param {Array<{TaskID:string, Duration:number, Impact:number}>} tasks
 * @param {number} capacity  – total mechanic-hours available
 * @returns {{ selectedTasks: Array, totalImpact: number, totalDuration: number }}
 */
function knapsack(tasks, capacity) {
  const n = tasks.length;

  // dp[i] = max impact achievable with exactly i hours used
  const dp = new Array(capacity + 1).fill(0);
  // keep[t][i] = true if task t is included when capacity is i
  const keep = Array.from({ length: n }, () => new Array(capacity + 1).fill(false));

  for (let t = 0; t < n; t++) {
    const { Duration: w, Impact: v } = tasks[t];
    // traverse backwards to keep 0/1 property
    for (let c = capacity; c >= w; c--) {
      if (dp[c - w] + v > dp[c]) {
        dp[c] = dp[c - w] + v;
        keep[t][c] = true;
      }
    }
  }

  // Back-track to find selected tasks
  const selected = [];
  let remaining = capacity;
  for (let t = n - 1; t >= 0; t--) {
    if (keep[t][remaining]) {
      selected.push(tasks[t]);
      remaining -= tasks[t].Duration;
    }
  }

  return {
    selectedTasks: selected,
    totalImpact: dp[capacity],
    totalDuration: capacity - remaining,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    log("info", "=== Vehicle Maintenance Scheduler Started ===");

    const [depots, tasks] = await Promise.all([fetchDepots(), fetchVehicles()]);

    for (const depot of depots) {
      log("info", `Processing depot ${depot.ID}`, {
        depotID: depot.ID,
        mechanicHours: depot.MechanicHours,
        totalTasks: tasks.length,
      });

      const result = knapsack(tasks, depot.MechanicHours);

      log("info", `Depot ${depot.ID} – schedule computed`, {
        depotID: depot.ID,
        mechanicHours: depot.MechanicHours,
        selectedCount: result.selectedTasks.length,
        totalDurationUsed: result.totalDuration,
        totalImpactScore: result.totalImpact,
      });

      console.log("\n" + "=".repeat(60));
      console.log(`DEPOT ID        : ${depot.ID}`);
      console.log(`Mechanic Hours  : ${depot.MechanicHours}`);
      console.log(`Tasks Selected  : ${result.selectedTasks.length}`);
      console.log(`Duration Used   : ${result.totalDuration} / ${depot.MechanicHours}`);
      console.log(`Total Impact    : ${result.totalImpact}`);
      console.log("\nSelected Tasks:");
      result.selectedTasks.forEach((t) => {
        console.log(`  TaskID: ${t.TaskID}  Duration: ${t.Duration}h  Impact: ${t.Impact}`);
      });
      console.log("=".repeat(60) + "\n");
    }

    log("info", "=== Vehicle Maintenance Scheduler Completed ===");
  } catch (err) {
    log("error", "Fatal error in scheduler", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

main();
