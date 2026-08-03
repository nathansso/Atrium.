import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { patchLaserDataTls } from "../../../scripts/patch-laserdata-tls.mjs";

const roots: string[] = [];
const hostLine = "                host: parsed.host,\n                ...(parsed.ca !== undefined";
const guard = "    if (protocol === 'vsr' && config.transport === 'TLS')\n        throw new TypeError('VSR framing currently supports the TCP transport only');\n";

function fixture(laserVersion = "0.0.1") {
  const root = mkdtempSync(join(tmpdir(), "atrium-laser-patch-"));
  roots.push(root);
  const laserRoot = join(root, "laser");
  const iggyRoot = join(root, "iggy");
  mkdirSync(join(laserRoot, "dist", "iggy"), { recursive: true });
  mkdirSync(join(iggyRoot, "dist", "client"), { recursive: true });
  writeFileSync(join(laserRoot, "package.json"), JSON.stringify({ version: laserVersion }));
  writeFileSync(join(iggyRoot, "package.json"), JSON.stringify({ version: "0.8.1-edge.3" }));
  writeFileSync(join(laserRoot, "dist", "iggy", "apache-iggy.js"), hostLine);
  writeFileSync(join(iggyRoot, "dist", "client", "client.config.js"), guard);
  return { laserRoot, iggyRoot };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()))) throw new Error("Refusing to clean outside the temp directory");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("LaserData TLS install patch", () => {
  it("adds SNI and permits VSR over TLS for the pinned SDKs", () => {
    const paths = fixture();
    expect(patchLaserDataTls(paths.laserRoot, paths.iggyRoot)).toBe(true);
    expect(readFileSync(join(paths.laserRoot, "dist", "iggy", "apache-iggy.js"), "utf8"))
      .toContain("servername: parsed.host");
    expect(readFileSync(join(paths.iggyRoot, "dist", "client", "client.config.js"), "utf8"))
      .not.toContain("VSR framing currently supports the TCP transport only");
  });

  it("is idempotent", () => {
    const paths = fixture();
    patchLaserDataTls(paths.laserRoot, paths.iggyRoot);
    expect(() => patchLaserDataTls(paths.laserRoot, paths.iggyRoot)).not.toThrow();
  });

  it("leaves other SDK versions untouched", () => {
    const paths = fixture("0.0.2");
    expect(patchLaserDataTls(paths.laserRoot, paths.iggyRoot)).toBe(false);
    expect(readFileSync(join(paths.laserRoot, "dist", "iggy", "apache-iggy.js"), "utf8"))
      .not.toContain("servername: parsed.host");
  });

  it("fails loudly when the pinned vendor source changes", () => {
    const paths = fixture();
    writeFileSync(join(paths.laserRoot, "dist", "iggy", "apache-iggy.js"), "unexpected");
    expect(() => patchLaserDataTls(paths.laserRoot, paths.iggyRoot))
      .toThrow("LaserData TLS patch failed: transport shape changed");
  });
});
