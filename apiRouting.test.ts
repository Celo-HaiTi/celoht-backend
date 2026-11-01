import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import type { AddressInfo } from "node:net";

let nextServer: ChildProcess | undefined;
let baseUrl: string;
let serverOutput = "";

async function getAvailablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = (listener.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

describe("API routing", () => {
  beforeAll(async () => {
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    nextServer = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    nextServer.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    nextServer.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (nextServer.exitCode !== null) {
        throw new Error(`Next.js dev server exited before becoming ready.\n${serverOutput}`);
      }
      try {
        const response = await fetch(`${baseUrl}/api/v1`, { signal: AbortSignal.timeout(1_000) });
        if (response.status === 200) return;
      } catch {
        // The server can refuse connections while Next.js is starting.
      }
      await delay(250);
    }
    throw new Error(`Next.js dev server did not become ready.\n${serverOutput}`);
  }, 50_000);

  afterAll(async () => {
    if (!nextServer || nextServer.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => nextServer?.once("exit", () => resolve()));
    nextServer.kill("SIGTERM");
    await Promise.race([exited, delay(5_000)]);
    if (nextServer.exitCode === null) nextServer.kill("SIGKILL");
  });

  it("serves discovery and links real documented routes", async () => {
    const [response, trailingSlashResponse] = await Promise.all([
      fetch(`${baseUrl}/api/v1`),
      fetch(`${baseUrl}/api/v1/`),
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(trailingSlashResponse.status).toBe(200);
    expect(body.data).toMatchObject({
      service: "CeloHT backend",
      apiBasePath: "/api/v1",
      healthPath: "/api/v1/health",
      governancePath: "/governance",
    });
    expect(body.data.links).toContainEqual({
      rel: "governance-api",
      href: "/api/v1/governance",
      method: "GET",
    });
  });

  it("mounts the documented health route", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).not.toBe(404);
  });

  it("mounts governance and authentication at their documented paths and methods", async () => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/governance`),
      fetch(`${baseUrl}/api/v1/governance?wallet=invalid`),
      fetch(`${baseUrl}/api/v1/auth/nonce`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      fetch(`${baseUrl}/api/v1/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      fetch(`${baseUrl}/api/v1/auth/session`),
      fetch(`${baseUrl}/api/v1/auth/logout`, { method: "POST" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 422, 422, 422, 401, 200]);
  }, 30_000);

  it("returns 404 for an unknown API route", async () => {
    const response = await fetch(`${baseUrl}/api/v1/not-a-real-route`);
    expect(response.status).toBe(404);
  });

  it("returns 405 for an unsupported method on the API root", async () => {
    const response = await fetch(`${baseUrl}/api/v1`, { method: "POST" });
    expect(response.status).toBe(405);
  });
});