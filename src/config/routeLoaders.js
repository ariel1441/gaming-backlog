const routeLoaders = {
  "/": () => import("../pages/Backlog/BacklogPage"),
  "/next-up": () => import("../pages/PlayNextPage"),
  "/discover": () => import("../pages/DiscoverPage"),
  "/insights": () => import("../pages/Insights/InsightsPage"),
  "/me": () => import("../pages/OwnerProfilePage"),
  "/u/:username": () => import("../pages/PublicProfile"),
  "/reviews": () => import("../pages/ReviewsPage"),
  "/settings": () => import("../pages/SettingsPage"),
  "/steam/import": () => import("../pages/SteamImportPage"),
  "/steam/library": () => import("../pages/SteamLibraryPage"),
  "/timeline": () => import("../pages/TimelinePage"),
  "/lists": () => import("../pages/Lists/ListsPage"),
  "/lists/:id": () => import("../pages/Lists/CustomListPage"),
  "*": () => import("../pages/NotFoundPage"),
};

const preloadPromises = new Map();

export function loadRoute(path) {
  const loader = routeLoaders[path] || routeLoaders["*"];
  return loader();
}

export function preloadRoute(path) {
  const loader = routeLoaders[path];
  if (!loader) return Promise.resolve();
  if (!preloadPromises.has(path)) {
    preloadPromises.set(
      path,
      loader().catch((error) => {
        preloadPromises.delete(path);
        throw error;
      }),
    );
  }
  return preloadPromises.get(path);
}
