import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";
import { SiteHeader } from "./components/SiteHeader";
import { Overview } from "./pages/Overview";
import { Repos } from "./pages/Repos";
import { Requests } from "./pages/Requests";
import { Data } from "./pages/Data";
import { Jobs } from "./pages/Jobs";
import { Context } from "./pages/Context";

export function App() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/repos" element={<Repos />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/data" element={<Data />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/context" element={<Context />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
