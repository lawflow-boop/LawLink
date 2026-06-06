"use client";

import { useState } from "react";
import { Sidebar, type FirmBrand } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";

export function AppShell({
  children,
  banner,
  firm,
  userAvatar
}: {
  children: React.ReactNode;
  /** v0.27: 顶部公告 banner（服务端渲染好后注入） */
  banner?: React.ReactNode;
  /** v0.42 项1: 侧栏品牌（律所名 / 副标题 / Logo） */
  firm: FirmBrand;
  /** v0.43: 当前用户头像（服务端读最新，供顶栏显示） */
  userAvatar?: string | null;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar firm={firm} />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} firm={firm} />
      <div className="md:pl-60">
        <Topbar onMobileMenuToggle={() => setMobileNavOpen(true)} userAvatar={userAvatar ?? null} />
        {banner}
        <main className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
