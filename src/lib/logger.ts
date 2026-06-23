// Structured JSON logging utility — writes to stdout in production, pretty in dev

import { collectCredentialValues, credentialStore } from "@/providers/credential-store";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";
const credentialRequirements = {
  "live-kroger-api": ["client_id", "client_secret", "oauth_access_token"],
  "live-walmart-api": ["api_key"],
  "live-ibotta-api": ["client_id", "client_secret", "api_key", "oauth_access_token"],
} as const;

function getSensitiveValues() {
  return collectCredentialValues(credentialStore, credentialRequirements).filter(value => value.length >= 4);
}

export function redactSensitiveValue(value: unknown, sensitiveValues = getSensitiveValues()): unknown {
  if (typeof value === "string") {
    return sensitiveValues.reduce((redacted, secret) => redacted.split(secret).join("[REDACTED]"), value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveValue(item, sensitiveValues));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactSensitiveValue(nested, sensitiveValues)])
    );
  }

  return value;
}

function log(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const sensitiveValues = getSensitiveValues();
  const entry: LogEntry = {
    level,
    msg: redactSensitiveValue(msg, sensitiveValues) as string,
    ts: new Date().toISOString(),
    ...(fields ? (redactSensitiveValue(fields, sensitiveValues) as Record<string, unknown>) : {}),
  };

  if (isDev) {
    const color = { debug: "\x1b[37m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" }[level];
    const prefix = `${color}[${level.toUpperCase()}]\x1b[0m`;
    const extras = fields ? " " + JSON.stringify(redactSensitiveValue(fields, sensitiveValues)) : "";
    console.log(`${prefix} ${entry.msg}${extras}`);
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log("error", msg, fields),
};
