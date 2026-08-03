import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const laserRoot = dirname(dirname(fileURLToPath(import.meta.resolve("@laserdata/laser-sdk"))));
const iggyRoot = dirname(dirname(fileURLToPath(import.meta.resolve("apache-iggy"))));
const laserPackage = JSON.parse(readFileSync(join(laserRoot, "package.json"), "utf8"));
const iggyPackage = JSON.parse(readFileSync(join(iggyRoot, "package.json"), "utf8"));

if (laserPackage.version !== "0.0.1" || iggyPackage.version !== "0.8.1-edge.3") {
  console.log("LaserData TLS patch skipped: installed SDK versions do not need this pinned workaround.");
  process.exit(0);
}

const laserTransport = join(laserRoot, "dist", "iggy", "apache-iggy.js");
const withoutSni = "                host: parsed.host,\n                ...(parsed.ca !== undefined";
const withSni = "                host: parsed.host,\n                servername: parsed.host,\n                ...(parsed.ca !== undefined";
let laserSource = readFileSync(laserTransport, "utf8");
if (!laserSource.includes(withSni)) {
  if (!laserSource.includes(withoutSni)) throw new Error("LaserData TLS patch failed: transport shape changed");
  laserSource = laserSource.replace(withoutSni, withSni);
  writeFileSync(laserTransport, laserSource);
}

const iggyConfig = join(iggyRoot, "dist", "client", "client.config.js");
const unsupportedGuard = "    if (protocol === 'vsr' && config.transport === 'TLS')\n        throw new TypeError('VSR framing currently supports the TCP transport only');\n";
let iggySource = readFileSync(iggyConfig, "utf8");
if (iggySource.includes(unsupportedGuard)) {
  iggySource = iggySource.replace(unsupportedGuard, "");
  writeFileSync(iggyConfig, iggySource);
}

console.log("LaserData TLS patch applied for @laserdata/laser-sdk 0.0.1.");
