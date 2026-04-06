import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ensureAppSchema } from "@/lib/db";
import { getRequestEnv } from "@/lib/env";

const SESSION_COOKIE = "gemini_sz_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 100_000;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
};

function encodeBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function derivePasswordHash(password: string, saltBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64(saltBase64),
      iterations: PBKDF2_ITERATIONS
    },
    key,
    256
  );

  return encodeBase64(new Uint8Array(bits));
}

export async function generatePasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = encodeBase64(salt);
  const passwordHash = await derivePasswordHash(password, passwordSalt);

  return { passwordSalt, passwordHash };
}

export async function createSeedUserSql(input: {
  username: string;
  password: string;
  displayName?: string;
}) {
  const { passwordSalt, passwordHash } = await generatePasswordRecord(input.password);
  const escapedDisplayName = (input.displayName ?? input.username).replaceAll("'", "''");
  const escapedUsername = input.username.trim().toLowerCase().replaceAll("'", "''");

  return `INSERT INTO users (id, username, display_name, password_salt, password_hash, is_admin)
VALUES ('${crypto.randomUUID()}', '${escapedUsername}', '${escapedDisplayName}', '${passwordSalt}', '${passwordHash}', 0);`;
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  await ensureAppSchema();
  const env = await getRequestEnv();
  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare(
    `SELECT
      users.id,
      users.username,
      users.display_name AS displayName,
      COALESCE(users.is_admin, 0) AS isAdmin,
      app_sessions.expires_at AS expiresAt
    FROM app_sessions
    INNER JOIN users ON users.id = app_sessions.user_id
    WHERE app_sessions.session_token_hash = ?`
  )
    .bind(tokenHash)
    .first<{
      id: string;
      username: string;
      displayName: string | null;
      isAdmin: number;
      expiresAt: string;
    }>();

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await env.DB.prepare(`DELETE FROM app_sessions WHERE session_token_hash = ?`)
      .bind(tokenHash)
      .run();
    return null;
  }

  return {
    id: session.id,
    username: session.username,
    displayName: session.displayName,
    isAdmin: Number(session.isAdmin) === 1
  };
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (!user.isAdmin) {
    redirect("/app");
  }

  return user;
}

export async function signInWithPassword(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  await ensureAppSchema();
  const env = await getRequestEnv();

  const user = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName, password_salt AS passwordSalt, password_hash AS passwordHash,
            COALESCE(is_admin, 0) AS isAdmin
     FROM users
     WHERE username = ?`
  )
    .bind(normalizedUsername)
    .first<{
      id: string;
      username: string;
      displayName: string | null;
      passwordSalt: string;
      passwordHash: string;
      isAdmin: number;
    }>();

  if (!user) {
    return { ok: false as const, error: "Invalid username or password." };
  }

  const derived = await derivePasswordHash(password, user.passwordSalt);

  if (derived !== user.passwordHash) {
    return { ok: false as const, error: "Invalid username or password." };
  }

  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO app_sessions (id, user_id, session_token_hash, expires_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt)
    .run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt)
  });

  return {
    ok: true as const,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isAdmin: Number(user.isAdmin) === 1
    }
  };
}

export async function signOutCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const env = await getRequestEnv();
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare(`DELETE FROM app_sessions WHERE session_token_hash = ?`)
      .bind(tokenHash)
      .run();
  }

  cookieStore.delete(SESSION_COOKIE);
}
