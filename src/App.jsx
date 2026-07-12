import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { StatusGroupsProvider } from "./contexts/StatusGroupsContext";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { AppPage, PageLoading } from "./components/layout";
import AppShell from "./components/AppShell";

const BacklogPage = lazy(() => import("./pages/Backlog/BacklogPage"));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const InsightsPage = lazy(() => import("./pages/Insights/InsightsPage"));
const OwnerProfilePage = lazy(() => import("./pages/OwnerProfilePage"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SteamImportPage = lazy(() => import("./pages/SteamImportPage"));
const SteamLibraryPage = lazy(() => import("./pages/SteamLibraryPage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const ListsPage = lazy(() => import("./pages/Lists/ListsPage"));
const CustomListPage = lazy(() => import("./pages/Lists/CustomListPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function RouteLoading() {
  return (
    <AppPage width="wide">
      <PageLoading rows={5} />
    </AppPage>
  );
}

const App = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <StatusGroupsProvider>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route element={<AppShell />}>
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
