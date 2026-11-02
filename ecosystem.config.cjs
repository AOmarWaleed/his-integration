const path = require("path");

const rootDir = __dirname;
const defaultNodeEnv = process.env.NODE_ENV || "production";
const apiInstances = Number.parseInt(process.env.PM2_API_INSTANCES || "1", 10);

module.exports = {
  apps: [
    {
      name: "rcm-api",
      cwd: rootDir,
      script: "./app.js",
      exec_mode: apiInstances > 1 ? "cluster" : "fork",
      instances: Math.max(apiInstances, 1),
      interpreter: "node",
      autorestart: true,
      watch: false,
      merge_logs: true,
      kill_timeout: 10000,
      listen_timeout: 10000,
      max_memory_restart: process.env.PM2_API_MAX_MEMORY || "700M",
      env: {
        NODE_ENV: defaultNodeEnv,
      },
    },
    {
      name: "rcm-worker",
      cwd: rootDir,
      script: "./worker.js",
      exec_mode: "fork",
      instances: 1,
      interpreter: "node",
      autorestart: true,
      watch: false,
      merge_logs: true,
      kill_timeout: 15000,
      listen_timeout: 15000,
      max_memory_restart: process.env.PM2_WORKER_MAX_MEMORY || "700M",
      env: {
        NODE_ENV: defaultNodeEnv,
      },
    },
  ],
};