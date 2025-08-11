// src/hooks/useUI.js
import { useCallback, useState } from "react";

export function useUI(initial = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(!!initial.sidebarOpen);
  const [filterVisible, setFilterVisible] = useState(!!initial.filterVisible);
  const [searchVisible, setSearchVisible] = useState(!!initial.searchVisible);
  const [sortVisible, setSortVisible] = useState(!!initial.sortVisible);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPublicSettings, setShowPublicSettings] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // ergonomic togglers
  const toggle = (set) => () => set((v) => !v);
  const open = (set) => () => set(true);
  const close = (set) => () => set(false);

  // scroll helper
  const scrollIntoView = useCallback(
    (refOrId, opts = { behavior: "smooth", block: "start" }) => {
      if (!refOrId) return;
      if (typeof refOrId === "string") {
        const el = document.getElementById(refOrId);
        el?.scrollIntoView(opts);
      } else {
        refOrId.current?.scrollIntoView?.(opts);
      }
    },
    []
  );

  return {
    sidebarOpen,
    setSidebarOpen,
    filterVisible,
    setFilterVisible,
    searchVisible,
    setSearchVisible,
    sortVisible,
    setSortVisible,
    showAddForm,
    setShowAddForm,
    showPublicSettings,
    setShowPublicSettings,
    showAdminLogin,
    setShowAdminLogin,

    // togglers
    toggleSidebar: toggle(setSidebarOpen),
    toggleFilter: toggle(setFilterVisible),
    toggleSearch: toggle(setSearchVisible),
    toggleSort: toggle(setSortVisible),
    openAddForm: open(setShowAddForm),
    closeAddForm: close(setShowAddForm),
    openPublicSettings: open(setShowPublicSettings),
    closePublicSettings: close(setShowPublicSettings),
    openAdminLogin: open(setShowAdminLogin),
    closeAdminLogin: close(setShowAdminLogin),

    // helpers
    scrollIntoView,
  };
}
