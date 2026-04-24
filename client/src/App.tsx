import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useLocalAuth } from "./hooks/useLocalAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Ne8000Config from "./pages/Ne8000Config";
import TelegramConfig from "./pages/TelegramConfig";
import UsersManagement from "./pages/UsersManagement";
import ClientsManagement from "./pages/ClientsManagement";
import LatencyCharts from "./pages/LatencyCharts";
import ServiceControl from "./pages/ServiceControl";
import AuditLogs from "./pages/AuditLogs";
import DestinationsManagement from "./pages/DestinationsManagement";
import OperatorsManagement from "./pages/OperatorsManagement";
import LinuxMonitor from "./pages/LinuxMonitor";
import TrafficAnalysis from "./pages/TrafficAnalysis";
import DashboardLayout from "./components/DashboardLayout";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useLocalAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
  if (!user) return <Redirect to="/login" />;
  return <DashboardLayout><Component /></DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/ne8000" component={() => <ProtectedRoute component={Ne8000Config} />} />
      <Route path="/telegram" component={() => <ProtectedRoute component={TelegramConfig} />} />
      <Route path="/users" component={() => <ProtectedRoute component={UsersManagement} />} />
      <Route path="/clients" component={() => <ProtectedRoute component={ClientsManagement} />} />
      <Route path="/latency" component={() => <ProtectedRoute component={LatencyCharts} />} />
      <Route path="/service" component={() => <ProtectedRoute component={ServiceControl} />} />
      <Route path="/audit" component={() => <ProtectedRoute component={AuditLogs} />} />
      <Route path="/destinations" component={() => <ProtectedRoute component={DestinationsManagement} />} />
      <Route path="/operators" component={() => <ProtectedRoute component={OperatorsManagement} />} />
      <Route path="/linux-monitor" component={() => <ProtectedRoute component={LinuxMonitor} />} />
      <Route path="/traffic" component={() => <ProtectedRoute component={TrafficAnalysis} />} />
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster theme="dark" position="top-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
