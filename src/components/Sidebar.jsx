import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import ProfileAvatar from "./ProfileAvatar";
import { profileDisplayName, profileHandle } from "../utils/userProfile";
import {
  libraryNavigationItems,
  primaryNavigationItems,
  visibleNavigationItems,
} from "../config/navigation";

const COLLAPSED_STORAGE_KEY = "gaming_backlog_sidebar_collapsed_v1";
const NARROW_DESKTOP_QUERY = "(max-width: 1279px)";

function initialCollapsedState() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia(NARROW_DESKTOP_QUERY).matches) return true;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function NavigationItem({ item, collapsed }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "group relative flex min-h-11 items-center rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center px-2" : "gap-3 px-3",
          isActive
            ? "bg-primary/14 text-content-primary"
            : "text-content-muted hover:bg-surface-elevated/65 hover:text-content-primary",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={[
              "absolute inset-y-2 -left-2 w-1 rounded-r-full transition-opacity",
              isActive ? "bg-primary opacity-100" : "opacity-0",
            ].join(" ")}
            aria-hidden="true"
          />
          <Icon
            className={[
              "h-[18px] w-[18px] shrink-0 transition-colors",
              isActive
                ? "text-primary-light"
                : "text-content-muted group-hover:text-content-primary",
            ].join(" ")}
            aria-hidden="true"
          />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </>
      )}
    </NavLink>
  );
}

function AccountMenu({ collapsed, user, onClose, onNavigate, onLogout }) {
  const displayName = user?.display_name?.trim();

  return (
    <div
      className={[
        "absolute z-50 w-56 overflow-hidden rounded-xl border border-surface-border bg-surface-card p-1.5 shadow-menu",
        collapsed
          ? "bottom-0 left-[calc(100%+0.6rem)]"
          : "bottom-[calc(100%+0.6rem)] left-0",
      ].join(" ")}
    >
      <div className="border-b border-surface-border/70 px-3 py-2.5">
        <div className="truncate text-sm font-semibold text-content-primary">
          {profileDisplayName(user)}
        </div>
        {displayName ? (
          <div className="truncate text-xs text-content-muted">
            {profileHandle(user)}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          onNavigate("/me");
        }}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-content-secondary transition-colors hover:bg-surface-elevated hover:text-content-primary"
      >
        <User2 className="h-4 w-4" aria-hidden="true" />
        Profile
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          onNavigate("/settings");
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-content-secondary transition-colors hover:bg-surface-elevated hover:text-content-primary"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Settings
      </button>
      <div className="mt-1 border-t border-surface-border/70 pt-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            onLogout();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-content-muted transition-colors hover:bg-state-error/10 hover:text-state-error"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, isAuthenticated, isGuest, logout } = useAuth();
  const navigate = useNavigate();
  const accountRef = useRef(null);
  const [collapsed, setCollapsed] = useState(initialCollapsedState);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(NARROW_DESKTOP_QUERY);
    const handleChange = (event) => {
      if (event.matches) setCollapsed(true);
      setAccountOpen(false);
    };
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const customDisplayName = user?.display_name?.trim() || "";
  const primaryAccountLabel = customDisplayName || profileHandle(user || {});
  const secondaryAccountLabel = customDisplayName
    ? profileHandle(user || {})
    : "Profile";

  const allowedPrimary = visibleNavigationItems(primaryNavigationItems, {
    isAuthenticated,
    isGuest,
  });
  const allowedLibrary = visibleNavigationItems(libraryNavigationItems, {
    isAuthenticated,
    isGuest,
  });

  useDismissibleLayer({
    open: accountOpen,
    layerRef: accountRef,
    onDismiss: () => setAccountOpen(false),
  });

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
    setAccountOpen(false);
  };

  return (
    <>
      <div
        className={[
          "hidden shrink-0 transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-[204px]",
        ].join(" ")}
        aria-hidden="true"
      />
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 hidden h-dvh border-r border-surface-border/70 bg-surface-sidebar transition-[width] duration-200 lg:flex lg:flex-col",
          collapsed ? "w-[68px]" : "w-[204px]",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-16 shrink-0 items-center border-b border-surface-border/55 px-3",
            collapsed ? "justify-start" : "gap-2",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
              collapsed
                ? "border-primary/35 bg-primary/10 text-primary-light hover:border-primary/60 hover:bg-primary/16"
                : "border-surface-border/70 bg-surface-elevated/45 text-content-muted hover:border-primary/40 hover:bg-surface-elevated hover:text-content-primary",
            ].join(" ")}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <PanelLeftClose
                className="h-[18px] w-[18px]"
                aria-hidden="true"
              />
            )}
          </button>

          {!collapsed ? (
            <NavLink
              to="/"
              className="min-w-0 flex-1 rounded-lg px-1 py-2 text-sm font-semibold tracking-tight text-content-primary transition-colors hover:text-primary-light"
              title="Gaming Backlog"
            >
              <span className="block whitespace-nowrap">Gaming Backlog</span>
            </NavLink>
          ) : null}
        </div>

        <nav
          className={[
            "min-h-0 flex-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          ].join(" ")}
        >
          <div className="space-y-1">
            {allowedPrimary.map((item) => (
              <NavigationItem key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>

          {allowedLibrary.length ? (
            <div className="mt-6 border-t border-surface-border/55 pt-4">
              {!collapsed ? (
                <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-muted/75">
                  Library
                </div>
              ) : null}
              <div className="space-y-1">
                {allowedLibrary.map((item) => (
                  <NavigationItem
                    key={item.to}
                    item={item}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div
          ref={accountRef}
          className={[
            "relative shrink-0 border-t border-surface-border/55",
            collapsed ? "p-2" : "p-3",
          ].join(" ")}
        >
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => setAccountOpen((current) => !current)}
                className={[
                  "flex w-full items-center rounded-xl border border-transparent text-left transition-colors hover:border-surface-border/70 hover:bg-surface-elevated/60",
                  collapsed ? "h-11 justify-center" : "gap-2.5 p-2",
                ].join(" ")}
                aria-expanded={accountOpen}
                aria-label="Open account menu"
                title={collapsed ? primaryAccountLabel : undefined}
              >
                {collapsed ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border bg-surface-elevated text-content-secondary">
                    <User2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : (
                  <ProfileAvatar
                    profile={user}
                    size="sm"
                    className="shrink-0 rounded-full"
                  />
                )}
                {!collapsed ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-content-primary">
                        {primaryAccountLabel}
                      </div>
                      <div className="truncate text-xs text-content-muted">
                        {secondaryAccountLabel}
                      </div>
                    </div>
                    <ChevronRight
                      className={[
                        "h-4 w-4 shrink-0 text-content-muted transition-transform",
                        accountOpen ? "-rotate-90" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  </>
                ) : null}
              </button>
              {accountOpen ? (
                <AccountMenu
                  collapsed={collapsed}
                  user={user}
                  onClose={() => setAccountOpen(false)}
                  onNavigate={navigate}
                  onLogout={logout}
                />
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/")}
              className={[
                "flex h-11 w-full items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-sm font-semibold text-primary-light transition-colors hover:bg-primary/16",
                collapsed ? "px-0" : "gap-2 px-3",
              ].join(" ")}
              title={collapsed ? "Sign in" : undefined}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {!collapsed ? "Sign in" : null}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
