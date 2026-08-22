import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@cesium/engine", "@cesium/widgets"],
  // Keep type checking in-process. The CLI mode spawns a detached compiler,
  // which is not supported by restricted/containerized build environments.
  experimental: {
    useTypeScriptCli: false,
  },
  async headers() {
    const externalOrigins = [process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT, "https://tile.openstreetmap.org", "https://server.arcgisonline.com"].filter(Boolean);
    const connect = ["'self'", ...externalOrigins].join(" ");
    const imgSrc = ["'self'", "data:", "blob:", ...externalOrigins].join(" ");
    const scriptPolicy = process.env.NODE_ENV === "production" ? "'self' 'unsafe-inline' 'wasm-unsafe-eval'" : "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'";
    const security = [
      {
        key: "Content-Security-Policy",
        value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src ${imgSrc}; font-src 'self' data:; worker-src 'self' blob:; connect-src ${connect}`,
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
