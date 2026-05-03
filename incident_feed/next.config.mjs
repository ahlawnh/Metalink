/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["livekit-client", "@livekit/components-react"],
};

export default nextConfig;
