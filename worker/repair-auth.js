
/**
 * TechnoSmart Repair CRM
 * Repair API authorization helpers.
 */

const POINTS = ["Техносмарт", "Vodafone"];

function toHex(bytes) {
  return Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export async function authenticate(request, env) {
  if (!env.SESSIONS) {
    throw new Error("SESSIONS binding missing");
  }

  const header =
    request.headers.get("Authorization") || "";

  const match = /^Bearer ([a-f0-9]{64})$/.exec(header);

  if (!match) return null;

  const tokenHash = await sha256(match[1]);

  const session = await env.SESSIONS.get(
    `session:${tokenHash}`,
    { type: "json" }
  );

  if (!session || typeof session !== "object") {
    return null;
  }

  const { username, role, point } = session;

  if (
    username === "manager" &&
    role === "manager" &&
    point === null
  ) {
    return { username, role, point };
  }

  if (
    username === "technosmart" &&
    role === "staff" &&
    point === "Техносмарт"
  ) {
    return { username, role, point };
  }

  if (
    username === "vodafone" &&
    role === "staff" &&
    point === "Vodafone"
  ) {
    return { username, role, point };
  }

  return null;
}

export function canAccessPoint(user, point) {
  if (!user || !POINTS.includes(point)) {
    return false;
  }

  return user.role === "manager" ||
    (user.role === "staff" && user.point === point);
}

export function filterRepairs(repairs, user) {
  return repairs.filter(repair =>
    canAccessPoint(user, repair.point)
  );
}

export function resolveNewRepairPoint(user, requestedPoint) {
  if (!user) return null;

  if (user.role === "manager") {
    return POINTS.includes(requestedPoint)
      ? requestedPoint
      : null;
  }

  return user.point;
}


export function canUpdateRepair(user, rows, repairId) {
  const matches = [];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] ?? "") === String(repairId)) {
      matches.push({
        rowNumber: i + 1,
        point: String(rows[i][2] ?? "")
      });
    }
  }

  // Reject missing or duplicate repair IDs.
  if (matches.length !== 1) {
    return {
      allowed: false,
      reason: matches.length
        ? "Duplicate repair ID"
        : "Repair not found"
    };
  }

  const repair = matches[0];

  return {
    allowed: canAccessPoint(user, repair.point),
    rowNumber: repair.rowNumber,
    reason: canAccessPoint(user, repair.point)
      ? null
      : "Forbidden"
  };
}
