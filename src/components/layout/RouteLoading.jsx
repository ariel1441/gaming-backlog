import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { normalizeUserPreferences } from "../../utils/userPreferences";
import AppPage from "./AppPage";
import {
  CollectionLoadingSkeleton,
  DashboardLoadingSkeleton,
  SettingsLoadingSkeleton,
} from "./LoadingSkeletons";

export default function RouteLoading() {
  const { pathname } = useLocation();
  const auth = useAuth();
  const viewMode = normalizeUserPreferences(auth?.user?.preferences).default_backlog_view;

  if (pathname === "/" || pathname === "/wishlist") {
    return (
      <CollectionLoadingSkeleton
        collection={pathname === "/wishlist" ? "wishlist" : "backlog"}
        viewMode={viewMode}
      />
    );
  }

  if (pathname === "/settings") {
    return <AppPage width="wide"><SettingsLoadingSkeleton /></AppPage>;
  }

  const denseRoutes = ["/activity", "/reviews", "/steam/import", "/steam/library", "/timeline"];
  return (
    <AppPage width="wide">
      <DashboardLoadingSkeleton dense={denseRoutes.includes(pathname) || pathname.startsWith("/lists/")} />
    </AppPage>
  );
}
