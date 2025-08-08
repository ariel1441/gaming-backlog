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
    if (window.innerWidth < 1024) return; // lock collapsed on md and below
    setSidebarOpen(!sidebarOpen);
    if (sidebarOpen) closeAllPanels();
  };

  return (
    <aside
      className={[
        "relative",
        // base/sm/md: always w-16 (collapsed). lg+: animate width between 16 and 72
        "w-16 lg:transition-[width] lg:duration-300 lg:ease-out",
        sidebarOpen ? "lg:w-72" : "lg:w-16",
        "bg-surface-card border-r border-surface-border text-content-primary",
        "h-screen shrink-0 flex flex-col overflow-hidden",
      ].join(" ")}
    >
      {/* HEADER: row-style toggle with icon + title (title only on lg when expanded) */}
      <div className="px-2 lg:px-3 py-3 border-b border-surface-border">
        <button
          onClick={tryToggleSidebar}
          className="w-full flex items-center rounded-lg border border-surface-border bg-surface-elevated hover:bg-surface-border transition-colors py-2"
          title={sidebarOpen ? "Collapse" : "Expand"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {/* fixed icon cell so it stays centered when collapsed */}
          <div className="w-10 flex justify-center">
            <span className="text-xl">≡</span>
          </div>
          {/* Title fades/slides in on lg when expanded; hidden otherwise */}
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

      {/* Auth box (single icon when collapsed) */}
      <div className="px-2 lg:px-3 py-3 border-b border-surface-border">
        {authed ? (
          sidebarOpen ? (
            // Expanded (lg+): avatar + username + text button
            <div className="hidden lg:flex items-center">
              <div className="w-10 flex justify-center">
                <span className="text-base">👤</span>
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
                className="ml-auto px-2.5 py-1.5 rounded bg-surface-elevated hover:bg-surface-border border border-surface-border text-content-primary text-xs transition-colors"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            // Collapsed: ONE icon button only (logout)
            <button
              onClick={logout}
              className="w-full flex items-center justify-center rounded-lg border border-surface-border bg-surface-elevated hover:bg-surface-border py-2 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <span className="text-xl">⎋</span>
            </button>
          )
        ) : (
          // Not authed: one button in both states; label only on lg when expanded
          <button
            onClick={onShowAdminLogin}
            className="w-full flex items-center px-3 py-2 rounded bg-action-primary hover:bg-action-primary-hover text-content-primary font-medium transition-colors"
            title="Sign in / Create account"
          >
            <div className="w-10 flex justify-center">
              <span className="text-lg">★</span>
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

      {/* Actions */}
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
      </nav>

      {/* Footer tip */}
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

// Fixed 40px icon cell; label fades/slides so icons never move.
// Label is only visible on lg when expanded (sidebarOpen true).
const SidebarRow = ({ label, icon, active, onClick, expanded }) => {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full flex items-center rounded-lg border transition-colors",
        active
          ? "bg-surface-elevated border-primary text-primary"
          : "bg-surface-elevated hover:bg-surface-border border-surface-border text-content-primary",
        "py-2",
      ].join(" ")}
      title={label}
    >
      <div className="w-10 flex justify-center">
        <span className="text-xl">{icon}</span>
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
