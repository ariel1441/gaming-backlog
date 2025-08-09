import React from "react";
import { useAuth } from "../contexts/AuthContext";

const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,

  searchVisible,
  setSearchVisible,

  sortVisible,
  setSortVisible,

  filterVisible,
  setFilterVisible,

  showAddForm,
  setShowAddForm,

  handleSurpriseMe,

  // legacy compatibility
  isAdmin,

  // opens Auth modal
  onShowAdminLogin,

  // opens public profile modal
  onShowPublicSettings,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const authed = isAuthenticated ?? !!isAdmin;

  const closeAllPanels = () => {
    setSearchVisible(false);
    setSortVisible(false);
    setFilterVisible(false);
    setShowAddForm(false);
  };

  const toggleSearch = () => {
    setSearchVisible((v) => !v);
    setSortVisible(false);
    setFilterVisible(false);
    setShowAddForm(false);
  };
  const toggleSort = () => {
    setSortVisible((v) => !v);
    setSearchVisible(false);
    setFilterVisible(false);
    setShowAddForm(false);
  };
  const toggleFilter = () => {
    setFilterVisible((v) => !v);
    setSearchVisible(false);
    setSortVisible(false);
    setShowAddForm(false);
  };
  const toggleAdd = () => {
    if (!authed) return onShowAdminLogin?.();
    setShowAddForm((v) => !v);
    setSearchVisible(false);
    setSortVisible(false);
    setFilterVisible(false);
  };

  // Allow expand/collapse only on lg+ (>= 1024px)
  const tryToggleSidebar = () => {
    if (window.innerWidth < 1024) return;
    setSidebarOpen(!sidebarOpen);
    if (sidebarOpen) closeAllPanels();
  };

  return (
    <aside
      className={[
        "relative",
        "w-16 lg:transition-[width] lg:duration-300 lg:ease-out",
        sidebarOpen ? "lg:w-72" : "lg:w-16",
        "bg-surface-card border-r border-surface-border text-content-primary",
        "h-screen shrink-0 flex flex-col overflow-hidden",
      ].join(" ")}
    >
      {/* HEADER */}
      <div className="px-2 lg:px-3 py-3 border-b border-surface-border">
        <button
          onClick={tryToggleSidebar}
          className="w-full h-11 flex items-center rounded-xl border border-surface-border bg-surface-elevated hover:border-primary hover:text-primary transition-colors"
          title={sidebarOpen ? "Collapse" : "Expand"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <div className="w-10 flex justify-center">
            <div className="grid place-items-center w-8 h-8 rounded-lg border border-surface-border bg-surface-card">
              <span className="text-base">≡</span>
            </div>
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
              <span className="hidden lg:inline truncate font-semibold">
                Gaming Backlog
              </span>
            )}
          </div>
        </button>
      </div>

      {/* AUTH BOX */}
      <div className="px-2 lg:px-3 py-3 border-b border-surface-border">
        {authed ? (
          sidebarOpen ? (
            <div className="hidden lg:flex items-center gap-2">
              <div className="w-10 flex justify-center">
                <div className="grid place-items-center w-8 h-8 rounded-lg border border-surface-border bg-surface-card">
                  <span className="text-sm">👤</span>
                </div>
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
                onClick={logout}
                className="ml-auto px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:border-primary hover:text-primary border border-surface-border text-content-primary text-xs transition-colors"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={logout}
              className="w-full h-11 flex items-center justify-center rounded-xl border border-surface-border bg-surface-elevated hover:border-primary hover:text-primary transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <div className="grid place-items-center w-8 h-8 rounded-lg border border-surface-border bg-surface-card">
                <span className="text-base">⎋</span>
              </div>
            </button>
          )
        ) : (
          <button
            onClick={onShowAdminLogin}
            className="w-full h-11 flex items-center rounded-xl border border-surface-border bg-action-primary hover:bg-action-primary-hover text-content-primary font-medium transition-colors"
            title="Sign in / Create account"
          >
            <div className="w-10 flex justify-center">
              <div className="grid place-items-center w-8 h-8 rounded-lg border border-surface-border bg-surface-card text-content-primary">
                <span className="text-sm">★</span>
              </div>
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
      <nav className="p-2 lg:p-3 flex-1 overflow-auto space-y-2">
        <SidebarRow
          label="Search"
          icon="🔎"
          active={searchVisible}
          onClick={toggleSearch}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Sort"
          icon="↕️"
          active={sortVisible}
          onClick={toggleSort}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Filter"
          icon="🎛️"
          active={filterVisible}
          onClick={toggleFilter}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label={authed ? "Add Game" : "Add (sign in)"}
          icon="➕"
          active={showAddForm}
          onClick={toggleAdd}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Surprise Me"
          icon="🎲"
          onClick={handleSurpriseMe}
          expanded={sidebarOpen}
        />
        {authed && (
          <SidebarRow
            label="Public Profile"
            icon="🌐"
            onClick={onShowPublicSettings}
            expanded={sidebarOpen}
          />
        )}
      </nav>

      {/* FOOTER TIP */}
      <div className="px-2 lg:px-3 py-3 border-t border-surface-border text-xs text-content-muted">
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
              Tip: drag & drop to reorder within a status.
            </span>
          ) : (
            <span>ℹ️</span>
          )}
        </div>
      </div>
    </aside>
  );
};

// Only the ROW highlights; the icon chip stays neutral.
// Active = primary border + subtle bg tint + primary icon.
const SidebarRow = ({ label, icon, active, onClick, expanded }) => {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full h-11 flex items-center rounded-xl border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-surface-border bg-surface-elevated text-content-primary hover:border-primary",
      ].join(" ")}
      title={label}
    >
      {/* Icon chip stays neutral; only icon color changes on active */}
      <div className="w-10 flex justify-center">
        <div className="grid place-items-center w-8 h-8 rounded-lg border border-surface-border bg-surface-card">
          <span
            className={[
              "text-base leading-none",
              active ? "text-primary" : "text-content-muted",
            ].join(" ")}
          >
            {icon}
          </span>
        </div>
      </div>

      {/* Text label (shows only when expanded) */}
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
