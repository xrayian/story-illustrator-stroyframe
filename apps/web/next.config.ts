import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@storyframe/schemas", "@storyframe/storage"],
};

export default nextConfig;