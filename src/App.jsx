import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { StatusGroupsProvider } from "./contexts/StatusGroupsContext";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { RouteLoading } from "./components/layout";
import AppShell from "./components/AppShell";
import { GamesProvider } from "./hooks/useGames";
import { loadRoute } from "./config/routeLoaders";

const BacklogPage = lazy(() => loadRoute("/"));
const DiscoverPage = lazy(() => loadRoute("/discover"));
const InsightsPage = lazy(() => loadRoute("/insights"));
const OwnerProfilePage = lazy(() => loadRoute("/me"));
const PublicProfile = lazy(() => loadRoute("/u/:username"));
const ReviewsPage = lazy(() => loadRoute("/reviews"));
const SettingsPage = lazy(() => loadRoute("/settings"));
const SteamImportPage = lazy(() => loadRoute("/steam/import"));
const SteamLibraryPage = lazy(() => loadRoute("/steam/library"));
const TimelinePage = lazy(() => loadRoute("/timeline"));
const ListsPage = lazy(() => loadRoute("/lists"));
const CustomListPage = lazy(() => loadRoute("/lists/:id"));
const NotFoundPage = lazy(() => loadRoute("*"));

const App = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <StatusGroupsProvider>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route
                  element={
                    <GamesProvider>
                      <AppShell />
                    </GamesProvider>
                  }
                >
                  <Route path="/" element={<BacklogPage />} />
                  <Route path="/me" element={<OwnerProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/lists" element={<ListsPage />} />
                  <Route path="/lists/:id" element={<CustomListPage />} />
                  <Route path="/discover" element={<DiscoverPage />} />
                  <Route path="/timeline" element={<TimelinePage />} />
                  <Route path="/reviews" element={<ReviewsPage />} />
                  <Route path="/steam/library" element={<SteamLibraryPage />} />
                  <Route path="/steam/import" element={<SteamImportPage />} />
                  <Route path="/insights" element={<InsightsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="/u/:username" element={<PublicProfile />} />
              </Routes>
            </Suspense>
          </StatusGroupsProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
