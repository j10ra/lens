import { Navigate, Route, Routes } from "react-router-dom";
import { AppSidebar } from "./components/AppSidebar";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { Context } from "./pages/Context";
import { Data } from "./pages/Data";
import { Jobs } from "./pages/Jobs";
import { Overview } from "./pages/Overview";
import { Repos } from "./pages/Repos";
import { Requests } from "./pages/Requests";

export function App() {
  return (
    <SidebarProvider className="bg-muted h-svh">
      <AppSidebar />
      <SidebarInset className="bg-background rounded-xl overflow-hidden md:my-2 md:mr-2 md:border">
        <div className="@container/main flex min-h-0 flex-1 flex-col">
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
