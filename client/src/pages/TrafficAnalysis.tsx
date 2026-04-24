import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  X, Clock, Wifi, WifiOff, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Period = "1h" | "6h" | "24h" | "7d" | "30d";
type ViewMode = "normal" | "compact";

interface Port {
  port_id: number | string;
  ifName: string;
  ifAlias: string;
  ifSpeed: number;
  ifInOctets_rate: number;
  ifOutOctets_rate: number;
  ifOperStatus: string;
  ifAdminStatus: string;
}

interface InterfaceConfig {
  portId: number;
  ifName: string;
  label: string;
  color: string;
  city?: string;
}

// ─── Configuração das interfaces ──────────────────────────────────────────────
const UPSTREAM_INTERFACES: InterfaceConfig[] = [
  { portId: 6,   ifName: "100GE0/5/2",      label: "ALOO TELECOM",     color: "#3b82f6" },
  { portId: 77,  ifName: "Eth-Trunk11000",   label: "BR DIGITAL (GUS)", color: "#8b5cf6" },
  { portId: 100, ifName: "Eth-Trunk3.3510",  label: "AGL LINK",         color: "#06b6d4" },
  { portId: 115, ifName: "Eth-Trunk3.3512",  label: "AGL REDUNDÂNCIA",  color: "#0891b2" },
  { portId: 126, ifName: "Eth-Trunk3.2029",  label: "CDN GLOBO",        color: "#f59e0b" },
  { portId: 99,  ifName: "Eth-Trunk3.2500",  label: "GOOGLE",           color: "#10b981" },
  { portId: 122, ifName: "Eth-Trunk3.2750",  label: "META",             color: "#6366f1" },
];

const DEDICATED_INTERFACES: InterfaceConfig[] = [
  { portId: 130, ifName: "Eth-Trunk10.2263", label: "SPEEDNET-PEDRA",         color: "#14b8a6" },
  { portId: 90,  ifName: "Eth-Trunk3.2264",  label: "TOP-TELECOM-TACAIMBO",   color: "#84cc16" },
  { portId: 106, ifName: "Eth-Trunk3.2265",  label: "CENTRAL-NET-ARCOVERDE",  color: "#a3e635" },
  { portId: 102, ifName: "Eth-Trunk3.2267",  label: "RB-NET",                 color: "#fbbf24" },
  { portId: 103, ifName: "Eth-Trunk3.2268",  label: "RB-NET 2",               color: "#fb923c" },
  { portId: 104, ifName: "Eth-Trunk3.2269",  label: "CONECTA-TELECOM-IPv4",   color: "#f472b6" },
  { portId: 105, ifName: "Eth-Trunk3.2270",  label: "CONECTA-TELECOM-IPv6",   color: "#c084fc" },
  { portId: 107, ifName: "Eth-Trunk3.2271",  label: "VCOMNET-BELO-JARDIM",    color: "#67e8f9" },
  { portId: 108, ifName: "Eth-Trunk3.2272",  label: "HNET-META",              color: "#86efac" },
  { portId: 112, ifName: "Eth-Trunk3.2273",  label: "HNET-META-BELO-JARDIM",  color: "#fde68a" },
  { portId: 118, ifName: "Eth-Trunk3.2276",  label: "VIPNET-ARCOVERDE",       color: "#a5b4fc" },
];

// ─── Utilitários ──────────────────────────────────────────────────────────────
function formatBps(bps: number): string {
  if (!bps || bps <= 0) return "0 bps";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function calcUtilization(rateOctets: number, speedBps: number): number {
  if (!speedBps || speedBps <= 0) return 0;
  return Math.min(100, (rateOctets * 8 / speedBps) * 100);
}

function utilizationColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  if (pct >= 40) return "bg-blue-500";
  return "bg-emerald-500";
}

function utilizationTextColor(pct: number): string {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-yellow-400";
  if (pct >= 40) return "text-blue-400";
  return "text-emerald-400";
}

