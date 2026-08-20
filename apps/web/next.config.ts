import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@storyframe/schemas", "@storyframe/storage"],
  allowedDevOrigins: ["192.168.0.101"],
};

export default nextConfig;