/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/szpitale/:path*',
        destination: 'https://laptop-75skiqoe.tail888d9f.ts.net/api/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
