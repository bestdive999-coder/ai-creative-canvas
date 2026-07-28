import { spawn } from "node:child_process";

const sharedEnv = {
  ...process.env,
  ECOM_EMPLOYEE_HOST: process.env.ECOM_EMPLOYEE_HOST || "127.0.0.1",
  ECOM_ADMIN_HOST: process.env.ECOM_ADMIN_HOST || "127.0.0.1"
};

const services = [
  spawn(process.execPath, ["server.js"], { stdio: "inherit", env: sharedEnv }),
  spawn(process.execPath, ["admin-server.js"], { stdio: "inherit", env: sharedEnv })
];

let shuttingDown = false;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const service of services) {
    if (!service.killed) service.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(signal));
}

for (const service of services) {
  service.on("exit", (code, signal) => {
    if (!shuttingDown) {
      process.exitCode = Number.isInteger(code) ? code : 1;
      stopAll(signal || "SIGTERM");
    }
  });
}

await Promise.all(services.map((service) => new Promise((resolve) => service.on("exit", resolve))));
