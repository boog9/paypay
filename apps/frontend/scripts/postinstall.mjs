#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error(`Failed to execute ${command}: command not found.`);
    } else {
      console.error(result.error.message);
    }

    process.exit(1);
  }

  return result.status === null ? 0 : result.status;
}

function hasAptGet() {
  const result = spawnSync("apt-get", ["--version"], {
    stdio: "ignore",
    env: process.env,
  });

  if (result.error) {
    return false;
  }

  return result.status === 0;
}

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  console.log(
    "Skipping Playwright install because PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 is set."
  );
  process.exit(0);
}

const args = ["exec", "playwright", "install"];

if (hasAptGet()) {
  args.push("--with-deps");
} else {
  console.warn(
    "Skipping Playwright system dependency installation because apt-get is unavailable in this environment."
  );
}

const status = run("pnpm", args);
process.exit(status);
