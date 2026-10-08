
/**
 * TechnoSmart Repair CRM API
 * Cloudflare Worker + Google Sheets API
 * TEST MODE — only TEST- repair IDs
 */

import {
  authenticate,
  filterRepairs,
  resolveNewRepairPoint,
  canUpdateRepair
} from "./repair-auth.js";

const ALLOWED_ORIGINS = [
  "https://yemetsv.github.io",
  "http://localhost:5173"
];

const SHEET_NAME = "Аркуш1";

const STATUSES = [
  "Нові",
  "В роботі",
  "Виконані",
  "Видані"
];

const POINTS = [
  "Техносмарт",
  "Vodafone"
];

function isAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      ...(isAllowed(origin)
        ? { "Access-Control-Allow-Origin": origin }
        : {})
    }
  });
}

function base64url(input) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT");
  }

  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);

  const pem = account.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const keyBytes = Uint8Array.from(
    atob(pem),
    c => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  }));

  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));

  const unsigned = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const assertion =
    `${unsigned}.${base64url(signature)}`;

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google OAuth HTTP ${response.status}`
    );
  }

  const result = await response.json();

  if (!result.access_token) {
    throw new Error("Google access token missing");
  }

  return result.access_token;
}

function getSheetId(env) {
  const id = String(env.GOOGLE_SHEET_ID || "").trim();

  if (!id) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  return encodeURIComponent(id);
}

async function sheetsRequest(env, path, options = {}) {
  const token = await getAccessToken(env);

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/` +
    `${getSheetId(env)}/${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(
      `Google Sheets API HTTP ${response.status}`
    );
  }

  return response.json();
}

function sheetRange(range) {
  return encodeURIComponent(`'${SHEET_NAME}'!${range}`);
}

async function getRepairRows(env) {
  const result = await sheetsRequest(
    env,
    `values/${sheetRange("A1:J")}`
  );

  return result.values || [];
}

async function getRepairs(env) {
  const rows = await getRepairRows(env);

  return rows.slice(1)
    .filter(row => row[0] !== undefined && row[0] !== "")
    .map(row => ({
      id: String(row[0] ?? ""),
      date: row[1] ?? "",
      point: row[2] ?? "",
      client: row[3] ?? "",
      phone: String(row[4] ?? ""),
      device: row[5] ?? "",
      imei: String(row[6] ?? ""),
      issue: row[7] ?? "",
      status: row[8] ?? "",
      price: row[9] ?? ""
    }));
}

function validTestId(id) {
  return /^TEST-[A-Za-z0-9-]{1,40}$/.test(id);
}

async function addRepair(env, data) {
  const id = String(data.id ?? "");

  if (!validTestId(id)) {
    return {
      success: false,
      error: "Only TEST- IDs are allowed"
    };
  }

  if (
    !POINTS.includes(data.point) ||
    typeof data.client !== "string" ||
    !data.client.trim() ||
    typeof data.device !== "string" ||
    !data.device.trim()
  ) {
    return {
      success: false,
      error: "Invalid repair fields"
    };
  }

  const repairs = await getRepairs(env);

  if (repairs.some(r => r.id === id)) {
    return {
      success: false,
      error: "Duplicate repair ID"
    };
  }

  const values = [[
    id,
    new Date().toISOString(),
    data.point,
    data.client.trim().slice(0, 150),
    String(data.phone ?? "").slice(0, 40),
    data.device.trim().slice(0, 150),
    String(data.imei ?? "").slice(0, 100),
    String(data.issue ?? "").slice(0, 500),
    "Нові",
    String(data.price ?? "0").slice(0, 30)
  ]];

  const result = await sheetsRequest(
    env,
    `values/${sheetRange("A:J")}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values })
    }
  );

  if (result.updates?.updatedRows !== 1) {
    throw new Error("Append was not confirmed");
  }

  return {
    success: true,
    id,
    message: "Test repair saved"
  };
}

async function updateRepairStatus(env, data, user) {
  const id = String(data.id ?? "");
  const status = data.status;

  if (!validTestId(id)) {
    return {
      success: false,
      error: "Only TEST- IDs can be updated"
    };
  }

  if (!STATUSES.includes(status)) {
    return {
      success: false,
      error: "Invalid status"
    };
  }

  const rows = await getRepairRows(env);

  // Find repair and verify access before writing.
  const access = canUpdateRepair(user, rows, id);

  if (!access.allowed) {
    return {
      success: false,
      error: access.reason,
      statusCode: access.reason === "Forbidden" ? 403 : 400
    };
  }

  const rowNumber = access.rowNumber;

  const result = await sheetsRequest(
    env,
    `values/${sheetRange(`I${rowNumber}`)}` +
      `?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({
        values: [[status]]
      })
    }
  );

  if (result.updatedCells !== 1) {
    throw new Error("Status update not confirmed");
  }

  return {
    success: true,
    id,
    status
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    // CORS is not user authentication.
    if (!isAllowed(origin)) {
      return new Response("Forbidden", {
        status: 403
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization",
          "Vary": "Origin"
        }
      });
    }

    try {
      // Require server-side session.
      const user = await authenticate(request, env);

      if (!user) {
        return json({
          success: false,
          error: "Unauthorized"
        }, 401, origin);
      }

      // Read repairs visible to this user.
      if (request.method === "GET") {
        const repairs = await getRepairs(env);

        const visibleRepairs = filterRepairs(
          repairs,
          user
        );

        return json(visibleRepairs, 200, origin);
      }

      if (request.method === "POST") {
        if (
          !request.headers.get("Content-Type")
            ?.toLowerCase()
            .includes("application/json")
        ) {
          return json({
            success: false,
            error: "JSON Content-Type required"
          }, 415, origin);
        }

        const data = await request.json();

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          return json({
            success: false,
            error: "Invalid request"
          }, 400, origin);
        }

        let result;

        if (data.action === "add") {
          // Server determines the repair point.
          const point = resolveNewRepairPoint(
            user,
            data.point
          );

          if (!point) {
            return json({
              success: false,
              error: "Forbidden"
            }, 403, origin);
          }

          result = await addRepair(env, {
            ...data,
            point
          });

        } else if (data.action === "updateStatus") {
          result = await updateRepairStatus(
            env,
            data,
            user
          );

        } else {
          return json({
            success: false,
            error: "Unknown action"
          }, 400, origin);
        }

        return json(
          result,
          result.success
            ? 200
            : (result.statusCode || 400),
          origin
        );
      }

      return json({
        error: "Method not allowed"
      }, 405, origin);

    } catch (error) {
      console.error("Repair API:", error.message);

      return json({
        success: false,
        error: "Backend unavailable"
      }, 502, origin);
    }
  }
};
