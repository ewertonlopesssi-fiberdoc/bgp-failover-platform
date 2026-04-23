import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Activity, Wifi, AlertTriangle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Cores distintas por operadora — índice 0 = azul (ALOO), índice 1 = verde (BR Digital), etc.
const OP_COLORS = [
  { stroke: "oklch(0.72 0.18 255)", fill: "oklch(0.72 0.18 255)", gradId: "opGrad0" }, // azul
  { stroke: "oklch(0.72 0.20 155)", fill: "oklch(0.72 0.20 155)", gradId: "opGrad1" }, // verde
  { stroke: "oklch(0.72 0.18 45)",  fill: "oklch(0.72 0.18 45)",  gradId: "opGrad2" }, // laranja
  { stroke: "oklch(0.72 0.18 320)", fill: "oklch(0.72 0.18 320)", gradId: "opGrad3" }, // roxo
];

// Cores específicas para o gráfico de perda — vermelho/laranja distintos
const LOSS_COLORS = [
  { stroke: "oklch(0.68 0.22 25)",  gradId: "lGrad0" }, // vermelho
  { stroke: "oklch(0.72 0.20 60)",  gradId: "lGrad1" }, // laranja/amarelo
  { stroke: "oklch(0.68 0.22 300)", gradId: "lGrad2" }, // magenta
  { stroke: "oklch(0.68 0.22 200)", gradId: "lGrad3" }, // ciano
];

const CARD_BG = "oklch(0.13 0.012 260)";
const CARD_BORDER = "oklch(0.22 0.015 260)";

