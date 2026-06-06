import { withAuth } from "next-auth/middleware";

/**
 * 全站默认要求登录。
 * `matcher` 显式排除 /login、/api/auth/*、静态资源等公开路径。
 */
export default withAuth({
  pages: {
    signIn: "/login"
  }
});

export const config = {
  matcher: [
    /*
     * 匹配所有路径，但排除：
     *   /login            登录页本身
     *   /api/auth         NextAuth 路由
     *   /api/health       健康检查
     *   /_next/*          Next 内部资源
     *   静态文件（.png .ico .svg 等）
     */
    "/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)).*)"
  ]
};
