/** @type {import('next').NextConfig} */
const nextConfig = {
  // typedRoutes 等 Stage 2 路由稳定后再开启
  experimental: {
    typedRoutes: false,
    serverActions: {
      // 材料上传需要更大的 body 限制（默认 1MB）
      bodySizeLimit: "25mb"
    },
    // v0.22: 启用 instrumentation.ts（进程启动时注册 cron）
    instrumentationHook: true,
    // v0.27: @napi-rs/canvas 是原生 .node 二进制，必须交给 Node 运行时 require
    // 否则 webpack 会试图 parse 二进制文件，让整个依赖链上的路由 (/matters) 500
    serverComponentsExternalPackages: ["@napi-rs/canvas", "unpdf"]
  }
};

export default nextConfig;
