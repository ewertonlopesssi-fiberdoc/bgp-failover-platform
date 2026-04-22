import { trpc } from "@/lib/trpc";
import { Network, Server, Users, Activity, ArrowUpRight, ArrowDownRight, Wifi, WifiOff, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dot: string }> = {
    up: { label: "Online", color: "text-emerald-400", dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" },
    down: { label: "Offline", color: "text-red-400", dot: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]" },
    degraded: { label: "Degradado", color: "text-amber-400", dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" },
    unknown: { label: "Desconhecido", color: "text-muted-foreground", dot: "bg-muted-foreground" },
    running: { label: "Ativo", color: "text-emerald-400", dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse" },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-medium", s.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full inline-block", s.dot)} />
      {s.label}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
  if (severity === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
  if (severity === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  return <Activity className="w-3.5 h-3.5 text-blue-400" />;
}

export default function Dashboard() {
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(undefined, { refetchInterval: 15000 });

  if (isLoading) return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-card rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-card rounded-xl" />)}
      </div>
    </div>
  );

  const { service, operators, clients, recentEvents } = overview ?? {
    service: { status: "unknown", uptime: 0 },
    operators: { total: 0, up: 0, down: 0, list: [] },
    clients: { total: 0, active: 0 },
    recentEvents: [],
  };

  const uptimeHours = Math.floor((service?.uptime ?? 0) / 3600);
  const uptimeMins = Math.floor(((service?.uptime ?? 0) % 3600) / 60);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral do sistema de monitoramento BGP</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Service Status */}
        <div className="rounded-xl p-5 border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.55 0.20 255 / 0.12)" }}>
              <Server className="w-4 h-4" style={{ color: "oklch(0.72 0.16 255)" }} />
            </div>
            <StatusBadge status={service?.status ?? "unknown"} />
          </div>
          <div className="text-2xl font-semibold text-foreground">{service?.status === "running" ? "Ativo" : "Inativo"}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Uptime: {uptimeHours}h {uptimeMins}m
          </div>
        </div>

        {/* Operators */}
        <div className="rounded-xl p-5 border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.60 0.18 145 / 0.12)" }}>
              <Wifi className="w-4 h-4" style={{ color: "oklch(0.65 0.16 145)" }} />
            </div>
            <span className="text-xs text-muted-foreground">{operators?.total ?? 0} total</span>
          </div>
          <div className="text-2xl font-semibold text-foreground">{operators?.up ?? 0}/{operators?.total ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Operadoras online</div>
        </div>

        {/* Clients */}
        <div className="rounded-xl p-5 border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.75 0.18 75 / 0.12)" }}>
              <Network className="w-4 h-4" style={{ color: "oklch(0.75 0.16 75)" }} />
            </div>
            <span className="text-xs text-muted-foreground">{clients?.total ?? 0} total</span>
          </div>
          <div className="text-2xl font-semibold text-foreground">{clients?.active ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">Clientes com failover</div>
        </div>

        {/* Alerts */}
        <div className="rounded-xl p-5 border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-start justify-between mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.55 0.20 25 / 0.12)" }}>
              <AlertTriangle className="w-4 h-4" style={{ color: "oklch(0.65 0.18 25)" }} />
            </div>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> OK
            </span>
          </div>
          <div className="text-2xl font-semibold text-foreground">
            {(recentEvents as any[]).filter((e: any) => e.severity === "critical").length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Alertas críticos</div>
        </div>
      </div>

      {/* Operators Status + Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operators */}
        <div className="rounded-xl border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            <h2 className="text-sm font-semibold text-foreground">Status das Operadoras</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sessões BGP e conectividade</p>
          </div>
          <div className="p-5 space-y-3">
            {(operators?.list as any[])?.length === 0 ? (
              <div className="text-center py-8">
                <WifiOff className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma operadora configurada</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Configure as operadoras em Ne8000 NQA</p>
              </div>
            ) : (operators?.list as any[])?.map((op: any) => (
              <div key={op.id} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "oklch(0.11 0.01 260)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{op.name}</span>
                    <StatusBadge status={op.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground font-mono">{op.interface}</span>
                    <span className="text-xs text-muted-foreground">Peer: {op.peerIp}</span>
                  </div>
                </div>
                {op.status === "up"
                  ? <ArrowUpRight className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  : <ArrowDownRight className="w-4 h-4 text-red-400 flex-shrink-0" />
                }
              </div>
            ))}
          </div>
        </div>

        {/* Recent Events */}
        <div className="rounded-xl border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            <h2 className="text-sm font-semibold text-foreground">Eventos Recentes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Últimas atividades do sistema</p>
          </div>
          <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
            {(recentEvents as any[])?.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
              </div>
            ) : (recentEvents as any[])?.slice(0, 8).map((event: any) => (
              <div key={event.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="mt-0.5 flex-shrink-0"><SeverityIcon severity={event.severity} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                  {event.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{event.description}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
