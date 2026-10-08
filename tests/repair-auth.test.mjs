
import {
  canAccessPoint,
  resolveNewRepairPoint,
  filterRepairs
} from "../worker/repair-auth.js";

const manager = {
  username: "manager",
  role: "manager",
  point: null
};

const techno = {
  username: "technosmart",
  role: "staff",
  point: "Техносмарт"
};

const vodafone = {
  username: "vodafone",
  role: "staff",
  point: "Vodafone"
};

const repairs = [
  { id: "TEST-1", point: "Техносмарт" },
  { id: "TEST-2", point: "Vodafone" }
];

const tests = [
  ["Manager sees both", filterRepairs(repairs, manager).length === 2],
  ["Technosmart sees own", filterRepairs(repairs, techno).map(r => r.id).join() === "TEST-1"],
  ["Vodafone sees own", filterRepairs(repairs, vodafone).map(r => r.id).join() === "TEST-2"],
  ["Technosmart denied Vodafone", !canAccessPoint(techno, "Vodafone")],
  ["Vodafone denied Technosmart", !canAccessPoint(vodafone, "Техносмарт")],
  ["Technosmart point enforced", resolveNewRepairPoint(techno, "Vodafone") === "Техносмарт"],
  ["Vodafone point enforced", resolveNewRepairPoint(vodafone, "Техносмарт") === "Vodafone"]
];

for (const [name, passed] of tests) {
  console.log(`${passed ? "PASS" : "FAIL"} - ${name}`);
}

if (tests.some(([, passed]) => !passed)) {
  process.exitCode = 1;
}
