import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These Node-only SDKs manage sockets and runtime-specific primitives. They
  // must execute from node_modules instead of being transformed by Turbopack.
  serverExternalPackages: [
    "@laserdata/laser-sdk",
    "falkordb",
    "rocketride",
  ],
};

export default nextConfig;
