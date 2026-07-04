import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { StatusGroupsProvider } from "./contexts/StatusGroupsContext";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import BacklogPage from "./pages/Backlog/BacklogPage";
import DiscoverPage from "./pages/DiscoverPage";
import InsightsTab from "./pages/Insights/InsightsPage";
import OwnerProfilePage from "./pages/OwnerProfilePage";
import PublicProfile from "./pages/PublicProfile";
import SettingsPage from "./pages/SettingsPage";
import SteamImportPage from "./pages/SteamImportPage";
import SteamLibraryPage from "./pages/SteamLibraryPage";
import TimelinePage from "./pages/TimelinePage";

const App = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <StatusGroupsProvider>
            <Routes>
              <Route path="/" element={<BacklogPage />} />
              <Route path="/me" element={<OwnerProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/steam/library" element={<SteamLibraryPage />} />
              <Route path="/steam/import" element={<SteamImportPage />} />
              <Route path="/insights" element={<InsightsTab />} />
              <Route path="/u/:username" element={<PublicProfile />} />
            </Routes>
          </StatusGroupsProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
