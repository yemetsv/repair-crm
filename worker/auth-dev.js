
/**
 * TechnoSmart Repair CRM
 * Authentication Worker — DEVELOPMENT
 *
 * Three users, isolated from the main CRM API.
 */

import { USERS } from "./auth-users.js";

const SESSION_TTL = 60 * 60;
const LOGIN_WINDOW = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_BODY_BYTES = 4096;

const ALLOWED_ORIGINS = [
  "https://yemetsv.github.io",
  "http://localhost:5173"
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function hex(bytes) {
  return Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(new Uint8Array(digest));
}

function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

// Development-only password comparison.
// The existing Cloudflare Secrets hold plaintext passwords.
// Before production, replace with stored salted password hashes.
async function verifyPassword(input, expected) {
  const a = await sha256(input);
  const b = await sha256(expected);

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

async function readJson(request) {
  const type = request.headers.get("Content-Type") || "";

  if (!type.toLowerCase().includes("application/json")) {
    return null;
  }

  const size = Number(request.headers.get("Content-Length"));

  if (Number.isFinite(size) && size > MAX_BODY_BYTES) {
    return null;
  }

  const raw = await request.text();

  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" ||
        Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function getSession(request, env) {
  const authorization =
    request.headers.get("Authorization") || "";

  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);

  if (!match) return null;

  const tokenHash = await sha256(match[1]);

  return env.SESSIONS.get(
    `session:${tokenHash}`,
    { type: "json" }
  );
}

async function getLoginKey(request, username) {
  const ip =
    request.headers.get("CF-Connecting-IP") || "unknown";

  const identity = await sha256(`${ip}:${username}`);

  return `login-limit:${identity}`;
}

export default {
  async fetch(request, env) {
    if (!env.SESSIONS) {
      return json({ error: "KV not configured" }, 500);
    }

    const origin = request.headers.get("Origin");
    const cors = {};

    if (origin) {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return json({ error: "Origin not allowed" }, 403);
      }

      cors["Access-Control-Allow-Origin"] = origin;
      cors["Access-Control-Allow-Methods"] =
        "GET, POST, OPTIONS";
      cors["Access-Control-Allow-Headers"] =
        "Content-Type, Authorization";
      cors["Vary"] = "Origin";
    }

    function reply(data, status = 200) {
      return json(data, status, cors);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Cache-Control": "no-store"
        }
      });
    }

    const url = new URL(request.url);

    // Service health
    if (url.pathname === "/health" &&
        request.method === "GET") {
      return reply({
        status: "ok",
        service: "technosmart-auth-dev",
        users: Object.keys(USERS).length
      });
    }

    // Login
    if (url.pathname === "/login" &&
        request.method === "POST") {
      const body = await readJson(request);

      if (!body ||
          typeof body.username !== "string" ||
          typeof body.password !== "string" ||
          body.username.length > 64 ||
          body.password.length > 256) {
        return reply({ error: "Invalid request" }, 400);
      }

      const username = body.username.trim().toLowerCase();
      const user = Object.hasOwn
        ? (Object.hasOwn(USERS, username) ? USERS[username] : null)
        : (Object.prototype.hasOwnProperty.call(USERS, username)
          ? USERS[username] : null);

      const limitKey = await getLoginKey(request, username);
      const attempts =
        Number(await env.SESSIONS.get(limitKey)) || 0;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        return reply({
          error: "Too many login attempts"
        }, 429);
      }

      const secretName = user?.passwordSecret;
      const expected = secretName ? env[secretName] : null;

      // Compare against a dummy value for unknown users.
      const valid = await verifyPassword(
        body.password,
        expected || "invalid-user-placeholder"
      );

      if (!user || !expected || !valid) {
        await env.SESSIONS.put(
          limitKey,
          String(attempts + 1),
          { expirationTtl: LOGIN_WINDOW }
        );

        return reply({
          error: "Invalid credentials"
        }, 401);
      }

      await env.SESSIONS.delete(limitKey);

      const sessionUser = {
        username,
        role: user.role,
        point: user.point
      };

      const token = randomToken();
      const tokenHash = await sha256(token);

      await env.SESSIONS.put(
        `session:${tokenHash}`,
        JSON.stringify(sessionUser),
        { expirationTtl: SESSION_TTL }
      );

      return reply({
        success: true,
        token,
        expiresIn: SESSION_TTL,
        user: sessionUser
      });
    }

    // Session verification
    if (url.pathname === "/me" &&
        request.method === "GET") {
      const session = await getSession(request, env);

      if (!session) {
        return reply({ error: "Unauthorized" }, 401);
      }

      return reply({ user: session });
    }

    // Logout
    if (url.pathname === "/logout" &&
        request.method === "POST") {
      const authorization =
        request.headers.get("Authorization") || "";

      const match =
        /^Bearer ([a-f0-9]{64})$/.exec(authorization);

      if (!match) {
        return reply({ error: "Unauthorized" }, 401);
      }

      const tokenHash = await sha256(match[1]);
      const key = `session:${tokenHash}`;

      const existing = await env.SESSIONS.get(key);

      if (!existing) {
        return reply({ error: "Unauthorized" }, 401);
      }

      await env.SESSIONS.delete(key);

      return reply({ success: true });
    }

    return reply({ error: "Not found" }, 404);
  }
};
