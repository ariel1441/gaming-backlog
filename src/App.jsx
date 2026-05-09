import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { StatusGroupsProvider } from "./contexts/StatusGroupsContext";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import BacklogPage from "./pages/Backlog/BacklogPage";
import InsightsTab from "./pages/Insights/InsightsPage";
import PublicProfile from "./pages/PublicProfile";

const App = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <StatusGroupsProvider>
            <Routes>
              <Route path="/" element={<BacklogPage />} />
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
