
import assert from "node:assert/strict";
import { canUpdateRepair } from "../worker/repair-auth.js";

const manager = {
  username: "manager",
  role: "manager",
  point: null
};

const technosmart = {
  username: "technosmart",
  role: "staff",
  point: "Техносмарт"
};

const vodafone = {
  username: "vodafone",
  role: "staff",
  point: "Vodafone"
};

// Simulated Google Sheets rows.
// Column A = ID; column C = Point.
const rows = [
  ["ID", "Дата", "Точка"],
  ["TEST-1", "", "Техносмарт"],
  ["TEST-2", "", "Vodafone"]
];

const tests = [
  [
    "Vodafone denied Technosmart repair",
    !canUpdateRepair(vodafone, rows, "TEST-1").allowed
  ],
  [
    "Technosmart denied Vodafone repair",
    !canUpdateRepair(technosmart, rows, "TEST-2").allowed
  ],
  [
    "Manager allowed Technosmart repair",
    canUpdateRepair(manager, rows, "TEST-1").allowed
  ],
  [
    "Manager allowed Vodafone repair",
    canUpdateRepair(manager, rows, "TEST-2").allowed
  ],
  [
    "Vodafone allowed own repair",
    canUpdateRepair(vodafone, rows, "TEST-2").allowed
  ],
  [
    "Missing repair rejected",
    !canUpdateRepair(manager, rows, "TEST-MISSING").allowed
  ],
  [
    "Duplicate repair rejected",
    !canUpdateRepair(manager, [...rows, rows[1]], "TEST-1").allowed
  ],
  [
    "Correct Google Sheets row number",
    canUpdateRepair(manager, rows, "TEST-2").rowNumber === 3
  ]
];

for (const [name, passed] of tests) {
  assert.equal(passed, true, name);
  console.log(`PASS - ${name}`);
}

console.log(`TOTAL: ${tests.length}/${tests.length} PASS`);
