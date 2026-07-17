import React, { Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Gamepad2, Settings, User2 } from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import {
  primaryNavigationItems,
  visibleNavigationItems,
} from "../config/navigation";
import { preloadRoute } from "../config/routeLoaders";
import { RouteLoading } from "./layout";

export default function AppShell() {
  const { isAuthenticated, isGuest } = useAuth();
  const location = useLocation();
  const items = visibleNavigationItems(primaryNavigationItems, {
    isAuthenticated,
    isGuest,
  });

  return (
    <div className="flex min-h-screen bg-surface-bg text-content-primary">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-surface-border/70 bg-surface-sidebar/95 px-4 backdrop-blur-xl lg:hidden">
          <NavLink to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 bg-primary/14 text-primary-light">
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-content-primary">
              Gaming Backlog
            </span>
          </NavLink>
          <div className="flex items-center gap-1">
            <NavLink
              to={isAuthenticated ? "/me" : "/"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
              aria-label={isAuthenticated ? "Profile" : "Sign in"}
            >
              <User2 className="h-5 w-5" aria-hidden="true" />
            </NavLink>
            <NavLink
              to="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
            </NavLink>
          </div>
        </div>

        <div className="min-h-[calc(100vh-3.5rem)] min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:min-h-screen lg:pb-0">
          <Suspense
            key={location.pathname}
            fallback={<RouteLoading />}
          >
            <Outlet />
          </Suspense>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-surface-border/75 bg-surface-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
          style={{
            gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
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
                    "flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                    isActive ? "text-primary-light" : "text-content-muted",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={[
                        "h-5 w-5 rounded-md transition-colors",
                        isActive
                          ? "drop-shadow-active-navigation"
                          : "",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
