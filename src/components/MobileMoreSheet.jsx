import React, { useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LogIn,
  LogOut,
  PlayCircle,
  Save,
  Settings,
  Trash2,
  User2,
} from "lucide-react";
import {
  libraryNavigationItems,
  mobileMoreNavigationItems,
  navigationItemMatchesPath,
  visibleNavigationItems,
} from "../config/navigation";
import { profileDisplayName, profileHandle } from "../utils/userProfile";
import ProfileAvatar from "./ProfileAvatar";
import { Button, Sheet } from "./ui";

function DestinationLink({
  item,
  onNavigate,
  focusRef,
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      ref={focusRef}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control border px-3 py-2.5 text-left text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/70 active:translate-y-px",
          isActive
            ? "border-primary/55 bg-surface-selected text-content-primary shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/20"
            : "border-transparent text-content-secondary hover:border-primary/30 hover:bg-surface-selected/55 hover:text-primary-light",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={[
              "h-5 w-5 shrink-0",
              isActive ? "text-primary-light" : "text-content-muted",
            ].join(" ")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-muted">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export default function MobileMoreSheet({
  open,
  onClose,
  user,
  isAuthenticated,
  isGuest,
  focusAccount = false,
  onRequestAuth,
  onStartDemo,
  onSaveDemo,
  onDiscardDemo,
  onLogout,
}) {
  const location = useLocation();
  const initialFocusRef = useRef(null);
  const generalItems = visibleNavigationItems(mobileMoreNavigationItems, {
    isAuthenticated,
    isGuest,
  });
  const steamItems = visibleNavigationItems(libraryNavigationItems, {
    isAuthenticated,
    isGuest,
  });
  const hasActiveDestination = [...generalItems, ...steamItems].some((item) =>
    navigationItemMatchesPath(item, location.pathname),
  );
  const firstDestination = generalItems[0] || steamItems[0];
  const accountRouteActive =
    location.pathname === "/me" || location.pathname === "/settings";
  const accountAutoFocus = focusAccount || accountRouteActive;

  return (
    <Sheet
      open={open}
      title="More"
      description="More destinations and account controls."
      onClose={onClose}
      initialFocusRef={initialFocusRef}
    >
      <div className="space-y-5">
        {generalItems.length ? (
          <Section title="Library">
            {generalItems.map((item) => (
              <DestinationLink
                key={item.to}
                item={item}
                onNavigate={onClose}
                focusRef={
                  !focusAccount &&
                  (navigationItemMatchesPath(item, location.pathname) ||
                    (!hasActiveDestination &&
                      !accountRouteActive &&
                      item === firstDestination))
                    ? initialFocusRef
                    : undefined
                }
              />
            ))}
          </Section>
        ) : null}

        {steamItems.length ? (
          <Section title="Steam">
            {steamItems.map((item) => (
              <DestinationLink
                key={item.to}
                item={item}
                onNavigate={onClose}
                focusRef={
                  !focusAccount &&
                  navigationItemMatchesPath(item, location.pathname)
                    ? initialFocusRef
                    : undefined
                }
              />
            ))}
          </Section>
        ) : null}

        <Section title="Account">
          {isAuthenticated ? (
            <div className="mb-2 flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-bg/35 p-3">
              <ProfileAvatar profile={user} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-content-primary">
                  {profileDisplayName(user)}
                </div>
                <div className="truncate text-xs text-content-muted">
                  {profileHandle(user)}
                </div>
              </div>
            </div>
          ) : null}

          {isAuthenticated ? (
            <DestinationLink
              item={{ to: "/me", label: "Profile", icon: User2 }}
              onNavigate={onClose}
              focusRef={
                accountAutoFocus && location.pathname !== "/settings"
                  ? initialFocusRef
                  : undefined
              }
            />
          ) : null}
          <DestinationLink
            item={{ to: "/settings", label: "Settings", icon: Settings }}
            onNavigate={onClose}
            focusRef={
              accountAutoFocus &&
              (!isAuthenticated || location.pathname === "/settings")
                ? initialFocusRef
                : undefined
            }
          />

          <div className="mt-2 border-t border-surface-border/65 pt-2">
            {!isAuthenticated ? (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full justify-start"
                  onClick={onRequestAuth}
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in or create account
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={onStartDemo}
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  Try demo
                </Button>
              </div>
            ) : isGuest ? (
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full justify-start"
                  onClick={onSaveDemo}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save demo
                </Button>
                <Button
                  type="button"
                  variant="dangerGhost"
                  className="w-full justify-start"
                  onClick={onDiscardDemo}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Discard demo
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="dangerGhost"
                className="w-full justify-start"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            )}
          </div>
        </Section>
      </div>
    </Sheet>
  );
}
