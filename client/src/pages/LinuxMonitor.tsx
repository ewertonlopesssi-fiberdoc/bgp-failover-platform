import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Activity,
  Server,
  Bell,
  BellOff,
  History,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ──────────────────────────────────────────────────────────────────

type OfflineAlert = "never" | "1" | "2" | "3" | "5";

interface DestinationForm {
  probeId: number;
  name: string;
  host: string;
  packetSize: number;
  packetCount: number;
  frequency: number;
  offlineAlert: OfflineAlert;
  latencyThreshold: number;
  lossThreshold: number;
  alertRepeatMinutes: number;
}

interface HistoryTarget {
  destinationId: number;
  probeId: number;
  name: string;
  host: string;
  latencyThreshold: number;
  lossThreshold: number;
}

const OFFLINE_ALERT_OPTIONS: { value: OfflineAlert; label: string }[] = [
  { value: "never", label: "nunca (sem alertas)" },
  { value: "1", label: "imediatamente após falhar!" },
  { value: "2", label: "se falhar duas vezes seguida" },
  { value: "3", label: "se falhar três vezes seguidas" },
  { value: "5", label: "se falhar cinco vezes seguidas" },
];

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

// ── History Sheet ──────────────────────────────────────────────────────────

function HistorySheet({
  target,
  onClose,
  onEdit,
  isAdmin,
}: {
  target: HistoryTarget | null;
  onClose: () => void;
  onEdit: () => void;
  isAdmin: boolean;
}) {
  const [hours, setHours] = useState(6);

  const { data: metrics, isLoading, refetch } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId: target?.destinationId ?? 0, probeId: target?.probeId ?? 0, hours },
    { enabled: !!target, refetchInterval: 20000 }
  );

  const chartData = useMemo(() => {
    if (!metrics) return [];
    return [...metrics].reverse().map((m) => ({
      time: new Date(m.measuredAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      fullTime: new Date(m.measuredAt).toLocaleString("pt-BR"),
      latencia: parseFloat(m.latencyMs.toFixed(2)),
      perda: parseFloat(m.packetLoss.toFixed(1)),
    }));
  }, [metrics]);

  // Find first packet loss event
  const firstLossEvent = useMemo(() => {
    if (!chartData.length) return null;
    const idx = chartData.findIndex((d) => d.perda > 0);
    return idx >= 0 ? chartData[idx] : null;
  }, [chartData]);

  // Summary stats
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const latencies = chartData.map((d) => d.latencia).filter((v) => v > 0);
    const losses = chartData.map((d) => d.perda);
    const avgLat = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const maxLat = latencies.length ? Math.max(...latencies) : 0;
    const minLat = latencies.length ? Math.min(...latencies) : 0;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    const maxLoss = Math.max(...losses);
    const offlinePoints = losses.filter((l) => l >= 100).length;
    return { avgLat, maxLat, minLat, avgLoss, maxLoss, offlinePoints, total: chartData.length };
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
        <p className="text-gray-300 mb-2 font-medium">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-gray-400">{p.name}:</span>
            <span className="font-mono font-bold" style={{ color: p.color }}>
              {p.value}{p.dataKey === "latencia" ? " ms" : "%"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Sheet open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-0 p-0"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-blue-400" />
                Histórico — {target?.name}
              </SheetTitle>
              <SheetDescription className="mt-1">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{target?.host}</code>
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 px-6 py-4 space-y-5">
          {/* Period selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Período:</span>
            {[1, 3, 6, 12, 24, 48].map((h) => (
              <Button
                key={h}
                variant={hours === h ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setHours(h)}
              >
                {h >= 24 ? `${h / 24}d` : `${h}h`}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs ml-auto"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Atualizar
            </Button>
          </div>

          {/* Summary stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Lat. média</p>
                <p className="text-lg font-bold font-mono text-blue-400">
                  {stats.avgLat.toFixed(1)}<span className="text-xs font-normal ml-0.5">ms</span>
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Lat. máx.</p>
                <p className="text-lg font-bold font-mono text-amber-400">
                  {stats.maxLat.toFixed(1)}<span className="text-xs font-normal ml-0.5">ms</span>
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Perda média</p>
                <p className={`text-lg font-bold font-mono ${stats.avgLoss > 0 ? "text-red-400" : "text-green-400"}`}>
                  {stats.avgLoss.toFixed(1)}<span className="text-xs font-normal ml-0.5">%</span>
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Pontos offline</p>
                <p className={`text-lg font-bold font-mono ${stats.offlinePoints > 0 ? "text-red-400" : "text-green-400"}`}>
                  {stats.offlinePoints}
                  <span className="text-xs font-normal ml-0.5">/{stats.total}</span>
                </p>
              </div>
            </div>
          )}

          {/* First loss event */}
          {firstLossEvent && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-amber-300">Primeira perda detectada:</span>
                <span className="text-amber-200 ml-1.5">{firstLossEvent.fullTime}</span>
                <span className="text-muted-foreground ml-2">
                  ({firstLossEvent.perda}% perda, {firstLossEvent.latencia}ms latência)
                </span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
              <p className="text-sm">Carregando histórico...</p>
            </div>
          ) : !chartData.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum dado no período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Combined chart: latency + loss */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Latência e Perda de Pacotes</p>
                  <span className="text-xs text-muted-foreground">{chartData.length} amostras</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "#9ca3af" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="lat"
                      orientation="left"
                      tick={{ fontSize: 9, fill: "#9ca3af" }}
                      label={{ value: "ms", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="loss"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 9, fill: "#9ca3af" }}
                      label={{ value: "%", angle: 90, position: "insideRight", fill: "#6b7280", fontSize: 10 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                      formatter={(v) => <span style={{ color: "#d1d5db" }}>{v}</span>}
                    />
                    {/* Threshold reference lines */}
                    {target && target.latencyThreshold > 0 && (
                      <ReferenceLine
                        yAxisId="lat"
                        y={target.latencyThreshold}
                        stroke="#f59e0b"
                        strokeDasharray="4 2"
                        label={{ value: `limiar ${target.latencyThreshold}ms`, fill: "#f59e0b", fontSize: 9 }}
                      />
                    )}
                    {target && target.lossThreshold > 0 && (
                      <ReferenceLine
                        yAxisId="loss"
                        y={target.lossThreshold}
                        stroke="#ef4444"
                        strokeDasharray="4 2"
                        label={{ value: `limiar ${target.lossThreshold}%`, fill: "#ef4444", fontSize: 9 }}
                      />
                    )}
                    <Line
                      yAxisId="lat"
                      type="monotone"
                      dataKey="latencia"
                      stroke="#3b82f6"
                      dot={false}
                      strokeWidth={2}
                      name="Latência (ms)"
                    />
                    <Bar
                      yAxisId="loss"
                      dataKey="perda"
                      fill="#ef444466"
                      stroke="#ef4444"
                      strokeWidth={0.5}
                      name="Perda (%)"
                      maxBarSize={8}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Latency only — detailed */}
              <div>
                <p className="text-sm font-medium mb-2">Latência detalhada (ms)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#9ca3af" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} />
                    <Tooltip content={<CustomTooltip />} />
                    {target && target.latencyThreshold > 0 && (
                      <ReferenceLine
                        y={target.latencyThreshold}
                        stroke="#f59e0b"
                        strokeDasharray="4 2"
                        label={{ value: `${target.latencyThreshold}ms`, fill: "#f59e0b", fontSize: 9 }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="latencia"
                      stroke="#60a5fa"
                      dot={false}
                      strokeWidth={1.5}
                      name="Latência (ms)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Loss only — detailed */}
              <div>
                <p className="text-sm font-medium mb-2">Perda de pacotes (%)</p>
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#9ca3af" }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                    <Tooltip content={<CustomTooltip />} />
                    {target && target.lossThreshold > 0 && (
                      <ReferenceLine
                        y={target.lossThreshold}
                        stroke="#ef4444"
                        strokeDasharray="4 2"
                        label={{ value: `${target.lossThreshold}%`, fill: "#ef4444", fontSize: 9 }}
                      />
                    )}
                    <Bar
                      dataKey="perda"
                      fill="#ef4444"
                      name="Perda (%)"
                      maxBarSize={10}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Status badge with context menu ────────────────────────────────────────

function DestStatusBadge({
  destinationId,
  probeId,
  dest,
  onOpenHistory,
  onOpenEdit,
  isAdmin,
}: {
  destinationId: number;
  probeId: number;
  dest: any;
  onOpenHistory: (target: HistoryTarget) => void;
  onOpenEdit: (dest: any) => void;
  isAdmin: boolean;
}) {
  const { data: metrics } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId, probeId, hours: 1 },
    { refetchInterval: 15000, staleTime: 10000 }
  );

  const status = useMemo(() => {
    if (!metrics || metrics.length === 0) return null;
    const latest = metrics[0];
    return { latency: latest.latencyMs, loss: latest.packetLoss };
  }, [metrics]);

  const isOffline = status ? status.loss >= 100 : false;
  const isDegraded = status ? (!isOffline && (status.loss > 10 || status.latency > 200)) : false;

  const dotColor = !status
    ? "bg-muted-foreground/40"
    : isOffline
    ? "bg-red-500 animate-pulse"
    : isDegraded
    ? "bg-yellow-400"
    : "bg-green-500";

  const textColor = !status
    ? "text-muted-foreground"
    : isOffline
    ? "text-red-400"
    : isDegraded
    ? "text-yellow-400"
    : "text-green-400";

  const label = !status
    ? "sem dados"
    : isOffline
    ? "offline"
    : `${status.latency.toFixed(1)} ms / ${status.loss.toFixed(0)}%`;

  const handleDoubleClick = useCallback(() => {
    onOpenHistory({
      destinationId,
      probeId,
      name: dest.name,
      host: dest.host,
      latencyThreshold: dest.latencyThreshold ?? 0,
      lossThreshold: dest.lossThreshold ?? 0,
    });
  }, [destinationId, probeId, dest, onOpenHistory]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-mono font-medium ${textColor} bg-black/20 rounded px-1.5 py-0.5 border border-current/20 cursor-pointer select-none hover:bg-black/40 transition-colors`}
          onDoubleClick={handleDoubleClick}
          title="Clique direito ou duplo clique para opções"
        >
          <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${dotColor}`} />
          {label}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() =>
            onOpenHistory({
              destinationId,
              probeId,
              name: dest.name,
              host: dest.host,
              latencyThreshold: dest.latencyThreshold ?? 0,
              lossThreshold: dest.lossThreshold ?? 0,
            })
          }
        >
          <History className="h-4 w-4 mr-2 text-blue-400" />
          Ver histórico
        </ContextMenuItem>
        {isAdmin && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onOpenEdit(dest)}>
              <Pencil className="h-4 w-4 mr-2 text-muted-foreground" />
              Editar destino
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/// ── Destination grid card ────────────────────────────────────────────────
function DestGridCard({
  dest,
  probeId,
  onOpenHistory,
  onOpenEdit,
  onDeleteDest,
  isAdmin,
}: {
  dest: any;
  probeId: number;
  onOpenHistory: (target: HistoryTarget) => void;
  onOpenEdit: (dest: any) => void;
  onDeleteDest?: (id: number) => void;
  isAdmin: boolean;
}) {
  const { data: metrics } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId: dest.id, probeId, hours: 1 },
    { refetchInterval: 15000, staleTime: 10000 }
  );
  const status = useMemo(() => {
    if (!metrics || metrics.length === 0) return null;
    const latest = metrics[0];
    return { latency: latest.latencyMs, loss: latest.packetLoss };
  }, [metrics]);
  const isOffline = status ? status.loss >= 100 : false;
  const isDegraded = status
    ? !isOffline && (
        (dest.lossThreshold > 0 ? status.loss > dest.lossThreshold : status.loss > 10) ||
        (dest.latencyThreshold > 0 ? status.latency > dest.latencyThreshold : status.latency > 200)
      )
    : false;

  // Colors: offline=red, degraded=yellow, ok=green, no data=gray
  const bgColor = !status
    ? "bg-zinc-700/60 border-zinc-600"
    : isOffline
    ? "bg-red-900/70 border-red-700"
    : isDegraded
    ? "bg-yellow-900/70 border-yellow-600"
    : "bg-green-900/70 border-green-700";
  const metricColor = !status
    ? "text-zinc-300"
    : isOffline
    ? "text-red-300"
    : isDegraded
    ? "text-yellow-300"
    : "text-green-300";
  const nameColor = !status
    ? "text-zinc-400"
    : isOffline
    ? "text-red-400/80"
    : isDegraded
    ? "text-yellow-400/80"
    : "text-green-400/80";
  const label = !status
    ? "sem dados"
    : isOffline
    ? "offline"
    : `${status.latency.toFixed(1)} ms / ${status.loss.toFixed(0)}%`;

  const handleDoubleClick = useCallback(() => {
    onOpenHistory({
      destinationId: dest.id,
      probeId,
      name: dest.name,
      host: dest.host,
      latencyThreshold: dest.latencyThreshold ?? 0,
      lossThreshold: dest.lossThreshold ?? 0,
    });
  }, [dest, probeId, onOpenHistory]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`relative flex flex-col justify-between rounded border px-3 py-2 cursor-pointer select-none transition-all hover:brightness-110 active:scale-95 ${bgColor}`}
          style={{ minWidth: 110, maxWidth: 160 }}
          onDoubleClick={handleDoubleClick}
          title="Clique direito ou duplo clique para opções"
        >
          {/* Pulse dot for offline */}
          {isOffline && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}
          <span className={`text-sm font-bold font-mono leading-tight ${metricColor}`}>
            {label}
          </span>
          <span className={`text-xs mt-1 truncate ${nameColor}`} title={dest.name}>
            {dest.name}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem
          onClick={() =>
            onOpenHistory({
              destinationId: dest.id,
              probeId,
              name: dest.name,
              host: dest.host,
              latencyThreshold: dest.latencyThreshold ?? 0,
              lossThreshold: dest.lossThreshold ?? 0,
            })
          }
        >
          <History className="h-4 w-4 mr-2 text-blue-400" />
          Ver histórico
        </ContextMenuItem>
        {isAdmin && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onOpenEdit(dest)}>
              <Pencil className="h-4 w-4 mr-2 text-muted-foreground" />
              Editar destino
            </ContextMenuItem>
            {onDeleteDest && (
              <ContextMenuItem
                onClick={() => onDeleteDest(dest.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover destino
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ── Destination metrics chart (inline row) ─────────────────────────────────
function DestMetricsChart({
  destinationId,
  probeId,
  destName,
  isAdmin,
  onClear,
}: {
  destinationId: number;
  probeId: number;
  destName: string;
  isAdmin: boolean;
  onClear: () => void;
}) {
  const [hours, setHours] = useState(6);
  const { data: metrics, isLoading } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId, probeId, hours },
    { refetchInterval: 30000 }
  );

  const chartData = useMemo(() => {
    if (!metrics) return [];
    return [...metrics].reverse().map((m) => ({
      time: new Date(m.measuredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      latencia: m.latencyMs,
      perda: m.packetLoss,
    }));
  }, [metrics]);

  if (isLoading) return <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>;
  if (!chartData.length) return (
    <div className="text-sm text-muted-foreground py-4 text-center">
      Nenhuma métrica disponível. O monitor coletará dados em breve.
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Período:</span>
        {[1, 3, 6, 12, 24].map((h) => (
          <Button key={h} variant={hours === h ? "default" : "outline"} size="sm" className="h-6 px-2 text-xs" onClick={() => setHours(h)}>
            {h}h
          </Button>
        ))}
        {isAdmin && (
          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground ml-auto" onClick={onClear}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Zerar métricas
          </Button>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Latência (ms)</p>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }} labelStyle={{ color: "#f9fafb" }} />
            <Line type="monotone" dataKey="latencia" stroke="#3b82f6" dot={false} strokeWidth={2} name="Latência (ms)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Perda de Pacotes (%)</p>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#9ca3af" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }} labelStyle={{ color: "#f9fafb" }} />
            <Bar dataKey="perda" fill="#ef4444" name="Perda (%)" maxBarSize={8} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Destination form fields ────────────────────────────────────────────────

function DestinationFormFields({ form, setForm }: { form: DestinationForm; setForm: (f: DestinationForm) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="dest-name">Nome do sensor</Label>
          <Input id="dest-name" placeholder="Ex: WhatsApp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="dest-host">IP / Domínio</Label>
          <Input id="dest-host" placeholder="Ex: www.whatsapp.com ou 8.8.8.8" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="dest-pktsize">Tam. pacote (bytes)</Label>
          <Input id="dest-pktsize" type="number" min={1} max={65507} value={form.packetSize} onChange={(e) => setForm({ ...form, packetSize: parseInt(e.target.value) || 32 })} />
        </div>
        <div>
          <Label htmlFor="dest-pktcount">Quantidade de pacotes</Label>
          <Input id="dest-pktcount" type="number" min={1} max={100} value={form.packetCount} onChange={(e) => setForm({ ...form, packetCount: parseInt(e.target.value) || 5 })} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="dest-freq">Executar</Label>
          <Select value={String(form.frequency)} onValueChange={(v) => setForm({ ...form, frequency: parseInt(v) })}>
            <SelectTrigger id="dest-freq"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">A cada 10 segundos</SelectItem>
              <SelectItem value="30">A cada 30 segundos</SelectItem>
              <SelectItem value="60">A cada 1 minuto</SelectItem>
              <SelectItem value="120">A cada 2 minutos</SelectItem>
              <SelectItem value="300">A cada 5 minutos</SelectItem>
              <SelectItem value="600">A cada 10 minutos</SelectItem>
              <SelectItem value="1800">A cada 30 minutos</SelectItem>
              <SelectItem value="3600">A cada 1 hora</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label htmlFor="dest-alert">Offline</Label>
          <Select value={form.offlineAlert} onValueChange={(v) => setForm({ ...form, offlineAlert: v as OfflineAlert })}>
            <SelectTrigger id="dest-alert"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OFFLINE_ALERT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Configurações de Alerta por Limiar</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dest-lat-thr">Latência máx. (ms) <span className="text-muted-foreground font-normal">0 = desativado</span></Label>
            <Input id="dest-lat-thr" type="number" min={0} max={10000} value={form.latencyThreshold} onChange={(e) => setForm({ ...form, latencyThreshold: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <Label htmlFor="dest-loss-thr">Perda máx. (%) <span className="text-muted-foreground font-normal">0 = desativado</span></Label>
            <Input id="dest-loss-thr" type="number" min={0} max={100} value={form.lossThreshold} onChange={(e) => setForm({ ...form, lossThreshold: parseInt(e.target.value) || 0 })} />
          </div>
        </div>
          <div className="col-span-2">
            <Label htmlFor="dest-repeat">Renotificar a cada <span className="text-muted-foreground font-normal">(durante incidente ativo)</span></Label>
            <Select value={String(form.alertRepeatMinutes)} onValueChange={(v) => setForm({ ...form, alertRepeatMinutes: parseInt(v) })}>
              <SelectTrigger id="dest-repeat"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">A cada 1 minuto</SelectItem>
                <SelectItem value="2">A cada 2 minutos</SelectItem>
                <SelectItem value="5">A cada 5 minutos</SelectItem>
                <SelectItem value="10">A cada 10 minutos</SelectItem>
                <SelectItem value="15">A cada 15 minutos</SelectItem>
                <SelectItem value="30">A cada 30 minutos</SelectItem>
                <SelectItem value="60">A cada 1 hora</SelectItem>
              </SelectContent>
            </Select>
          </div>
        <p className="text-xs text-muted-foreground mt-2">Alertas via Telegram quando latência ou perda ultrapassam os valores acima.</p>
      </div>
    </div>
  );
}

// ── Probe section ──────────────────────────────────────────────────────────

function ProbeSection({
  probe,
  colorIndex,
  isAdmin,
  onOpenHistory,
  onDeleteProbe,
  onToggleProbe,
}: {
  probe: { id: number; name: string; sourceIp: string; active: boolean; loopbackActive: boolean };
  colorIndex: number;
  isAdmin: boolean;
  onOpenHistory: (target: HistoryTarget) => void;
  onDeleteProbe?: (id: number) => void;
  onToggleProbe?: (id: number, active: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [showDestinations, setShowDestinations] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [showCharts, setShowCharts] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editDest, setEditDest] = useState<any | null>(null);
  const [deleteDestId, setDeleteDestId] = useState<number | null>(null);
  const [clearMetricsDestId, setClearMetricsDestId] = useState<number | null>(null);

  const makeDefaultForm = (): DestinationForm => ({
    probeId: probe.id, name: "", host: "", packetSize: 32, packetCount: 5,
    frequency: 30, offlineAlert: "never", latencyThreshold: 0, lossThreshold: 0, alertRepeatMinutes: 5,
  });

  const [form, setForm] = useState<DestinationForm>(makeDefaultForm);

  const { data: destinations, isLoading } = trpc.linuxDestinations.list.useQuery({ probeId: probe.id });

  const createMut = trpc.linuxDestinations.create.useMutation({
    onSuccess: () => { utils.linuxDestinations.list.invalidate({ probeId: probe.id }); setShowAddModal(false); setForm(makeDefaultForm()); toast.success("Destino adicionado"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const updateMut = trpc.linuxDestinations.update.useMutation({
    onSuccess: () => { utils.linuxDestinations.list.invalidate({ probeId: probe.id }); setEditDest(null); toast.success("Destino atualizado"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMut = trpc.linuxDestinations.delete.useMutation({
    onSuccess: () => { utils.linuxDestinations.list.invalidate({ probeId: probe.id }); setDeleteDestId(null); toast.success("Destino removido"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const clearMetricsMut = trpc.linuxDestinations.clearMetrics.useMutation({
    onSuccess: () => { utils.linuxDestinations.metrics.invalidate(); setClearMetricsDestId(null); toast.success("Métricas zeradas"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const toggleMut = trpc.linuxDestinations.update.useMutation({
    onSuccess: () => utils.linuxDestinations.list.invalidate({ probeId: probe.id }),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];

  function openEdit(dest: any) {
    setEditDest(dest);
    setForm({
      probeId: probe.id, name: dest.name, host: dest.host,
      packetSize: dest.packetSize, packetCount: dest.packetCount,
      frequency: dest.frequency, offlineAlert: dest.offlineAlert as OfflineAlert,
      latencyThreshold: dest.latencyThreshold ?? 0, lossThreshold: dest.lossThreshold ?? 0,
      alertRepeatMinutes: dest.alertRepeatMinutes ?? 5,
    });
  }

  const freqLabel = (s: number) => s < 60 ? `${s}s` : s < 3600 ? `${s / 60}min` : `${s / 3600}h`;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <div>
              <CardTitle className="text-base">{probe.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                IP de origem: <code className="bg-muted px-1 rounded">{probe.sourceIp}</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={probe.loopbackActive ? "default" : "secondary"} className="text-xs">
              {probe.loopbackActive ? "Loopback ativo" : "Loopback inativo"}
            </Badge>
            <Badge variant={probe.active ? "default" : "outline"} className="text-xs">
              {probe.active ? "Ativo" : "Inativo"}
            </Badge>
            {isAdmin && onToggleProbe && (
              <Switch
                checked={probe.active}
                onCheckedChange={(v) => onToggleProbe(probe.id, v)}
                title={probe.active ? "Desativar probe" : "Ativar probe"}
              />
            )}
            {isAdmin && onDeleteProbe && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteProbe(probe.id)}
                title="Remover probe"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowDestinations(!showDestinations)}>
              {showDestinations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {showDestinations && (
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Destinos monitorados</h4>
            <div className="flex items-center gap-2">
              {destinations && destinations.length > 0 && (
                <div className="flex items-center border border-border rounded-md overflow-hidden">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-7 px-2 rounded-none border-r border-border ${
                      viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                    onClick={() => setViewMode("grid")}
                    title="Modo grade"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`h-7 px-2 rounded-none ${
                      viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                    onClick={() => setViewMode("table")}
                    title="Modo tabela"
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => { setForm(makeDefaultForm()); setShowAddModal(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar destino
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !destinations?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum destino configurado.</p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { setForm(makeDefaultForm()); setShowAddModal(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Adicionar primeiro destino
                </Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* ── GRID MODE ── */
            <div className="flex flex-wrap gap-2">
              {destinations.map((dest) => (
                <DestGridCard
                  key={dest.id}
                  dest={dest}
                  probeId={probe.id}
                  onOpenHistory={onOpenHistory}
                  onOpenEdit={openEdit}
                  onDeleteDest={isAdmin ? (id) => setDeleteDestId(id) : undefined}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          ) : (
            /* ── TABLE MODE ── */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Nome</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Host/IP</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Pkt</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Freq.</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Alerta</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Limiares</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Ativo</th>
                    <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {destinations.map((dest) => (
                    <>
                      <tr key={dest.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-2">
                          <DestStatusBadge
                            destinationId={dest.id}
                            probeId={probe.id}
                            dest={dest}
                            onOpenHistory={onOpenHistory}
                            onOpenEdit={openEdit}
                            isAdmin={isAdmin}
                          />
                        </td>
                        <td className="py-2 px-2 font-medium">{dest.name}</td>
                        <td className="py-2 px-2 font-mono text-xs">{dest.host}</td>
                        <td className="py-2 px-2 text-center text-xs">{dest.packetSize}B × {dest.packetCount}</td>
                        <td className="py-2 px-2 text-center text-xs">{freqLabel(dest.frequency)}</td>
                        <td className="py-2 px-2 text-center">
                          {dest.offlineAlert === "never" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><BellOff className="h-3 w-3" />nunca</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400"><Bell className="h-3 w-3" />{dest.offlineAlert === "1" ? "imediato" : `${dest.offlineAlert}×`}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {dest.latencyThreshold > 0 || dest.lossThreshold > 0 ? (
                            <span className="text-blue-400">
                              {dest.latencyThreshold > 0 && `>${dest.latencyThreshold}ms`}
                              {dest.latencyThreshold > 0 && dest.lossThreshold > 0 && " / "}
                              {dest.lossThreshold > 0 && `>${dest.lossThreshold}%`}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isAdmin ? (
                            <Switch checked={dest.active} onCheckedChange={(v) => toggleMut.mutate({ id: dest.id, active: v })} />
                          ) : (
                            <Badge variant={dest.active ? "default" : "secondary"} className="text-xs">{dest.active ? "Sim" : "Não"}</Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver histórico"
                              onClick={() => onOpenHistory({ destinationId: dest.id, probeId: probe.id, name: dest.name, host: dest.host, latencyThreshold: dest.latencyThreshold ?? 0, lossThreshold: dest.lossThreshold ?? 0 })}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver gráfico rápido"
                              onClick={() => setShowCharts(showCharts === dest.id ? null : dest.id)}>
                              <BarChart2 className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => openEdit(dest)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remover" onClick={() => setDeleteDestId(dest.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {showCharts === dest.id && (
                        <tr key={`chart-${dest.id}`}>
                          <td colSpan={9} className="py-3 px-4 bg-muted/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Activity className="h-3.5 w-3.5" />Métricas rápidas: {dest.name}
                              </span>
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowCharts(null)}>
                                <X className="h-3 w-3 mr-1" />Fechar
                              </Button>
                            </div>
                            <DestMetricsChart
                              destinationId={dest.id}
                              probeId={probe.id}
                              destName={dest.name}
                              isAdmin={isAdmin}
                              onClear={() => setClearMetricsDestId(dest.id)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}

      {/* Add modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adicionar Destino — {probe.name}</DialogTitle></DialogHeader>
          <DestinationFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.name || !form.host}>
              {createMut.isPending ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editDest} onOpenChange={(o) => { if (!o) setEditDest(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Destino</DialogTitle></DialogHeader>
          <DestinationFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDest(null)}>Cancelar</Button>
            <Button onClick={() => updateMut.mutate({ id: editDest.id, ...form })} disabled={updateMut.isPending || !form.name || !form.host}>
              {updateMut.isPending ? "Salvando..." : "Atualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteDestId !== null} onOpenChange={(o) => { if (!o) setDeleteDestId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover destino?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação removerá o destino e todas as métricas históricas. Não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDestId !== null && deleteMut.mutate({ id: deleteDestId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear metrics confirm */}
      <AlertDialog open={clearMetricsDestId !== null} onOpenChange={(o) => { if (!o) setClearMetricsDestId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar métricas?</AlertDialogTitle>
            <AlertDialogDescription>Todos os dados históricos serão apagados permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearMetricsDestId !== null && clearMetricsMut.mutate({ destinationId: clearMetricsDestId })}>Zerar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Incidents tab ──────────────────────────────────────────────────────────────────

function IncidentsTab({ probes }: { probes: { id: number; name: string }[] }) {
  const [filterProbeId, setFilterProbeId] = useState<number | undefined>(undefined);
  const { data: incidents, isLoading } = trpc.linuxIncidents.list.useQuery(
    { probeId: filterProbeId, limit: 200 },
    { refetchInterval: 30000 }
  );

  const typeLabel = (t: string) => {
    if (t === "offline") return { label: "Offline", color: "text-red-400", bg: "bg-red-900/30" };
    if (t === "latency") return { label: "Lat. alta", color: "text-yellow-400", bg: "bg-yellow-900/30" };
    if (t === "loss") return { label: "Perda", color: "text-orange-400", bg: "bg-orange-900/30" };
    return { label: "Severo", color: "text-red-300", bg: "bg-red-900/50" };
  };

  const formatDuration = (start: Date | string, end?: Date | string | null) => {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.floor((e - s) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}min`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Filtrar por probe:</span>
        <Select
          value={filterProbeId ? String(filterProbeId) : "all"}
          onValueChange={(v) => setFilterProbeId(v === "all" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as probes</SelectItem>
            {probes.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p>Carregando incidentes...</p>
        </div>
      ) : !incidents?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Nenhum incidente registrado.</p>
            <p className="text-xs text-muted-foreground mt-1">Os incidentes são registrados automaticamente quando um destino fica offline ou excede os limiares configurados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Tipo</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Destino</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Probe</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Início</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Fim</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Duração</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Lat. média</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Perda média</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const t = typeLabel(inc.type);
                return (
                  <tr key={inc.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.color} ${t.bg}`}>
                        {t.label}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="text-xs font-medium">{inc.destinationName ?? `#${inc.destinationId}`}</div>
                      {inc.destinationHost && (
                        <div className="text-xs text-muted-foreground font-mono">{inc.destinationHost}</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{inc.probeName ?? `#${inc.probeId}`}</td>
                    <td className="py-2 px-3 text-xs">{new Date(inc.startedAt).toLocaleString("pt-BR")}</td>
                    <td className="py-2 px-3 text-xs">
                      {inc.endedAt
                        ? new Date(inc.endedAt).toLocaleString("pt-BR")
                        : <span className="text-amber-400 font-medium">Em andamento</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-mono">
                      {formatDuration(inc.startedAt, inc.endedAt)}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-mono">
                      {inc.avgLatencyMs > 0
                        ? `${inc.avgLatencyMs.toFixed(1)}ms`
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3 text-center text-xs font-mono">
                      {inc.avgLoss > 0 ? (
                        <span className={inc.avgLoss > 50 ? "text-red-400" : "text-orange-400"}>{inc.avgLoss.toFixed(1)}%</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {inc.resolved ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          Resolvido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          Ativo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────────────────

export default function LinuxMonitor() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);
  const [showAddProbe, setShowAddProbe] = useState(false);
  const [probeForm, setProbeForm] = useState({ name: "", sourceIp: "", operatorId: "" });
  const [deleteProbeId, setDeleteProbeId] = useState<number | null>(null);

  const { data: probes, isLoading: probesLoading, refetch: refetchProbes } = trpc.linuxProbes.list.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );
  const { data: operators } = trpc.operators.list.useQuery();

  const addProbeMut = trpc.linuxProbes.add.useMutation({
    onSuccess: () => {
      utils.linuxProbes.list.invalidate();
      setShowAddProbe(false);
      setProbeForm({ name: "", sourceIp: "", operatorId: "" });
      toast.success("Probe adicionada com sucesso");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const removeProbeMut = trpc.linuxProbes.remove.useMutation({
    onSuccess: () => { utils.linuxProbes.list.invalidate(); setDeleteProbeId(null); toast.success("Probe removida"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const toggleProbeMut = trpc.linuxProbes.toggle.useMutation({
    onSuccess: () => utils.linuxProbes.list.invalidate(),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const handleOpenHistory = useCallback((target: HistoryTarget) => {
    setHistoryTarget(target);
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor Linux</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento via ping por probe. Clique direito ou duplo clique no badge de status para ver o histórico.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" onClick={() => { setProbeForm({ name: "", sourceIp: "", operatorId: "" }); setShowAddProbe(true); }}>
              <Plus className="h-4 w-4 mr-2" />Nova Probe
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetchProbes()}>
            <RefreshCw className="h-4 w-4 mr-2" />Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="probes" className="space-y-0">
        <TabsList className="mb-4">
          <TabsTrigger value="probes" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />Probes
          </TabsTrigger>
          <TabsTrigger value="incidents" className="flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />Incidentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="probes" className="space-y-6 mt-0">

      {/* Modal Nova Probe */}
      <Dialog open={showAddProbe} onOpenChange={setShowAddProbe}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Probe</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome da Probe</Label>
              <Input
                placeholder="ex: Servidor Principal"
                value={probeForm.name}
                onChange={(e) => setProbeForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>IP de Origem (Loopback)</Label>
              <Input
                placeholder="ex: 10.0.0.1"
                value={probeForm.sourceIp}
                onChange={(e) => setProbeForm((f) => ({ ...f, sourceIp: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">IP do loopback que será configurado automaticamente no servidor.</p>
            </div>
            <div className="space-y-1">
              <Label>Operadora</Label>
              <Select
                value={probeForm.operatorId}
                onValueChange={(v) => setProbeForm((f) => ({ ...f, operatorId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a operadora" /></SelectTrigger>
                <SelectContent>
                  {operators?.map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProbe(false)}>Cancelar</Button>
            <Button
              disabled={!probeForm.name || !probeForm.sourceIp || !probeForm.operatorId || addProbeMut.isPending}
              onClick={() => addProbeMut.mutate({
                name: probeForm.name,
                sourceIp: probeForm.sourceIp,
                operatorId: Number(probeForm.operatorId),
              })}
            >
              {addProbeMut.isPending ? "Salvando..." : "Adicionar Probe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete probe */}
      <AlertDialog open={deleteProbeId !== null} onOpenChange={(o) => { if (!o) setDeleteProbeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover probe?</AlertDialogTitle>
            <AlertDialogDescription>Todos os destinos e métricas desta probe serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProbeId !== null && removeProbeMut.mutate({ id: deleteProbeId })}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {probesLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p>Carregando probes...</p>
        </div>
      )}

      {!probesLoading && (!probes || probes.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhuma probe configurada.</p>
            {isAdmin && (
              <Button size="sm" className="mt-4" onClick={() => { setProbeForm({ name: "", sourceIp: "", operatorId: "" }); setShowAddProbe(true); }}>
                <Plus className="h-4 w-4 mr-2" />Adicionar primeira probe
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {probes && probes.map((probe, idx) => (
        <ProbeSection
          key={probe.id}
          probe={probe}
          colorIndex={idx}
          isAdmin={isAdmin}
          onOpenHistory={handleOpenHistory}
          onDeleteProbe={isAdmin ? (id) => setDeleteProbeId(id) : undefined}
          onToggleProbe={isAdmin ? (id, active) => toggleProbeMut.mutate({ id, active }) : undefined}
        />
      ))}

        </TabsContent>

        <TabsContent value="incidents" className="mt-0">
          <IncidentsTab probes={probes ?? []} />
        </TabsContent>
      </Tabs>

      {/* Global history sheet */}
      <HistorySheet
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
        onEdit={() => {
          setHistoryTarget(null);
          toast.info("Use o botão de editar na linha do destino para editar.");
        }}
        isAdmin={isAdmin}
      />
    </div>
  );
}
