import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Wifi, AlertTriangle, Zap } from "lucide-react";
import { format } from "date-fns";

const COLORS = [
  "oklch(0.72 0.16 255)",
  "oklch(0.72 0.18 160)",
  "oklch(0.72 0.18 30)",
  "oklch(0.72 0.18 320)",
];

const CARD_BG = "oklch(0.13 0.012 260)";
const CARD_BORDER = "oklch(0.22 0.015 260)";

export default function LatencyCharts() {
  const [selectedDest, setSelectedDest] = useState<string>("all");
  const [selectedOp, setSelectedOp] = useState<string>("all");
  const [hours, setHours] = useState("6");

  const { data: operators } = trpc.operators.list.useQuery();
  const { data: destinations } = trpc.destinations.list.useQuery({ operatorId: undefined });
  const { data: rawMetrics } = trpc.latency.list.useQuery(
    {
      operatorId: selectedOp !== "all" ? Number(selectedOp) : undefined,
      destinationId: selectedDest !== "all" ? Number(selectedDest) : undefined,
      hours: Number(hours),
    },
    { refetchInterval: 30000 }
  );

  const { latencyChart, jitterChart, lossChart, summary } = useMemo(() => {
    if (!rawMetrics || !operators) return { latencyChart: [], jitterChart: [], lossChart: [], summary: [] };

    // Agrupar por bucket de 5 minutos e operadora
    const latencyBuckets: Record<string, Record<string, number[]>> = {};
    const jitterBuckets: Record<string, Record<string, number[]>> = {};
    const lossBuckets: Record<string, Record<string, number[]>> = {};

    for (const m of rawMetrics) {
      const t = new Date(m.measuredAt);
      t.setSeconds(0, 0);
      t.setMinutes(Math.floor(t.getMinutes() / 5) * 5);
      const key = t.toISOString();
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;

      if (!latencyBuckets[key]) latencyBuckets[key] = {};
      if (!latencyBuckets[key][opName]) latencyBuckets[key][opName] = [];
      // Ignorar valores de falha (9999) para latência
      if (m.latencyMs < 9000) latencyBuckets[key][opName].push(m.latencyMs);

      if (!jitterBuckets[key]) jitterBuckets[key] = {};
      if (!jitterBuckets[key][opName]) jitterBuckets[key][opName] = [];
      if (m.jitterMs !== null && m.jitterMs > 0) jitterBuckets[key][opName].push(m.jitterMs);

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
    const jitterChart = buildChart(jitterBuckets);
    const lossChart = buildChart(lossBuckets);

    // Resumo por operadora
    const opStats: Record<string, { latency: number[]; jitter: number[]; loss: number[] }> = {};
    for (const m of rawMetrics) {
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;
      if (!opStats[opName]) opStats[opName] = { latency: [], jitter: [], loss: [] };
      if (m.latencyMs < 9000) opStats[opName].latency.push(m.latencyMs);
      if (m.jitterMs !== null && m.jitterMs > 0) opStats[opName].jitter.push(m.jitterMs);
      opStats[opName].loss.push(m.packetLoss);
    }

    const summary = Object.entries(opStats).map(([label, s]) => ({
      label,
      avgLatency: avg(s.latency),
      minLatency: s.latency.length > 0 ? Math.min(...s.latency) : null,
      maxLatency: s.latency.length > 0 ? Math.max(...s.latency) : null,
      avgJitter: avg(s.jitter),
      avgLoss: avg(s.loss),
    }));

    return { latencyChart, jitterChart, lossChart, summary };
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
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />Gráficos de Latência — NQA icmpjitter
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Métricas coletadas via NQA icmpjitter do Ne8000: latência, jitter e perda de pacotes
        </p>
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
          {summary.map((s, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-sm font-medium text-foreground">{s.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
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
                    <Zap className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs text-muted-foreground">Jitter</span>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {s.avgJitter !== null ? `${s.avgJitter}` : "—"}
                    <span className="text-xs text-muted-foreground ml-0.5">ms</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-muted-foreground">Perda</span>
                  </div>
                  <div className={`text-lg font-semibold ${(s.avgLoss ?? 0) > 5 ? "text-red-400" : "text-foreground"}`}>
                    {s.avgLoss !== null ? `${s.avgLoss}` : "—"}
                    <span className="text-xs text-muted-foreground ml-0.5">%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico 1: Latência RTT */}
      <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-blue-400" />
          <p className="text-sm font-medium text-foreground">Latência RTT (ms)</p>
          <span className="text-xs text-muted-foreground ml-1">— Avg RTT do NQA icmpjitter</span>
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
                <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2: Jitter */}
      <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-yellow-400" />
          <p className="text-sm font-medium text-foreground">Jitter (ms)</p>
          <span className="text-xs text-muted-foreground ml-1">— Variação de atraso do NQA icmpjitter</span>
        </div>
        {!jitterChart.length ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={jitterChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {opNames.map((name, i) => (
                  <linearGradient key={name} id={`jGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CARD_BORDER} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }}
                tickFormatter={v => { try { return format(new Date(v), "HH:mm"); } catch { return v; } }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} unit="ms" />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}ms`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {opNames.map((name, i) => (
                <Area key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]}
                  fill={`url(#jGrad${i})`} strokeWidth={2} dot={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 3: Perda de Pacotes */}
      <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">Perda de Pacotes (%)</p>
          <span className="text-xs text-muted-foreground ml-1">— Packet Loss Ratio do NQA</span>
        </div>
        {!lossChart.length ? <ChartEmpty /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={lossChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                {opNames.map((name, i) => (
                  <linearGradient key={name} id={`lGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.65 0.2 25)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.65 0.2 25)" stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CARD_BORDER} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }}
                tickFormatter={v => { try { return format(new Date(v), "HH:mm"); } catch { return v; } }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} unit="%" domain={[0, 100]} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, ""]} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {opNames.map((name, i) => (
                <Area key={name} type="monotone" dataKey={name}
                  stroke="oklch(0.65 0.2 25)" fill={`url(#lGrad${i})`}
                  strokeWidth={2} dot={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
