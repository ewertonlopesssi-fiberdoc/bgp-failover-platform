import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { toast } from "sonner";
import {
  LayoutDashboard, Server, MessageSquare, Users, Network,
  Activity, FileText, LogOut, Menu, ChevronRight, Radio, Map, Monitor, BarChart2, SlidersHorizontal, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/service", label: "Controle do Serviço", icon: Server },
  { href: "/latency", label: "Gráficos de Latência", icon: Activity },
  { href: "/linux-monitor", label: "Monitor Linux", icon: Monitor },
  { href: "/traffic", label: "Análise de Tráfego", icon: BarChart2 },
  { href: "/interface-config", label: "Config. Interfaces", icon: SlidersHorizontal },
  { href: "/network-map", label: "Mapa de Rede", icon: MapPin },
  { href: "/clients", label: "Clientes Dedicados", icon: Network },
  { href: "/destinations", label: "Destinos Monitorados", icon: Map },
  { href: "/ne8000", label: "Configurar Ne8000", icon: Radio },
  { href: "/telegram", label: "Notificações Telegram", icon: MessageSquare },
  { href: "/users", label: "Usuários", icon: Users },
  { href: "/audit", label: "Log de Auditoria", icon: FileText },
];

function SidebarInner({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();

  const logoutMutation = trpc.localAuth.logout.useMutation({
    onSuccess: () => {
      utils.localAuth.me.invalidate();
      window.location.href = "/login";
    },
    onError: () => toast.error("Erro ao sair"),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "oklch(0.18 0.015 260)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "oklch(0.55 0.20 255 / 0.15)", border: "1px solid oklch(0.55 0.20 255 / 0.25)" }}>
            <Network className="w-4 h-4" style={{ color: "oklch(0.72 0.16 255)" }} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight">BGP Failover</div>
            <div className="text-[11px] text-muted-foreground leading-tight">Platform v2.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-3"
          style={{ color: "oklch(0.45 0.01 260)" }}>Menu</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group cursor-pointer",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}>
                <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 opacity-50" />}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t" style={{ borderColor: "oklch(0.18 0.015 260)" }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1.5"
          style={{ background: "oklch(0.13 0.012 260)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold"
            style={{ background: "oklch(0.55 0.20 255 / 0.2)", color: "oklch(0.72 0.16 255)" }}>
            {user?.username?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground truncate">{user?.name || user?.username}</div>
            <div className="text-[10px] text-muted-foreground capitalize">{user?.role === "admin" ? "Administrador" : "Visualizador"}</div>
          </div>
        </div>
        <button onClick={() => logoutMutation.mutate()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all w-full cursor-pointer">
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 flex-col flex-shrink-0 border-r"
        style={{ background: "oklch(0.08 0.01 260)", borderColor: "oklch(0.18 0.015 260)" }}>
        <SidebarInner />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 flex flex-col border-r z-50"
            style={{ background: "oklch(0.08 0.01 260)", borderColor: "oklch(0.18 0.015 260)" }}>
            <SidebarInner onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: "oklch(0.11 0.01 260)", borderColor: "oklch(0.18 0.015 260)" }}>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4" style={{ color: "oklch(0.72 0.16 255)" }} />
            <span className="text-sm font-semibold">BGP Failover</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
