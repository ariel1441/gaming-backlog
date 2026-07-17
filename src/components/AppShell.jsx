import React, { Suspense, useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Gamepad2, Menu, User2 } from "lucide-react";
import Sidebar from "./Sidebar";
import AuthModal from "./AuthModal";
import KeepDemoModal from "./KeepDemoModal";
import MobileMoreSheet from "./MobileMoreSheet";
import ProfileAvatar from "./ProfileAvatar";
import { useAuth } from "../contexts/AuthContext";
import {
  isMobileMorePath,
  mobilePrimaryNavigationItems,
  visibleNavigationItems,
} from "../config/navigation";
import { preloadRoute } from "../config/routeLoaders";
import { preferredLandingPath } from "../utils/userPreferences";
import { useConfirm, useToast } from "./ui";
import { RouteLoading } from "./layout";

export default function AppShell() {
  const {
    user,
    isAuthenticated,
    isGuest,
    logout,
    startDemo,
    discardDemo,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusMoreAccount, setFocusMoreAccount] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showKeepDemo, setShowKeepDemo] = useState(false);
  const items = visibleNavigationItems(mobilePrimaryNavigationItems, {
    isAuthenticated,
    isGuest,
  });
  const moreActive = isMobileMorePath(location.pathname);
  const demoBannerActive = isGuest && location.pathname === "/";

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const openMore = (focusAccount = false) => {
    setFocusMoreAccount(focusAccount);
    setMoreOpen(true);
  };

  const closeMore = () => {
    setMoreOpen(false);
    setFocusMoreAccount(false);
  };

  const handleRequestAuth = () => {
    closeMore();
    setShowAuth(true);
  };

  const handleStartDemo = async () => {
    closeMore();
    const result = await startDemo();
    if (result?.success) {
      navigate(preferredLandingPath(result.user));
    } else if (result?.error) {
      toast.error(result.error);
    }
  };

  const handleDiscardDemo = async () => {
    closeMore();
    const shouldDiscard = await confirm({
      title: "Discard demo?",
      message:
        "This removes the temporary demo workspace and all changes made in it.",
      confirmLabel: "Discard demo",
      tone: "danger",
    });
    if (!shouldDiscard) return;
    await discardDemo();
    navigate("/");
  };

  const handleLogout = () => {
    closeMore();
    logout();
    navigate("/");
  };

  return (
    <div
      className="flex min-h-screen bg-surface-bg text-content-primary"
      style={{
        "--mobile-header-h": demoBannerActive
          ? "3.5rem"
          : "calc(3.5rem + env(safe-area-inset-top))",
      }}
    >
      <Sidebar />
      <div className="min-w-0 flex-1">
        <div
          className={[
            "sticky z-40 flex h-[var(--mobile-header-h)] items-center justify-between border-b border-surface-border/70 bg-surface-sidebar/95 px-3 backdrop-blur-xl lg:hidden",
            demoBannerActive ? "" : "pt-[env(safe-area-inset-top)]",
          ].join(" ")}
          style={{
            top: demoBannerActive ? "var(--demo-banner-h, 0px)" : "0px",
          }}
        >
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 bg-primary/14 text-primary-light">
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="truncate text-sm font-semibold text-content-primary">
              Gaming Backlog
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => openMore(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-content-muted transition-[background-color,border-color,color,box-shadow] hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70"
            aria-label="Open account menu"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            {isAuthenticated ? (
              <ProfileAvatar
                profile={user}
                size="sm"
                className="rounded-full"
              />
            ) : (
              <User2 className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="min-h-[calc(100dvh-var(--mobile-header-h))] min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:min-h-screen lg:pb-0">
          <Suspense
            key={location.pathname}
            fallback={<RouteLoading />}
          >
            <Outlet />
          </Suspense>
        </div>

        <nav
          aria-label="Mobile primary navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-surface-border/75 bg-surface-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
          style={{
            gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const preload = () => {
              preloadRoute(item.to).catch(() => {});
            };
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onFocus={preload}
                onPointerDown={preload}
                onTouchStart={preload}
                className={({ isActive }) =>
                  [
                    "my-1 flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-medium transition-[background-color,border-color,color,box-shadow]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70",
                    isActive
                      ? "border-primary/45 bg-surface-selected text-primary-light shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/20"
                      : "border-transparent text-content-muted hover:bg-surface-selected/55 hover:text-primary-light",
                  ].join(" ")
                }
              >
                <Icon
                  className="h-5 w-5 rounded-md transition-colors"
                  aria-hidden="true"
                />
                <span className="w-full truncate text-center">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => openMore(false)}
            aria-label="More destinations"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreActive ? "page" : undefined}
            className={[
              "my-1 flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-medium transition-[background-color,border-color,color,box-shadow]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70",
              moreActive
                ? "border-primary/45 bg-surface-selected text-primary-light shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/20"
                : "border-transparent text-content-muted hover:bg-surface-selected/55 hover:text-primary-light",
            ].join(" ")}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </div>

      <MobileMoreSheet
        open={moreOpen}
        onClose={closeMore}
        user={user}
        isAuthenticated={isAuthenticated}
        isGuest={isGuest}
        focusAccount={focusMoreAccount}
        onRequestAuth={handleRequestAuth}
        onStartDemo={handleStartDemo}
        onSaveDemo={() => {
          closeMore();
          setShowKeepDemo(true);
        }}
        onDiscardDemo={handleDiscardDemo}
        onLogout={handleLogout}
      />
      {showAuth ? <AuthModal onClose={() => setShowAuth(false)} /> : null}
      <KeepDemoModal
        open={showKeepDemo}
        onClose={() => setShowKeepDemo(false)}
      />
    </div>
  );
}
