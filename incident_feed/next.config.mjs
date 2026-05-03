/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@livekit/components-react",
    "livekit-client",
    "@livekit/components-core",
  ],
};

export default nextConfig;
