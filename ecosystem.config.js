const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const root = "/srv/meet.labattsimon.com";
const fileEnv = loadEnvFile(path.join(root, ".env"));

module.exports = {
  apps: [
    {
      name: "calid-web",
      // `next` is hoisted to the monorepo root by the node-modules linker, but
      // it must run with cwd=apps/web: next.config.ts resolves the env file as
      // the relative path "../../.env", and Next resolves .next/ from cwd too.
      script: path.join(root, "node_modules/.bin/next"),
      args: "start -H 127.0.0.1 -p 3050",
      cwd: path.join(root, "apps/web"),
      instances: 1,
      exec_mode: "fork",
      // Inject .env explicitly instead of relying on next.config.ts's dotenv
      // call: that only runs for the Next process itself, and being explicit
      // keeps the runtime env identical to what the build saw.
      env: {
        ...fileEnv,
        NODE_ENV: "production",
        PORT: 3050,
      },
      // Cal.com's server components hold a sizeable working set; restart well
      // above steady state so a leak is caught without flapping under load.
      max_memory_restart: "1500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(root, "logs/web-error.log"),
      out_file: path.join(root, "logs/web-out.log"),
      merge_logs: true,
    },
  ],
};
