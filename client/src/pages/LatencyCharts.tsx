import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity } from "lucide-react";
import { format } from "date-fns";

// v2 - fixed empty Select values
const COLORS = ["oklch(0.72 0.16 255)", "oklch(0.72 0.18 160)", "oklch(0.72 0.18 30)"];

export default function LatencyCharts() {
  const [selectedDest, setSelectedDest] = useState<string>("all");
  const [selectedOp, setSelectedOp] = useState<string>("all");
  const [hours, setHours] = useState("6");

  const { data: operators } = trpc.operators.list.useQuery();
  const { data: destinations } = trpc.destinations.list.useQuery({ operatorId: undefined });
  const { data: rawMetrics } = trpc.latency.list.useQuery(
    { operatorId: selectedOp && selectedOp !== "all" ? Number(selectedOp) : undefined, destinationId: selectedDest && selectedDest !== "all" ? Number(selectedDest) : undefined, hours: Number(hours) },
    { refetchInterval: 30000 }
  );

  // Build chart data from raw metrics
  const { chartData, summary } = useMemo(() => {
    if (!rawMetrics || !operators) return { chartData: [], summary: [] };

    // Group by time bucket (5 min intervals) and operator
    const buckets: Record<string, Record<string, number[]>> = {};
    for (const m of rawMetrics) {
      const t = new Date(m.measuredAt);
      t.setSeconds(0, 0);
      t.setMinutes(Math.floor(t.getMinutes() / 5) * 5);
      const key = t.toISOString();
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;
      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][opName]) buckets[key][opName] = [];
      buckets[key][opName].push(m.latencyMs);
    }

    const chartData = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, ops]) => {
        const row: Record<string, any> = { time };
        for (const [op, vals] of Object.entries(ops)) {
          row[op] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
        return row;
      });

    // Summary per operator
    const opMetrics: Record<string, number[]> = {};
    for (const m of rawMetrics) {
      const opName = operators.find(o => o.id === m.operatorId)?.name ?? `Op${m.operatorId}`;
      if (!opMetrics[opName]) opMetrics[opName] = [];
      opMetrics[opName].push(m.latencyMs);
    }
    const summary = Object.entries(opMetrics).map(([label, vals]) => ({
      label,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      min: Math.min(...vals),
      max: Math.max(...vals),
    }));

    return { chartData, summary };
  }, [rawMetrics, operators]);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />Gráficos de Latência</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Latência em tempo real por destino e operadora</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={selectedOp} onValueChange={setSelectedOp}>
          <SelectTrigger className="w-48 h-9 bg-card border-border text-sm"><SelectValue placeholder="Todas as operadoras" /></SelectTrigger>
          <SelectContent className="bg-card border-border"><SelectItem value="all">Todas as operadoras</SelectItem>{operators?.map(op => <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={selectedDest} onValueChange={setSelectedDest}>
          <SelectTrigger className="w-48 h-9 bg-card border-border text-sm"><SelectValue placeholder="Todos os destinos" /></SelectTrigger>
          <SelectContent className="bg-card border-border"><SelectItem value="all">Todos os destinos</SelectItem>{destinations?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-36 h-9 bg-card border-border text-sm"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border"><SelectItem value="1">Última hora</SelectItem><SelectItem value="6">Últimas 6h</SelectItem><SelectItem value="24">Últimas 24h</SelectItem><SelectItem value="72">Últimas 72h</SelectItem></SelectContent>
        </Select>
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {summary.map((s, i) => (
            <div key={i} className="rounded-xl border p-4" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className="text-xl font-semibold text-foreground">{s.avg}<span className="text-xs text-muted-foreground ml-1">ms</span></div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">min: {s.min}ms</span>
                <span className="text-xs text-muted-foreground">max: {s.max}ms</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border p-5" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <p className="text-sm font-medium text-foreground mb-4">Latência por Operadora</p>
        {!chartData.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhum dado disponível</p>
            <p className="text-xs mt-1 opacity-60">Os dados aparecerão conforme o monitoramento coleta métricas</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.015 260)" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} tickFormatter={v => { try { return format(new Date(v), "HH:mm"); } catch { return v; } }} />
              <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.01 260)" }} unit="ms" />
              <Tooltip contentStyle={{ background: "oklch(0.13 0.012 260)", border: "1px solid oklch(0.22 0.015 260)", borderRadius: "8px", fontSize: "12px" }} labelFormatter={v => { try { return format(new Date(v), "dd/MM HH:mm:ss"); } catch { return v; } }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {operators?.map((op, i) => (
                <Line key={op.id} type="monotone" dataKey={op.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
