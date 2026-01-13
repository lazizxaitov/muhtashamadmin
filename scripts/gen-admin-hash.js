#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HASH_KEY_LENGTH = 64;
const DEFAULT_SALT_BYTES = 16;

function parseArgs(argv) {
  const args = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "--write" || token === "--env" || token === "--env-file") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${token} requires a file path`);
      }
      flags.envFile = value;
      i++;
      continue;
    }
    if (token === "--salt-bytes") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--salt-bytes requires a number");
      }
      flags.saltBytes = value;
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    }
    args.push(token);
  }

  return { args, flags };
}

function usage() {
  const cmd = path.basename(process.argv[0] || "node");
  return [
    "Generate ADMIN_PASSWORD_SALT and ADMIN_PASSWORD_HASH for .env",
    "",
    `Usage:`,
    `  ${cmd} scripts/gen-admin-hash.js [password]`,
    `  ${cmd} scripts/gen-admin-hash.js --write .env.local [password]`,
    "",
    "Options:",
    "  --write|--env-file <path>   Update env file in-place (still prints values)",
    `  --salt-bytes <n>            Salt length in bytes (default: ${DEFAULT_SALT_BYTES})`,
    "  -h, --help                  Show help",
    "",
    "Notes:",
    "  - Algorithm matches app/api/login/route.ts (crypto.scryptSync(password, salt, 64))",
  ].join("\n");
}

function readStdinAll() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function readHiddenLine(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("No TTY available for password prompt"));
      return;
    }

    const stdin = process.stdin;
    const stderr = process.stderr;
    const previousRawMode = stdin.isRaw;
    let value = "";

    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    const onData = (buf) => {
      const str = buf.toString("utf8");

      if (str === "\u0003") {
        cleanup();
        reject(new Error("Canceled"));
        return;
      }

      if (str === "\r" || str === "\n") {
        stderr.write("\n");
        cleanup();
        resolve(value);
        return;
      }

      if (str === "\u0008" || str === "\u007F") {
        value = value.slice(0, -1);
        return;
      }

      if (str >= " ") {
        value += str;
      }
    };

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(previousRawMode));
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

function upsertEnvVar(text, key, value, eol) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escapedKey}=.*$`, "m");
  const line = `${key}=${value}`;

  if (re.test(text)) {
    return text.replace(re, line);
  }

  const endsWithEol = text.length === 0 ? false : text.endsWith("\n") || text.endsWith("\r\n");
  return text + (endsWithEol || text.length === 0 ? "" : eol) + line + eol;
}

function updateEnvFile(envFilePath, saltB64, hashB64) {
  const abs = path.resolve(process.cwd(), envFilePath);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";

  let next = existing;
  next = upsertEnvVar(next, "ADMIN_PASSWORD_SALT", saltB64, eol);
  next = upsertEnvVar(next, "ADMIN_PASSWORD_HASH", hashB64, eol);

  fs.writeFileSync(abs, next, "utf8");
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stderr.write(usage() + "\n");
    process.exit(0);
  }

  const saltBytesRaw = flags.saltBytes ?? String(DEFAULT_SALT_BYTES);
  const saltBytes = Number(saltBytesRaw);
  if (!Number.isInteger(saltBytes) || saltBytes < 8 || saltBytes > 1024) {
    throw new Error("--salt-bytes must be an integer between 8 and 1024");
  }

  let password = args[0];
  if (typeof password !== "string" || password.length === 0) {
    if (!process.stdin.isTTY) {
      const stdin = (await readStdinAll()).trimEnd();
      password = stdin;
    } else {
      password = await readHiddenLine("Admin password: ");
    }
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required (arg, stdin, or interactive prompt)");
  }

  const salt = crypto.randomBytes(saltBytes);
  const hash = crypto.scryptSync(password, salt, HASH_KEY_LENGTH);
  const saltB64 = salt.toString("base64");
  const hashB64 = hash.toString("base64");

  if (flags.envFile) {
    updateEnvFile(flags.envFile, saltB64, hashB64);
    process.stderr.write(`Updated ${flags.envFile}\n`);
  }

  process.stdout.write(`ADMIN_PASSWORD_SALT=${saltB64}\n`);
  process.stdout.write(`ADMIN_PASSWORD_HASH=${hashB64}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.message || String(err)}\n`);
  process.stderr.write("Use --help for usage.\n");
  process.exit(1);
});
