import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PBKDF2_ITERATIONS = 100_000;

function encodeBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

async function derivePasswordHash(password, saltBase64) {
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
      salt: Buffer.from(saltBase64, "base64"),
      iterations: PBKDF2_ITERATIONS
    },
    key,
    256
  );

  return encodeBase64(new Uint8Array(bits));
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes("--apply");
  const filteredArgs = args.filter((arg) => arg !== "--apply");
  const [rawUsername, rawPassword, rawDisplayName] = filteredArgs;

  if (!rawUsername || !rawPassword) {
    console.error(
      "Usage: node scripts/create-user.mjs <username> <password> [display-name] [--apply]"
    );
    process.exit(1);
  }

  const username = rawUsername.trim().toLowerCase();
  const displayName = rawDisplayName?.trim() || username;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = encodeBase64(salt);
  const passwordHash = await derivePasswordHash(rawPassword, passwordSalt);

  const sql = `INSERT INTO users (id, username, display_name, password_salt, password_hash)
VALUES ('${crypto.randomUUID()}', '${escapeSql(username)}', '${escapeSql(displayName)}', '${passwordSalt}', '${passwordHash}');`;

  if (!shouldApply) {
    console.log(sql);
    return;
  }

  const { stdout, stderr } = await execFileAsync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "gemini-sz-db",
      "--local",
      "--command",
      sql
    ],
    {
      cwd: process.cwd()
    }
  );

  if (stdout) {
    process.stdout.write(stdout);
  }

  if (stderr) {
    process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
