// Structured JSON logging utility — writes to stdout in production, pretty in dev

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

function log(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...fields,
  };

  if (isDev) {
    const color = { debug: "\x1b[37m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" }[level];
    const prefix = `${color}[${level.toUpperCase()}]\x1b[0m`;
    const extras = fields ? " " + JSON.stringify(fields) : "";
    console.log(`${prefix} ${msg}${extras}`);
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
