/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.omise.co',
      },
    ],
  },
};

export default nextConfig;
