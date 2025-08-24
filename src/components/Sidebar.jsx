// src/components/Sidebar.jsx
import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

import {
  Menu,
  Search as IconSearch,
  ArrowUpDown as IconSort,
  SlidersHorizontal as IconFilter,
  Plus as IconPlus,
  Dice5 as IconDice,
  Globe as IconGlobe,
  LogOut as IconLogout,
  User2 as IconUser,
  BarChart3 as IconInsights,
  CheckCircle2 as IconCompleted,
} from "lucide-react";

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
  isAdmin,
  onShowAdminLogin,
  onShowPublicSettings,
  onToggleCompleted,
  completedActive,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const authed = isAuthenticated ?? !!isAdmin;

  const navigate = useNavigate();
  const location = useLocation();
  const isInsights = location.pathname.startsWith("/insights");
  const goInsights = () => {
    closeAllPanels();
    navigate("/insights");
  };

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
          type="button"
          onClick={tryToggleSidebar}
          className="w-full h-11 flex items-center justify-center lg:justify-start rounded-lg bg-transparent hover:bg-primary-darker hover:text-white transition-colors"
          title={sidebarOpen ? "Collapse" : "Expand"}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <div className="w-10 h-11 flex justify-center items-center">
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
            <div className="hidden lg:flex items-center h-11">
              <div className="w-10 h-11 flex justify-center items-center">
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
                className="ml-auto h-8 px-2.5 inline-flex items-center justify-center gap-1 rounded bg-transparent hover:bg-primary-darker hover:text-white text-xs transition-colors"
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
              className="w-full h-11 flex items-center justify-center rounded-lg bg-transparent hover:bg-primary-darker hover:text-white transition-colors"
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
            className="w-full h-11 flex items-center justify-center lg:justify-start px-3 rounded-lg bg-transparent hover:bg-primary-darker hover:text-white transition-colors"
            title="Sign in / Create account"
          >
            <div className="w-10 h-11 flex justify-center items-center">
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
      <nav className="p-2 lg:p-3 flex-1 overflow-auto space-y-2">
        <SidebarRow
          label="Search"
          icon={IconSearch}
          active={searchVisible}
          onClick={toggleSearch}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Sort"
          icon={IconSort}
          active={sortVisible}
          onClick={toggleSort}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Filter"
          icon={IconFilter}
          active={filterVisible}
          onClick={toggleFilter}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label={authed ? "Add Game" : "Add (sign in)"}
          icon={IconPlus}
          active={showAddForm}
          onClick={toggleAdd}
          expanded={sidebarOpen}
        />
        <SidebarRow
          label="Surprise Me"
          icon={IconDice}
          onClick={handleSurpriseMe}
          expanded={sidebarOpen}
        />
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
          label="Completed games"
          icon={IconCompleted}
          active={completedActive}
          onClick={onToggleCompleted}
          expanded={sidebarOpen}
        />
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
              Tip: drag &amp; drop to reorder within a status.
            </span>
          ) : (
            <span>ℹ️</span>
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
        "w-full h-11 flex items-center justify-center lg:justify-start rounded-lg transition-colors",
        active
          ? "bg-primary-darker text-white"
          : "bg-transparent text-content-primary hover:bg-primary-darker hover:text-white",
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
