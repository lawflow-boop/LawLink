"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const unlockStaleInteractionLock = () => {
      const hasOpenModal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );

      if (hasOpenModal) {
        return;
      }

      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }

      document.querySelectorAll<HTMLElement>("[inert]").forEach((element) => {
        element.removeAttribute("inert");
      });

      document.querySelectorAll<HTMLElement>('[aria-hidden="true"]').forEach((element) => {
        const isAppRoot = element.contains(document.querySelector("main"));
        if (isAppRoot) {
          element.removeAttribute("aria-hidden");
        }
      });
    };

    unlockStaleInteractionLock();
    const observer = new MutationObserver(unlockStaleInteractionLock);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "inert", "aria-hidden", "data-state"],
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar firm={firm} />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} firm={firm} />
      <div className="min-w-0 md:ml-60">
        <Topbar onMobileMenuToggle={() => setMobileNavOpen(true)} userAvatar={userAvatar ?? null} />
        {banner}
        <main className="block min-w-0 overflow-x-hidden px-4 py-4 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
