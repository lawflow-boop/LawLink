/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev 与 build 分开输出，避免生产构建覆盖正在运行的开发缓存导致页面不渲染
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // typedRoutes 等 Stage 2 路由稳定后再开启
  typedRoutes: false,
  // v0.27: @napi-rs/canvas 是原生 .node 二进制，必须交给 Node 运行时 require
  // 否则构建器会试图 parse 二进制文件，让整个依赖链上的路由 (/matters) 500
  serverExternalPackages: ["@napi-rs/canvas", "unpdf"],
  experimental: {
    serverActions: {
      // 材料上传需要更大的 body 限制（默认 1MB）
      bodySizeLimit: "25mb"
    }
  }
};

export default nextConfig;
