import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Monitor, Plus, Trash2, Wifi, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// Cores por probe/operadora
const OP_COLORS = [
  { stroke: "oklch(0.72 0.18 255)", fill: "oklch(0.72 0.18 255)", gradId: "lpGrad0" }, // azul
  { stroke: "oklch(0.72 0.20 155)", fill: "oklch(0.72 0.20 155)", gradId: "lpGrad1" }, // verde
  { stroke: "oklch(0.72 0.18 45)",  fill: "oklch(0.72 0.18 45)",  gradId: "lpGrad2" }, // laranja
  { stroke: "oklch(0.72 0.18 320)", fill: "oklch(0.72 0.18 320)", gradId: "lpGrad3" }, // roxo
];
const LOSS_COLORS = [
  { stroke: "oklch(0.68 0.22 25)",  gradId: "llGrad0" },
  { stroke: "oklch(0.72 0.20 60)",  gradId: "llGrad1" },
  { stroke: "oklch(0.68 0.22 300)", gradId: "llGrad2" },
  { stroke: "oklch(0.68 0.22 200)", gradId: "llGrad3" },
];
const CARD_BG = "oklch(0.13 0.012 260)";
const CARD_BORDER = "oklch(0.22 0.015 260)";

export default function LinuxMonitor() {
  const [hours, setHours] = useState("6");
  const [selectedProbe, setSelectedProbe] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProbe, setNewProbe] = useState({ name: "", sourceIp: "", operatorId: "" });

  const utils = trpc.useUtils();
  const { data: operators } = trpc.operators.list.useQuery();
  const { data: probes, refetch: refetchProbes } = trpc.linuxProbes.list.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: destinations } = trpc.destinations.list.useQuery({ operatorId: undefined });
  const { data: rawMetrics, refetch: refetchMetrics } = trpc.linuxMetrics.list.useQuery(
    {
      probeId: selectedProbe !== "all" ? Number(selectedProbe) : undefined,
      hours: Number(hours),
    },
    { refetchInterval: 60000 }
  );

  const addMutation = trpc.linuxProbes.add.useMutation({
    onSuccess: (data) => {
      toast.success(`Probe adicionada! ${data.loopback.message}`);
      setShowAddForm(false);
      setNewProbe({ name: "", sourceIp: "", operatorId: "" });
      refetchProbes();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.linuxProbes.remove.useMutation({
    onSuccess: (data) => {
      toast.success(`Probe removida. ${data.loopback.message}`);
      refetchProbes();
      refetchMetrics();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.linuxProbes.toggle.useMutation({
    onSuccess: () => { refetchProbes(); },
    onError: (e) => toast.error(e.message),
  });

  const resetMutation = trpc.linuxMetrics.reset.useMutation({
    onSuccess: (data) => {
      toast.success(`Métricas zeradas — ${data.deleted ?? 0} registros removidos.`);
      refetchMetrics();
      utils.linuxMetrics.list.invalidate();
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  // Build chart data
  const { latencyChart, lossChart, summary } = useMemo(() => {
    if (!rawMetrics || !probes || probes.length === 0) {
      return { latencyChart: [], lossChart: [], summary: [] };
    }

    const activeProbes = probes.filter((p) =>
      selectedProbe === "all" ? true : p.id === Number(selectedProbe)
    );

    // Group metrics by time bucket (5-min) and probe
    const buckets: Record<string, Record<number, { latSum: number; lossSum: number; cnt: number }>> = {};
    for (const m of rawMetrics) {
      const d = new Date(m.measuredAt);
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
      const key = d.toISOString();
      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][m.probeId]) buckets[key][m.probeId] = { latSum: 0, lossSum: 0, cnt: 0 };
      buckets[key][m.probeId].latSum += m.latencyMs;
      buckets[key][m.probeId].lossSum += m.packetLoss;
      buckets[key][m.probeId].cnt += 1;
    }

    const sortedKeys = Object.keys(buckets).sort();
    const latencyChart = sortedKeys.map((key) => {
      const entry: Record<string, any> = { time: format(new Date(key), "HH:mm") };
      for (const p of activeProbes) {
        const b = buckets[key][p.id];
        entry[`probe_${p.id}`] = b ? parseFloat((b.latSum / b.cnt).toFixed(2)) : null;
      }
      return entry;
    });

    const lossChart = sortedKeys.map((key) => {
      const entry: Record<string, any> = { time: format(new Date(key), "HH:mm") };
      for (const p of activeProbes) {
        const b = buckets[key][p.id];
        entry[`probe_${p.id}`] = b ? parseFloat((b.lossSum / b.cnt).toFixed(2)) : null;
      }
      return entry;
    });

    // Summary per probe
    const summary = activeProbes.map((p) => {
      const pMetrics = rawMetrics.filter((m) => m.probeId === p.id);
      if (pMetrics.length === 0) return { probe: p, latAvg: null, latMin: null, latMax: null, lossAvg: null };
      const lats = pMetrics.map((m) => m.latencyMs).filter((v) => v > 0);
      const losses = pMetrics.map((m) => m.packetLoss);
      return {
        probe: p,
        latAvg: lats.length ? parseFloat((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1)) : null,
        latMin: lats.length ? Math.min(...lats) : null,
        latMax: lats.length ? Math.max(...lats) : null,
        lossAvg: parseFloat((losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1)),
      };
    });

    return { latencyChart, lossChart, summary };
  }, [rawMetrics, probes, selectedProbe]);

  const getOperatorName = (opId: number) =>
    operators?.find((o) => o.id === opId)?.name ?? `Op #${opId}`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Monitor className="w-6 h-6 text-blue-400" />
            Monitor Linux
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Ping direto no Debian via loopback por operadora — independente do Ne8000
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32 bg-gray-900 border-gray-700 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["1","3","6","12","24"].map((h) => (
                <SelectItem key={h} value={h}>Últimas {h}h</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Zerar métricas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-gray-900 border-gray-700">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Zerar métricas Linux?</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  Todos os dados históricos do monitor Linux serão removidos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-300">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => resetMutation.mutate({})}
                >
                  Zerar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
            className="bg-blue-600 hover:bg-blue-700 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {showAddForm ? "Cancelar" : "Adicionar Probe"}
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg border text-sm text-blue-300"
        style={{ background: "oklch(0.15 0.04 255)", borderColor: "oklch(0.30 0.08 255)" }}>
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Cada probe usa um IP de loopback como <strong>source</strong> para os pings. O kernel Linux roteia
          o pacote pela interface que tem a rota BGP para aquele source IP, garantindo que o tráfego saia
          pela operadora correta. Os destinos monitorados são os mesmos cadastrados por operadora.
        </span>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border p-5 space-y-4"
          style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
          <h2 className="text-white font-semibold">Nova Probe de Loopback</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Nome</Label>
              <Input
                placeholder="ex: ALOO Loopback"
                value={newProbe.name}
                onChange={(e) => setNewProbe((p) => ({ ...p, name: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">IP de Loopback (source)</Label>
              <Input
                placeholder="ex: 45.237.165.240"
                value={newProbe.sourceIp}
                onChange={(e) => setNewProbe((p) => ({ ...p, sourceIp: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Operadora</Label>
              <Select value={newProbe.operatorId} onValueChange={(v) => setNewProbe((p) => ({ ...p, operatorId: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {operators?.map((op) => (
                    <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (!newProbe.name || !newProbe.sourceIp || !newProbe.operatorId) {
                  toast.error("Preencha todos os campos");
                  return;
                }
                addMutation.mutate({
                  name: newProbe.name,
                  sourceIp: newProbe.sourceIp,
                  operatorId: Number(newProbe.operatorId),
                });
              }}
              disabled={addMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {addMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </div>
      )}

      {/* Probes list */}
      <div className="space-y-2">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide opacity-60">Probes Configuradas</h2>
        {!probes || probes.length === 0 ? (
          <div className="rounded-xl border p-8 text-center text-gray-500"
            style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
            Nenhuma probe configurada. Adicione um IP de loopback para começar o monitoramento.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {probes.map((probe, idx) => {
              const color = OP_COLORS[idx % OP_COLORS.length];
              const sum = summary.find((s) => s.probe.id === probe.id);
              return (
                <div key={probe.id} className="rounded-xl border p-4 space-y-3"
                  style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: color.stroke }} />
                        <span className="text-white font-medium text-sm">{probe.name}</span>
                      </div>
                      <p className="text-xs font-mono text-gray-400 mt-0.5 ml-4.5">{probe.sourceIp}/32</p>
                      <p className="text-xs text-gray-500 mt-0.5 ml-4.5">{getOperatorName(probe.operatorId)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline"
                        className={probe.loopbackActive
                          ? "border-green-700 text-green-400 text-xs"
                          : "border-yellow-700 text-yellow-400 text-xs"}>
                        {probe.loopbackActive ? "Loopback OK" : "Sem loopback"}
                      </Badge>
                    </div>
                  </div>

                  {sum && sum.latAvg !== null && (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg p-2" style={{ background: "oklch(0.10 0.01 260)" }}>
                        <p className="text-xs text-gray-500">Latência Avg</p>
                        <p className="text-white font-bold text-sm">{sum.latAvg}ms</p>
                        <p className="text-xs text-gray-600">{sum.latMin}–{sum.latMax}ms</p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: "oklch(0.10 0.01 260)" }}>
                        <p className="text-xs text-gray-500">Perda Avg</p>
                        <p className={`font-bold text-sm ${(sum.lossAvg ?? 0) > 5 ? "text-red-400" : "text-green-400"}`}>
                          {sum.lossAvg}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: CARD_BORDER }}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={probe.active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: probe.id, active: v })}
                        className="scale-75"
                      />
                      <span className="text-xs text-gray-400">{probe.active ? "Ativo" : "Inativo"}</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-950 h-7 px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-gray-900 border-gray-700">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">Remover probe?</AlertDialogTitle>
                          <AlertDialogDescription className="text-gray-400">
                            A probe <strong>{probe.name}</strong> ({probe.sourceIp}/32) será removida e o IP
                            será deletado da loopback do servidor.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-300">Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => removeMutation.mutate({ id: probe.id })}
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts — only show if there are probes and metrics */}
      {probes && probes.length > 0 && (
        <>
          {/* Filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedProbe} onValueChange={setSelectedProbe}>
              <SelectTrigger className="w-48 bg-gray-900 border-gray-700 text-white text-sm">
                <SelectValue placeholder="Todas as probes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as probes</SelectItem>
                {probes.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => refetchMetrics()} className="text-gray-400 hover:text-white gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </Button>
          </div>

          {/* Latency chart */}
          <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="w-4 h-4 text-blue-400" />
              <span className="text-white font-semibold">Latência RTT (ms)</span>
              <span className="text-gray-500 text-xs ml-1">— Ping direto via loopback</span>
            </div>
            {latencyChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                Sem dados no período selecionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={latencyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    {(selectedProbe === "all" ? probes : probes.filter((p) => p.id === Number(selectedProbe)))
                      .map((p, idx) => {
                        const c = OP_COLORS[idx % OP_COLORS.length];
                        return (
                          <linearGradient key={c.gradId} id={c.gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={c.fill} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={c.fill} stopOpacity={0.02} />
                          </linearGradient>
                        );
                      })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 260)" />
                  <XAxis dataKey="time" tick={{ fill: "oklch(0.55 0.01 260)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.55 0.01 260)", fontSize: 11 }} unit="ms" />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.15 0.015 260)", border: "1px solid oklch(0.25 0.015 260)", borderRadius: 8 }}
                    labelStyle={{ color: "oklch(0.85 0.01 260)" }}
                    formatter={(v: any) => [`${v}ms`, ""]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(selectedProbe === "all" ? probes : probes.filter((p) => p.id === Number(selectedProbe)))
                    .map((p, idx) => {
                      const c = OP_COLORS[idx % OP_COLORS.length];
                      return (
                        <Area
                          key={p.id}
                          type="monotone"
                          dataKey={`probe_${p.id}`}
                          name={p.name}
                          stroke={c.stroke}
                          fill={`url(#${c.gradId})`}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Packet loss chart */}
          <div className="rounded-xl border p-5" style={{ background: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-semibold">Perda de Pacotes (%)</span>
              <span className="text-gray-500 text-xs ml-1">— Packet Loss do ping direto</span>
            </div>
            {lossChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                Sem dados no período selecionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={lossChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    {(selectedProbe === "all" ? probes : probes.filter((p) => p.id === Number(selectedProbe)))
                      .map((p, idx) => {
                        const c = LOSS_COLORS[idx % LOSS_COLORS.length];
                        return (
                          <linearGradient key={c.gradId} id={c.gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={c.stroke} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={c.stroke} stopOpacity={0.02} />
                          </linearGradient>
                        );
                      })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.01 260)" />
                  <XAxis dataKey="time" tick={{ fill: "oklch(0.55 0.01 260)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.55 0.01 260)", fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.15 0.015 260)", border: "1px solid oklch(0.25 0.015 260)", borderRadius: 8 }}
                    labelStyle={{ color: "oklch(0.85 0.01 260)" }}
                    formatter={(v: any) => [`${v}%`, ""]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(selectedProbe === "all" ? probes : probes.filter((p) => p.id === Number(selectedProbe)))
                    .map((p, idx) => {
                      const c = LOSS_COLORS[idx % LOSS_COLORS.length];
                      return (
                        <Area
                          key={p.id}
                          type="monotone"
                          dataKey={`probe_${p.id}`}
                          name={p.name}
                          stroke={c.stroke}
                          fill={`url(#${c.gradId})`}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
