import React from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  SparklesIcon,
  ArrowsUpDownIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

const Tooltip = ({ text, children }) => (
  <div className="group relative flex items-center justify-center">
    {children}
    <div className="absolute left-10 top-1/2 -translate-y-1/2 px-2 py-1 text-xs rounded bg-surface-elevated border border-surface-border text-content-primary opacity-0 group-hover:opacity-100 transition whitespace-nowrap shadow-md pointer-events-none z-tooltip">
      {text}
    </div>
  </div>
);

const Sidebar = ({
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
}) => {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    console.log("Logged out successfully");
  };

  return (
    <aside
      className=" w-10 sm:w-14 md:w-16
                transition-all duration-300 bg-surface-bg/95 backdrop-blur-md flex flex-col items-center
                p-6 space-y-6 border-r border-surface-border shadow"
      style={{ zIndex: 999 }}
    >
      <Tooltip text="Search Games">
        <MagnifyingGlassIcon
          className={`w-6 h-6 cursor-pointer transition-colors ${
            searchVisible
              ? "text-primary"
              : "text-content-muted hover:text-content-primary"
          }`}
          onClick={() => setSearchVisible(!searchVisible)}
        />
      </Tooltip>

      <Tooltip text="Sort Games">
        <ArrowsUpDownIcon
          className={`w-6 h-6 cursor-pointer transition-colors ${
            sortVisible
              ? "text-primary"
              : "text-content-muted hover:text-content-primary"
          }`}
          onClick={() => setSortVisible(!sortVisible)}
        />
      </Tooltip>

      <Tooltip text="Filter Games">
        <FunnelIcon
          className={`w-6 h-6 cursor-pointer transition-colors ${
            filterVisible
              ? "text-primary"
              : "text-content-muted hover:text-content-primary"
          }`}
          onClick={() => setFilterVisible(!filterVisible)}
        />
      </Tooltip>

      <Tooltip text={showAddForm ? "Cancel Add Game" : "Add New Game"}>
        <PlusIcon
          className={`w-6 h-6 cursor-pointer transition-colors ${
            showAddForm
              ? "text-primary"
              : "text-content-muted hover:text-content-primary"
          }`}
          onClick={() => setShowAddForm(!showAddForm)}
        />
      </Tooltip>

      <Tooltip text="Surprise Me!">
        <SparklesIcon
          className="w-6 h-6 text-content-muted cursor-pointer hover:text-state-warning transition-colors"
          onClick={handleSurpriseMe}
        />
      </Tooltip>

      {isAdmin ? (
        <Tooltip text="Admin Logout">
          <ArrowRightOnRectangleIcon
            className="w-6 h-6 text-content-muted cursor-pointer hover:text-action-danger transition-colors"
            onClick={handleLogout}
          />
        </Tooltip>
      ) : (
        <Tooltip text="Admin Login">
          <KeyIcon
            className="w-6 h-6 text-content-muted cursor-pointer hover:text-state-success transition-colors"
            onClick={onShowAdminLogin}
          />
        </Tooltip>
      )}
    </aside>
  );
};

export default Sidebar;