export default function LatencyCharts() {
  const [selectedDest, setSelectedDest] = useState<string>("all");
  const [selectedOp, setSelectedOp] = useState<string>("all");
  const [hours, setHours] = useState("6");
  const utils = trpc.useUtils();
  const { data: operators } = trpc.operators.list.useQuery();
  const { data: destinations } = trpc.destinations.list.useQuery({ operatorId: undefined });
  const { data: rawMetrics, refetch: refetchMetrics } = trpc.latency.list.useQuery(
    {
      operatorId: selectedOp !== "all" ? Number(selectedOp) : undefined,
      destinationId: selectedDest !== "all" ? Number(selectedDest) : undefined,
      hours: Number(hours),
    },
    { refetchInterval: 30000 }
  );

  const resetMutation = trpc.latency.reset.useMutation({
    onSuccess: (data) => {
      toast.success(`Métricas zeradas — ${data.deleted ?? 0} registros removidos.`);
      refetchMetrics();
      utils.latency.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao zerar métricas: ${err.message}`);
    },
  });

  const { latencyChart, lossChart, summary } = useMemo(() => {
    if (!rawMetrics || !operators) return { latencyChart: [], lossChart: [], summary: [] };

    const latencyBuckets: Record<string, Record<string, number[]>> = {};
    const lossBuckets: Record<string, Record<string, number[]>> = {};

    for (const m of rawMetrics) {
      const t = new Date(m.measuredAt);
      t.setSeconds(0, 0);
      t.setMinutes(Math.floor(t.getMinutes() / 5) * 5);
      const key = t.toISOString();
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;

      if (!latencyBuckets[key]) latencyBuckets[key] = {};
      if (!latencyBuckets[key][opName]) latencyBuckets[key][opName] = [];
      if (m.latencyMs < 9000 && m.latencyMs > 0) latencyBuckets[key][opName].push(m.latencyMs);

      if (!lossBuckets[key]) lossBuckets[key] = {};
      if (!lossBuckets[key][opName]) lossBuckets[key][opName] = [];
      lossBuckets[key][opName].push(m.packetLoss);
    }

    const avg = (vals: number[]) => vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10
      : null;

    const buildChart = (buckets: Record<string, Record<string, number[]>>) =>
      Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, ops]) => {
          const row: Record<string, any> = { time };
          for (const [op, vals] of Object.entries(ops)) {
            const v = avg(vals);
            if (v !== null) row[op] = v;
          }
          return row;
        });

    const latencyChart = buildChart(latencyBuckets);
    const lossChart = buildChart(lossBuckets);

    // Resumo por operadora
    const opStats: Record<string, { latency: number[]; loss: number[] }> = {};
    for (const m of rawMetrics) {
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;
      if (!opStats[opName]) opStats[opName] = { latency: [], loss: [] };
      if (m.latencyMs < 9000 && m.latencyMs > 0) opStats[opName].latency.push(m.latencyMs);
      opStats[opName].loss.push(m.packetLoss);
    }

    const summary = Object.entries(opStats).map(([label, s]) => ({
      label,
      avgLatency: avg(s.latency),
      minLatency: s.latency.length > 0 ? Math.min(...s.latency) : null,
      maxLatency: s.latency.length > 0 ? Math.max(...s.latency) : null,
      avgLoss: avg(s.loss),
    }));

    return { latencyChart, lossChart, summary };
  }, [rawMetrics, operators]);

  const opNames = operators?.map(o => o.name) ?? [];

  const ChartEmpty = () => (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
      <Activity className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">Nenhum dado disponível</p>
      <p className="text-xs mt-1 opacity-60">Os dados aparecerão conforme o NQA coleta métricas</p>
    </div>
  );

  const tooltipStyle = {
    contentStyle: { background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: "8px", fontSize: "12px" },
    labelFormatter: (v: string) => { try { return format(new Date(v), "dd/MM HH:mm"); } catch { return v; } },
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />Gráficos de Latência — NQA icmp
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Métricas coletadas via NQA icmp do Ne8000: latência RTT e perda de pacotes
          </p>
        </div>
        {/* Botão Zerar Métricas */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2 border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300 shrink-0">
              <Trash2 className="w-4 h-4" />
              Zerar métricas
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Zerar histórico de métricas?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os registros de latência e perda de pacotes serão removidos permanentemente.
                Os gráficos começarão a acumular dados novamente a partir do próximo ciclo do monitor.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => resetMutation.mutate({ operatorId: undefined })}
              >
                {resetMutation.isPending ? "Zerando..." : "Zerar tudo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedOp} onValueChange={setSelectedOp}>
          <SelectTrigger className="w-48 h-9 bg-card border-border text-sm">
            <SelectValue placeholder="Todas as operadoras" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todas as operadoras</SelectItem>
            {operators?.map(op => <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedDest} onValueChange={setSelectedDest}>
          <SelectTrigger className="w-48 h-9 bg-card border-border text-sm">
            <SelectValue placeholder="Todos os destinos" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todos os destinos</SelectItem>
            {destinations?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-36 h-9 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="1">Última hora</SelectItem>
            <SelectItem value="6">Últimas 6h</SelectItem>
            <SelectItem value="24">Últimas 24h</SelectItem>
            <SelectItem value="72">Últimas 72h</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards de resumo por operadora */}
      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.map((s, i) => {
            const col = OP_COLORS[i % OP_COLORS.length];
            return (
              <div key={i} className="rounded-xl border p-4 space-y-3" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.stroke }} />
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Wifi className="w-3 h-3 text-blue-400" />
                      <span className="text-xs text-muted-foreground">Latência</span>
                    </div>
                    <div className="text-lg font-semibold text-foreground">
                      {s.avgLatency !== null ? `${s.avgLatency}` : "—"}
                      <span className="text-xs text-muted-foreground ml-0.5">ms</span>
                    </div>
                    {s.minLatency !== null && s.maxLatency !== null && (
                      <div className="text-xs text-muted-foreground">{s.minLatency}–{s.maxLatency}ms</div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      <span className="text-xs text-muted-foreground">Perda</span>
                    </div>
                    <div className={`text-lg font-semibold ${(s.avgLoss ?? 0) > 5 ? "text-red-400" : "text-green-400"}`}>
                      {s.avgLoss !== null ? `${s.avgLoss}` : "—"}
                      <span className="text-xs text-muted-foreground ml-0.5">%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gráfico 1: Latência RTT */}
      <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-blue-400" />
          <p className="text-sm font-medium text-foreground">Latência RTT (ms)</p>
          <span className="text-xs text-muted-foreground ml-1">— Avg RTT do NQA icmp</span>
        </div>
        {!latencyChart.length ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={latencyChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CARD_BORDER} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }}
                tickFormatter={v => { try { return format(new Date(v), "HH:mm"); } catch { return v; } }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} unit="ms" />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}ms`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {opNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name}
                  stroke={OP_COLORS[i % OP_COLORS.length].stroke}
                  strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2: Perda de Pacotes — cores distintas por operadora */}
      <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">Perda de Pacotes (%)</p>
          <span className="text-xs text-muted-foreground ml-1">— Packet Loss Ratio do NQA</span>
        </div>
        {!lossChart.length ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={lossChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {opNames.map((_, i) => {
                  const c = LOSS_COLORS[i % LOSS_COLORS.length];
                  return (
                    <linearGradient key={c.gradId} id={c.gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c.stroke} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={c.stroke} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CARD_BORDER} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }}
                tickFormatter={v => { try { return format(new Date(v), "HH:mm"); } catch { return v; } }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} unit="%" domain={[0, 100]} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {opNames.map((name, i) => {
                const c = LOSS_COLORS[i % LOSS_COLORS.length];
                return (
                  <Area key={name} type="monotone" dataKey={name}
                    stroke={c.stroke} fill={`url(#${c.gradId})`}
                    strokeWidth={2} dot={false} connectNulls />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