function formatTime(ts: number, period: Period): string {
  const d = new Date(ts * 1000);
  if (period === "7d" || period === "30d") {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Modal de gráfico expandido ───────────────────────────────────────────────
function PortDetailModal({
  portId, label, color, period, onClose,
}: {
  portId: number; label: string; color: string; period: Period; onClose: () => void;
}) {
  const { data, isLoading } = trpc.traffic.getHistory.useQuery(
    { portId, period },
    { refetchInterval: 60000 }
  );

  const chartData = (data?.history || []).map((p: { ts: number; inBps: number; outBps: number }) => ({
    time: formatTime(p.ts, period),
    "IN (bps)": Math.round(p.inBps),
    "OUT (bps)": Math.round(p.outBps),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <div>
              <h3 className="text-white font-semibold text-lg">{label}</h3>
              {data?.port && (
                <p className="text-gray-400 text-sm">
                  IN: <span className="text-emerald-400 font-mono">{formatBps((data.port.ifInOctets_rate || 0) * 8)}</span>
                  {" · "}
                  OUT: <span className="text-blue-400 font-mono">{formatBps((data.port.ifOutOctets_rate || 0) * 8)}</span>
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Carregando dados...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-2">
              <Clock className="w-8 h-8" />
              <p className="text-sm">Dados históricos ainda sendo coletados.</p>
              <p className="text-xs text-gray-600">Polling a cada 1 minuto — aguarde alguns ciclos.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => formatBps(v)} tick={{ fill: "#9ca3af", fontSize: 10 }} width={85} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                  labelStyle={{ color: "#f9fafb" }}
                  formatter={(value: number, name: string) => [formatBps(value), name]}
                />
                <Legend wrapperStyle={{ color: "#9ca3af" }} />
                <Area type="monotone" dataKey="IN (bps)" stroke="#10b981" fill="url(#inGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="OUT (bps)" stroke="#3b82f6" fill="url(#outGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card NORMAL ──────────────────────────────────────────────────────────────
function PortCardNormal({ config, port, onClick }: { config: InterfaceConfig; port?: Port; onClick: () => void }) {
  const isUp = port?.ifOperStatus === "up";
  const inBps = port ? (port.ifInOctets_rate || 0) * 8 : 0;
  const outBps = port ? (port.ifOutOctets_rate || 0) * 8 : 0;
  const speed = port?.ifSpeed || 0;
  const inPct = calcUtilization(port?.ifInOctets_rate || 0, speed);
  const outPct = calcUtilization(port?.ifOutOctets_rate || 0, speed);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-800/60 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 rounded-lg p-3 transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{config.label}</p>
            <p className="text-gray-500 text-xs truncate">{config.ifName}</p>
          </div>
        </div>
        <div className="flex-shrink-0 ml-2">
          {!port ? (
            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-xs px-1.5 py-0">—</Badge>
          ) : isUp ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-1.5 py-0 flex items-center gap-1">
              <Wifi className="w-2.5 h-2.5" /> UP
            </Badge>
          ) : (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs px-1.5 py-0 flex items-center gap-1">
              <WifiOff className="w-2.5 h-2.5" /> DOWN
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-gray-900/50 rounded p-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-emerald-400" />
            <span className="text-gray-400 text-xs">IN</span>
          </div>
          <p className="text-emerald-400 font-mono text-xs font-semibold">{formatBps(inBps)}</p>
        </div>
        <div className="bg-gray-900/50 rounded p-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-blue-400" />
            <span className="text-gray-400 text-xs">OUT</span>
          </div>
          <p className="text-blue-400 font-mono text-xs font-semibold">{formatBps(outBps)}</p>
        </div>
      </div>

      {speed > 0 && (
        <div className="space-y-1">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-0.5">
              <span>IN</span><span>{inPct.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${utilizationColor(inPct)}`} style={{ width: `${inPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-0.5">
              <span>OUT</span><span>{outPct.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${utilizationColor(outPct)}`} style={{ width: `${outPct}%` }} />
            </div>
          </div>
          <p className="text-gray-600 text-xs text-right">Link: {formatBps(speed)}</p>
        </div>
      )}
    </button>
  );
}

// ─── Card COMPACTO ────────────────────────────────────────────────────────────
function PortCardCompact({ config, port, onClick }: { config: InterfaceConfig; port?: Port; onClick: () => void }) {
  const isUp = port?.ifOperStatus === "up";
  const inBps = port ? (port.ifInOctets_rate || 0) * 8 : 0;
  const outBps = port ? (port.ifOutOctets_rate || 0) * 8 : 0;
  const speed = port?.ifSpeed || 0;
  const maxPct = Math.max(
    calcUtilization(port?.ifInOctets_rate || 0, speed),
    calcUtilization(port?.ifOutOctets_rate || 0, speed)
  );

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-800/60 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 rounded-lg px-3 py-2 transition-all duration-200 flex items-center gap-2"
    >
      {/* Indicador de cor + status */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${isUp ? "animate-pulse" : "opacity-30"}`}
          style={{ backgroundColor: isUp ? config.color : "#6b7280" }}
        />
      </div>

      {/* Nome */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold truncate leading-tight">{config.label}</p>
        <p className="text-gray-600 text-[10px] truncate">{config.ifName}</p>
      </div>

      {/* Valores IN/OUT compactos */}
      <div className="flex-shrink-0 flex items-center gap-2 text-[11px] font-mono">
        <span className="text-emerald-400">↓{formatBps(inBps)}</span>
        <span className="text-blue-400">↑{formatBps(outBps)}</span>
      </div>

      {/* Barra de utilização máxima */}
      {speed > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1">
          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${utilizationColor(maxPct)}`}
              style={{ width: `${maxPct}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono w-8 text-right ${utilizationTextColor(maxPct)}`}>
            {maxPct.toFixed(0)}%
          </span>
        </div>
      )}

      {/* Badge status */}
      <div className="flex-shrink-0">
        {!port ? (
          <span className="text-gray-600 text-[10px]">—</span>
        ) : isUp ? (
          <span className="text-emerald-500 text-[10px] font-semibold">UP</span>
        ) : (
          <span className="text-red-500 text-[10px] font-semibold">DOWN</span>
        )}
      </div>
    </button>
  );
}

// ─── Grupo de cidade (dedicados) ─────────────────────────────────────────────
function DedicatedCityGroup({
  city, interfaces, portMap, viewMode, onSelect,
}: {
  city: string;
  interfaces: InterfaceConfig[];
  portMap: Map<number, Port>;
  viewMode: ViewMode;
  onSelect: (cfg: InterfaceConfig) => void;
}) {
  const [open, setOpen] = useState(true);
  const totalIn = interfaces.reduce((s, cfg) => {
    const p = portMap.get(cfg.portId);
    return s + (p ? (p.ifInOctets_rate || 0) * 8 : 0);
  }, 0);
  const totalOut = interfaces.reduce((s, cfg) => {
    const p = portMap.get(cfg.portId);
    return s + (p ? (p.ifOutOctets_rate || 0) * 8 : 0);
  }, 0);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 bg-gray-800/60 hover:bg-gray-800 rounded-t border border-gray-700 transition-colors text-left"
      >
        <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
        <span className="text-xs font-semibold text-emerald-400">📍 {city}</span>
        <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{interfaces.length}</span>
        <span className="ml-auto text-[10px] font-mono text-gray-500">
          ↓{formatBps(totalIn)} ↑{formatBps(totalOut)}
        </span>
      </button>
      {open && (
        <div className={`border border-t-0 border-gray-700 rounded-b p-2 ${
          viewMode === "compact" ? "flex flex-col gap-1" : "grid grid-cols-1 gap-2"
        }`}>
          {interfaces.map((cfg) =>
            viewMode === "compact" ? (
              <PortCardCompact
                key={cfg.portId}
                config={cfg}
                port={portMap.get(cfg.portId)}
                onClick={() => onSelect(cfg)}
              />
            ) : (
              <PortCardNormal
                key={cfg.portId}
                config={cfg}
                port={portMap.get(cfg.portId)}
                onClick={() => onSelect(cfg)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Seção de interfaces ──────────────────────────────────────────────────────
function InterfaceSection({
  title, subtitle, badgeColor, badgeTextColor, interfaces, portMap, viewMode, onSelect,
}: {
  title: string;
  subtitle: string;
  badgeColor: string;
  badgeTextColor: string;
  interfaces: InterfaceConfig[];
  portMap: Map<number, Port>;
  viewMode: ViewMode;
  onSelect: (cfg: InterfaceConfig) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden border-r border-gray-800 last:border-r-0">
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-2.5 z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${badgeColor}`} />
          <h2 className="text-white font-semibold text-sm">{title}</h2>
          <span className={`text-xs px-1.5 py-0 rounded font-medium ${badgeTextColor}`}>
            {interfaces.length}
          </span>
        </div>
        <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>
      </div>
      <div className={`overflow-y-auto flex-1 p-3 ${
        viewMode === "compact"
          ? "flex flex-col gap-1"
          : "grid grid-cols-1 gap-2"
      }`}>
        {interfaces.map((cfg) =>
          viewMode === "compact" ? (
            <PortCardCompact
              key={cfg.portId}
              config={cfg}
              port={portMap.get(cfg.portId)}
              onClick={() => onSelect(cfg)}
            />
          ) : (
            <PortCardNormal
              key={cfg.portId}
              config={cfg}
              port={portMap.get(cfg.portId)}
              onClick={() => onSelect(cfg)}
            />
          )
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function TrafficAnalysis() {
  const [period, setPeriod] = useState<Period>("1h");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("traffic-view-mode") as ViewMode) || "normal";
    } catch {
      return "normal";
    }
  });
  const [selectedPort, setSelectedPort] = useState<{ portId: number; label: string; color: string } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data: ports, isLoading, refetch } = trpc.traffic.getPorts.useQuery(undefined, {
    refetchInterval: 60000,
  });

  // Carregar configurações do banco para usar labels e planos contratados
  const { data: ifConfigs } = trpc.traffic.getInterfaceConfigs.useQuery();
  const ifConfigMap = new Map((ifConfigs || []).map((c) => [c.portId, c]));

  const handleRefresh = useCallback(() => {
    refetch();
    setLastUpdate(new Date());
  }, [refetch]);

  const toggleViewMode = () => {
    const next: ViewMode = viewMode === "normal" ? "compact" : "normal";
    setViewMode(next);
    try { localStorage.setItem("traffic-view-mode", next); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (ports) setLastUpdate(new Date());
  }, [ports]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  const portMap = new Map<number, Port>(
    (ports || []).map((p: Port) => [Number(p.port_id), p])
  );

  // Mesclar labels e cidade do banco com as configurações hardcoded
  const upstreamInterfaces: InterfaceConfig[] = UPSTREAM_INTERFACES.map((cfg) => {
    const dbCfg = ifConfigMap.get(cfg.portId);
    return dbCfg ? { ...cfg, label: dbCfg.label, city: dbCfg.city ?? undefined } : cfg;
  });
  const dedicatedInterfaces: InterfaceConfig[] = DEDICATED_INTERFACES.map((cfg) => {
    const dbCfg = ifConfigMap.get(cfg.portId);
    return dbCfg ? { ...cfg, label: dbCfg.label, city: dbCfg.city ?? undefined } : cfg;
  });

  // Agrupar dedicados por cidade
  const dedicatedByCityMap: Record<string, InterfaceConfig[]> = {};
  const dedicatedNoCity: InterfaceConfig[] = [];
  for (const cfg of dedicatedInterfaces) {
    const c = cfg.city?.trim();
    if (c) {
      if (!dedicatedByCityMap[c]) dedicatedByCityMap[c] = [];
      dedicatedByCityMap[c].push(cfg);
    } else {
      dedicatedNoCity.push(cfg);
    }
  }
  const dedicatedCities = Object.keys(dedicatedByCityMap).sort();

  const upstreamInTotal = upstreamInterfaces.reduce((acc, cfg) => {
    const p = portMap.get(cfg.portId);
    return acc + (p ? (p.ifInOctets_rate || 0) * 8 : 0);
  }, 0);
  const upstreamOutTotal = upstreamInterfaces.reduce((acc, cfg) => {
    const p = portMap.get(cfg.portId);
    return acc + (p ? (p.ifOutOctets_rate || 0) * 8 : 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <div>
              <h1 className="text-base font-bold text-white">Análise de Tráfego</h1>
              <p className="text-gray-400 text-xs">Ne8000 · 45.237.164.7 · polling 1 min</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle de visualização */}
            <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => { setViewMode("normal"); try { localStorage.setItem("traffic-view-mode", "normal"); } catch { /* ignore */ } }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === "normal" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                }`}
                title="Modo normal"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Normal</span>
              </button>
              <button
                onClick={() => { setViewMode("compact"); try { localStorage.setItem("traffic-view-mode", "compact"); } catch { /* ignore */ } }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === "compact" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
                }`}
                title="Modo compacto"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compacto</span>
              </button>
            </div>

            {/* Período */}
            <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
              {(["1h", "6h", "24h", "7d", "30d"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    period === p ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="border-gray-700 text-gray-300 hover:text-white bg-transparent text-xs h-7"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              {secondsAgo < 5 ? "Atualizado" : `há ${secondsAgo}s`}
            </Button>

            <a href="http://45.237.165.251:8080" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white bg-transparent text-xs h-7">
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                LibreNMS
              </Button>
            </a>
          </div>
        </div>

        {/* Totais upstream */}
        <div className="mt-2 flex items-center gap-4 flex-wrap text-xs">
          <span className="text-gray-500">Upstream total:</span>
          <span className="text-emerald-400 font-mono font-semibold">↓ IN {formatBps(upstreamInTotal)}</span>
          <span className="text-blue-400 font-mono font-semibold">↑ OUT {formatBps(upstreamOutTotal)}</span>
          <span className="text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Clique em qualquer card para ver o gráfico histórico
          </span>
        </div>
      </div>

      {/* Conteúdo — duas colunas */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        <InterfaceSection
          title="Upstream"
          subtitle="Provedores e peerings de trânsito"
          badgeColor="bg-blue-500"
          badgeTextColor="text-blue-400 bg-blue-500/20"
          interfaces={upstreamInterfaces}
          portMap={portMap}
          viewMode={viewMode}
          onSelect={(cfg) => setSelectedPort({ portId: cfg.portId, label: cfg.label, color: cfg.color })}
        />
        {/* Coluna dedicados — agrupada por cidade */}
        <div className="flex flex-col overflow-hidden">
          <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-2.5 z-10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse bg-orange-500" />
              <h2 className="text-white font-semibold text-sm">Clientes Dedicados</h2>
              <span className="text-xs px-1.5 py-0 rounded font-medium text-orange-400 bg-orange-500/20">
                {dedicatedInterfaces.length}
              </span>
              <span className="text-gray-600 text-xs">· {dedicatedCities.length} cidades</span>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">Interfaces de clientes com acesso dedicado</p>
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-3">
            {dedicatedCities.map((city) => (
              <DedicatedCityGroup
                key={city}
                city={city}
                interfaces={dedicatedByCityMap[city]}
                portMap={portMap}
                viewMode={viewMode}
                onSelect={(cfg) => setSelectedPort({ portId: cfg.portId, label: cfg.label, color: cfg.color })}
              />
            ))}
            {dedicatedNoCity.length > 0 && (
              <DedicatedCityGroup
                city="Sem cidade"
                interfaces={dedicatedNoCity}
                portMap={portMap}
                viewMode={viewMode}
                onSelect={(cfg) => setSelectedPort({ portId: cfg.portId, label: cfg.label, color: cfg.color })}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedPort && (
        <PortDetailModal
          portId={selectedPort.portId}
          label={selectedPort.label}
          color={selectedPort.color}
          period={period}
          onClose={() => setSelectedPort(null)}
        />
      )}
    </div>
  );
}
