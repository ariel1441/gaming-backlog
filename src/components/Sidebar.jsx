// src/components/Sidebar.jsx
import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

import {
  Menu,
  Globe as IconGlobe,
  LogOut as IconLogout,
  User2 as IconUser,
  BarChart3 as IconInsights,
  Sparkles as IconDemo,
} from "lucide-react";

const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,
  setShowAddForm,
  isAdmin,
  onShowAdminLogin,
  onShowPublicSettings,
}) => {
  const { user, isAuthenticated, logout, isGuest, startDemo } = useAuth();
  const authed = isAuthenticated ?? !!isAdmin;

  const navigate = useNavigate();
  const location = useLocation();
  const isInsights = location.pathname.startsWith("/insights");
  const goInsights = () => {
    closeAllPanels();
    navigate("/insights");
  };

  const closeAllPanels = () => {
    setShowAddForm(false);
  };

  const tryToggleSidebar = () => {
    if (window.innerWidth < 1024) return;
    setSidebarOpen(!sidebarOpen);
    if (sidebarOpen) closeAllPanels();
  };
  const startLiveDemo = async () => {
    closeAllPanels();
    await startDemo();
  };

  return (
    <aside
      className={[
        "relative",
        "w-16 lg:transition-[width] lg:duration-300 lg:ease-out",
        sidebarOpen ? "lg:w-72" : "lg:w-16",
        "bg-surface-card/95 border-r border-surface-border text-content-primary",
        "h-screen shrink-0 flex flex-col overflow-hidden",
      ].join(" ")}
    >
      {/* HEADER */}
      <div className="border-b border-surface-border px-2 py-3 lg:px-3">
        <button
          type="button"
          onClick={tryToggleSidebar}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-transparent transition-colors hover:bg-surface-elevated hover:text-content-primary lg:justify-start"
          title={sidebarOpen ? "Collapse" : "Expand"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <div className="flex h-11 w-10 items-center justify-center">
            <Menu className="w-5 h-5" />
          </div>
          <div
            className={[
              "min-w-0 text-left",
              "transition-all duration-300",
              "opacity-0 -translate-x-2 pointer-events-none",
              sidebarOpen
                ? "lg:opacity-100 lg:translate-x-0 lg:pointer-events-auto"
                : "",
            ].join(" ")}
          >
            {sidebarOpen && (
              <span className="hidden truncate font-semibold lg:inline">
                Gaming Backlog
              </span>
            )}
          </div>
        </button>
      </div>

      {/* AUTH BOX */}
      <div className="border-b border-surface-border px-2 py-3 lg:px-3">
        {authed ? (
          sidebarOpen ? (
            <div className="hidden h-11 items-center rounded-lg bg-surface-bg/35 pr-2 lg:flex">
              <div className="flex h-11 w-10 items-center justify-center">
                <IconUser className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-content-secondary">
                  Signed in as
                </div>
                <div className="text-sm font-medium truncate">
                  {user?.username ?? "You"}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-md bg-transparent px-2.5 text-xs transition-colors hover:bg-surface-elevated hover:text-content-primary"
                title="Sign out"
              >
                <IconLogout className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={logout}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-transparent transition-colors hover:bg-surface-elevated hover:text-content-primary"
              title="Sign out"
              aria-label="Sign out"
            >
              <IconLogout className="w-5 h-5" />
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onShowAdminLogin}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-transparent px-3 transition-colors hover:bg-surface-elevated hover:text-content-primary lg:justify-start"
            title="Sign in / Create account"
          >
            <div className="flex h-11 w-10 items-center justify-center">
              <IconUser className="w-5 h-5" />
            </div>
            <div
              className={[
                "transition-all duration-300",
                "opacity-0 -translate-x-2 pointer-events-none",
                sidebarOpen
                  ? "lg:opacity-100 lg:translate-x-0 lg:pointer-events-auto"
                  : "",
              ].join(" ")}
            >
              {sidebarOpen && (
                <span className="hidden lg:inline">
                  Sign in / Create account
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* ACTIONS */}
      <nav className="flex-1 space-y-1.5 overflow-auto p-2 lg:p-3">
        <SidebarRow
          label="Insights"
          icon={IconInsights}
          active={isInsights}
          onClick={goInsights}
          expanded={sidebarOpen}
        />
        {authed && (
          <SidebarRow
            label="Public Profile"
            icon={IconGlobe}
            onClick={onShowPublicSettings}
            expanded={sidebarOpen}
          />
        )}
        <SidebarRow
          label="Try Live Demo"
          icon={IconDemo}
          onClick={startLiveDemo}
          expanded={sidebarOpen}
        />
      </nav>

      {/* FOOTER TIP */}
      <div className="border-t border-surface-border px-2 py-3 text-xs text-content-muted lg:px-3">
        <div
          className={[
            "transition-all duration-300 text-center lg:text-left",
            "opacity-0 -translate-x-2 pointer-events-none",
            sidebarOpen
              ? "lg:opacity-100 lg:translate-x-0 lg:pointer-events-auto"
              : "",
          ].join(" ")}
        >
          {sidebarOpen ? (
            <span className="hidden lg:inline">
              Drag cards to reorder games within a status.
            </span>
          ) : (
            <span className="sr-only">Backlog tip</span>
          )}
        </div>
      </div>
    </aside>
  );
};

// Sidebar row
const SidebarRow = ({ label, icon, active, onClick, expanded }) => {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-11 w-full items-center justify-center rounded-lg border text-sm transition-colors lg:justify-start",
        active
          ? "border-primary/45 bg-primary/15 text-primary-light"
          : "border-transparent bg-transparent text-content-secondary hover:border-surface-border hover:bg-surface-elevated/70 hover:text-content-primary",
      ].join(" ")}
      title={label}
    >
      <div className="w-10 h-full flex items-center justify-center">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div
        className={[
          "min-w-0 text-left",
          "transition-all duration-300",
          "opacity-0 -translate-x-2 pointer-events-none",
          expanded
            ? "lg:opacity-100 lg:translate-x-0 lg:pointer-events-auto"
            : "",
        ].join(" ")}
      >
        {expanded && <span className="hidden lg:inline truncate">{label}</span>}
      </div>
    </button>
  );
};

export default Sidebar;
