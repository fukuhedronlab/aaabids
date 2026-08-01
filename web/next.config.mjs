/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // wagmi/walletconnect optional deps that aren't needed in the browser build.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // The Coinbase/Base account connector (unused here) pulls @coinbase/cdp-sdk, which
    // references optional @x402/* subpaths that aren't installed. Ignore that subtree so
    // the bundle builds; the code path is never executed.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
};

export default nextConfig;
