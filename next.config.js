/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build standalone agar Docker image bisa kecil & cepat di-start.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
