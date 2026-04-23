import { useState, useMemo } from "react";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
} from "lucide-react";
import { toast } from "sonner";

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

// ── Status badge from recent metrics ──────────────────────────────────────

function DestStatusBadge({
  destinationId,
  probeId,
}: {
  destinationId: number;
  probeId: number;
}) {
  const { data: metrics } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId, probeId, hours: 1 },
    { refetchInterval: 15000, staleTime: 10000 }
  );

  const status = useMemo(() => {
    if (!metrics || metrics.length === 0) return null;
    const latest = metrics[0]; // newest first
    const latency = latest.latencyMs;
    const loss = latest.packetLoss;
    return { latency, loss };
  }, [metrics]);

  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
        sem dados
      </span>
    );
  }

  const isOffline = status.loss >= 100;
  const isDegraded = !isOffline && (status.loss > 10 || status.latency > 200);

  const color = isOffline
    ? "bg-red-500"
    : isDegraded
    ? "bg-yellow-400"
    : "bg-green-500";

  const textColor = isOffline
    ? "text-red-400"
    : isDegraded
    ? "text-yellow-400"
    : "text-green-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono font-medium ${textColor} bg-black/20 rounded px-1.5 py-0.5 border border-current/20`}
    >
      <span className={`w-2 h-2 rounded-full inline-block ${color}`} />
      {isOffline
        ? "offline"
        : `${status.latency.toFixed(1)} ms / ${status.loss.toFixed(0)}%`}
    </span>
  );
}

// ── Destination metrics chart ──────────────────────────────────────────────

function DestMetricsChart({
  destinationId,
  probeId,
  destName,
}: {
  destinationId: number;
  probeId: number;
  destName: string;
}) {
  const [hours, setHours] = useState(6);
  const { data: metrics, isLoading } = trpc.linuxDestinations.metrics.useQuery(
    { destinationId, probeId, hours },
    { refetchInterval: 30000 }
  );

  const chartData = useMemo(() => {
    if (!metrics) return [];
    return [...metrics]
      .reverse()
      .map((m) => ({
        time: new Date(m.measuredAt).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        latencia: m.latencyMs,
        perda: m.packetLoss,
      }));
  }, [metrics]);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Carregando métricas...
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Nenhuma métrica disponível para <strong>{destName}</strong>. O monitor
        coletará dados em breve.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Período:</span>
        {[1, 3, 6, 12, 24].map((h) => (
          <Button
            key={h}
            variant={hours === h ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setHours(h)}
          >
            {h}h
          </Button>
        ))}
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Latência (ms)</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "6px",
              }}
              labelStyle={{ color: "#f9fafb" }}
            />
            <Line
              type="monotone"
              dataKey="latencia"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              name="Latência (ms)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Perda de Pacotes (%)</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "6px",
              }}
              labelStyle={{ color: "#f9fafb" }}
            />
            <Line
              type="monotone"
              dataKey="perda"
              stroke="#ef4444"
              dot={false}
              strokeWidth={2}
              name="Perda (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Destination form fields ────────────────────────────────────────────────

function DestinationFormFields({
  form,
  setForm,
}: {
  form: DestinationForm;
  setForm: (f: DestinationForm) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2">
          <Label htmlFor="dest-name">Nome do sensor</Label>
          <Input
            id="dest-name"
            placeholder="Ex: WhatsApp"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        {/* Host */}
        <div className="col-span-2">
          <Label htmlFor="dest-host">IP / Domínio</Label>
          <Input
            id="dest-host"
            placeholder="Ex: www.whatsapp.com ou 8.8.8.8"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </div>

        {/* Packet size */}
        <div>
          <Label htmlFor="dest-pktsize">Tam. pacote (bytes)</Label>
          <Input
            id="dest-pktsize"
            type="number"
            min={1}
            max={65507}
            value={form.packetSize}
            onChange={(e) =>
              setForm({ ...form, packetSize: parseInt(e.target.value) || 32 })
            }
          />
        </div>

        {/* Packet count */}
        <div>
          <Label htmlFor="dest-pktcount">Quantidade de pacotes</Label>
          <Input
            id="dest-pktcount"
            type="number"
            min={1}
            max={100}
            value={form.packetCount}
            onChange={(e) =>
              setForm({ ...form, packetCount: parseInt(e.target.value) || 5 })
            }
          />
        </div>

        {/* Frequency */}
        <div className="col-span-2">
          <Label htmlFor="dest-freq">Executar</Label>
          <Select
            value={String(form.frequency)}
            onValueChange={(v) => setForm({ ...form, frequency: parseInt(v) })}
          >
            <SelectTrigger id="dest-freq">
              <SelectValue />
            </SelectTrigger>
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

        {/* Offline alert */}
        <div className="col-span-2">
          <Label htmlFor="dest-alert">Offline</Label>
          <Select
            value={form.offlineAlert}
            onValueChange={(v) =>
              setForm({ ...form, offlineAlert: v as OfflineAlert })
            }
          >
            <SelectTrigger id="dest-alert">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFLINE_ALERT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Display settings section */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Configurações de Alerta por Limiar
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="dest-lat-thr">
              Latência máx. (ms)
              <span className="text-muted-foreground font-normal ml-1">0 = desativado</span>
            </Label>
            <Input
              id="dest-lat-thr"
              type="number"
              min={0}
              max={10000}
              value={form.latencyThreshold}
              onChange={(e) =>
                setForm({
                  ...form,
                  latencyThreshold: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="dest-loss-thr">
              Perda máx. (%)
              <span className="text-muted-foreground font-normal ml-1">0 = desativado</span>
            </Label>
            <Input
              id="dest-loss-thr"
              type="number"
              min={0}
              max={100}
              value={form.lossThreshold}
              onChange={(e) =>
                setForm({
                  ...form,
                  lossThreshold: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Alertas de limiar são enviados via Telegram quando a latência ou perda de pacotes
          ultrapassam os valores configurados acima.
        </p>
      </div>
    </div>
  );
}

// ── Probe section ──────────────────────────────────────────────────────────

function ProbeSection({
  probe,
  colorIndex,
  isAdmin,
}: {
  probe: {
    id: number;
    name: string;
    sourceIp: string;
    active: boolean;
    loopbackActive: boolean;
  };
  colorIndex: number;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [showDestinations, setShowDestinations] = useState(true);
  const [showCharts, setShowCharts] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editDest, setEditDest] = useState<any | null>(null);
  const [deleteDestId, setDeleteDestId] = useState<number | null>(null);
  const [clearMetricsDestId, setClearMetricsDestId] = useState<number | null>(null);

  const makeDefaultForm = (): DestinationForm => ({
    probeId: probe.id,
    name: "",
    host: "",
    packetSize: 32,
    packetCount: 5,
    frequency: 30,
    offlineAlert: "never",
    latencyThreshold: 0,
    lossThreshold: 0,
  });

  const [form, setForm] = useState<DestinationForm>(makeDefaultForm);

  const { data: destinations, isLoading } = trpc.linuxDestinations.list.useQuery(
    { probeId: probe.id }
  );

  const createMut = trpc.linuxDestinations.create.useMutation({
    onSuccess: () => {
      utils.linuxDestinations.list.invalidate({ probeId: probe.id });
      setShowAddModal(false);
      setForm(makeDefaultForm());
      toast.success("Destino adicionado com sucesso");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const updateMut = trpc.linuxDestinations.update.useMutation({
    onSuccess: () => {
      utils.linuxDestinations.list.invalidate({ probeId: probe.id });
      setEditDest(null);
      toast.success("Destino atualizado");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMut = trpc.linuxDestinations.delete.useMutation({
    onSuccess: () => {
      utils.linuxDestinations.list.invalidate({ probeId: probe.id });
      setDeleteDestId(null);
      toast.success("Destino removido");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const clearMetricsMut = trpc.linuxDestinations.clearMetrics.useMutation({
    onSuccess: () => {
      utils.linuxDestinations.metrics.invalidate();
      setClearMetricsDestId(null);
      toast.success("Métricas zeradas");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const toggleMut = trpc.linuxDestinations.update.useMutation({
    onSuccess: () =>
      utils.linuxDestinations.list.invalidate({ probeId: probe.id }),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];

  function openEdit(dest: any) {
    setEditDest(dest);
    setForm({
      probeId: probe.id,
      name: dest.name,
      host: dest.host,
      packetSize: dest.packetSize,
      packetCount: dest.packetCount,
      frequency: dest.frequency,
      offlineAlert: dest.offlineAlert as OfflineAlert,
      latencyThreshold: dest.latencyThreshold ?? 0,
      lossThreshold: dest.lossThreshold ?? 0,
    });
  }

  function openAdd() {
    setForm(makeDefaultForm());
    setShowAddModal(true);
  }

  const offlineAlertLabel = (v: string) =>
    OFFLINE_ALERT_OPTIONS.find((o) => o.value === v)?.label ?? v;

  const freqLabel = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${s / 60}min`;
    return `${s / 3600}h`;
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <div>
              <CardTitle className="text-base">{probe.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                IP de origem:{" "}
                <code className="bg-muted px-1 rounded">{probe.sourceIp}</code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={probe.loopbackActive ? "default" : "secondary"}
              className="text-xs"
            >
              {probe.loopbackActive ? "Loopback ativo" : "Loopback inativo"}
            </Badge>
            <Badge
              variant={probe.active ? "default" : "outline"}
              className="text-xs"
            >
              {probe.active ? "Ativo" : "Inativo"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDestinations(!showDestinations)}
            >
              {showDestinations ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {showDestinations && (
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Destinos monitorados
            </h4>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar destino
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : !destinations?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum destino configurado para esta probe.</p>
              {isAdmin && (
                <Button size="sm" variant="outline" className="mt-3" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar primeiro destino
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Nome</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Host/IP</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Pkt</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Freq.</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Alerta Offline</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Limiares</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground font-medium">Ativo</th>
                    <th className="text-right py-2 px-2 text-xs text-muted-foreground font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {destinations.map((dest) => (
                    <>
                      <tr
                        key={dest.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        {/* Real-time status */}
                        <td className="py-2 px-2">
                          <DestStatusBadge
                            destinationId={dest.id}
                            probeId={probe.id}
                          />
                        </td>
                        <td className="py-2 px-2 font-medium">{dest.name}</td>
                        <td className="py-2 px-2 font-mono text-xs">{dest.host}</td>
                        <td className="py-2 px-2 text-center text-xs">
                          {dest.packetSize}B × {dest.packetCount}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {freqLabel(dest.frequency)}
                        </td>
                        {/* Offline alert */}
                        <td className="py-2 px-2 text-center">
                          {dest.offlineAlert === "never" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <BellOff className="h-3 w-3" />
                              nunca
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <Bell className="h-3 w-3" />
                              {dest.offlineAlert === "1"
                                ? "imediato"
                                : `${dest.offlineAlert}× seguidas`}
                            </span>
                          )}
                        </td>
                        {/* Thresholds */}
                        <td className="py-2 px-2 text-center text-xs text-muted-foreground">
                          {dest.latencyThreshold > 0 || dest.lossThreshold > 0 ? (
                            <span className="text-blue-400">
                              {dest.latencyThreshold > 0 && `>${dest.latencyThreshold}ms`}
                              {dest.latencyThreshold > 0 && dest.lossThreshold > 0 && " / "}
                              {dest.lossThreshold > 0 && `>${dest.lossThreshold}%`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isAdmin ? (
                            <Switch
                              checked={dest.active}
                              onCheckedChange={(v) =>
                                toggleMut.mutate({ id: dest.id, active: v })
                              }
                            />
                          ) : (
                            <Badge
                              variant={dest.active ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {dest.active ? "Sim" : "Não"}
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Ver gráficos"
                              onClick={() =>
                                setShowCharts(showCharts === dest.id ? null : dest.id)
                              }
                            >
                              <BarChart2 className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Editar"
                                  onClick={() => openEdit(dest)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Remover"
                                  onClick={() => setDeleteDestId(dest.id)}
                                >
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
                                <Activity className="h-3.5 w-3.5" />
                                Métricas: {dest.name}
                              </span>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-muted-foreground"
                                  onClick={() => setClearMetricsDestId(dest.id)}
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Zerar métricas
                                </Button>
                              )}
                            </div>
                            <DestMetricsChart
                              destinationId={dest.id}
                              probeId={probe.id}
                              destName={dest.name}
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

      {/* Add destination modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Destino — {probe.name}</DialogTitle>
          </DialogHeader>
          <DestinationFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMut.mutate(form)}
              disabled={createMut.isPending || !form.name || !form.host}
            >
              {createMut.isPending ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit destination modal */}
      <Dialog
        open={!!editDest}
        onOpenChange={(o) => { if (!o) setEditDest(null); }}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Destino</DialogTitle>
          </DialogHeader>
          <DestinationFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDest(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                updateMut.mutate({ id: editDest.id, ...form })
              }
              disabled={updateMut.isPending || !form.name || !form.host}
            >
              {updateMut.isPending ? "Salvando..." : "Atualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteDestId !== null}
        onOpenChange={(o) => { if (!o) setDeleteDestId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover destino?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o destino e todas as suas métricas históricas.
              Não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteDestId !== null && deleteMut.mutate({ id: deleteDestId })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear metrics confirmation */}
      <AlertDialog
        open={clearMetricsDestId !== null}
        onOpenChange={(o) => { if (!o) setClearMetricsDestId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar métricas?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados históricos deste destino serão apagados
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                clearMetricsDestId !== null &&
                clearMetricsMut.mutate({ destinationId: clearMetricsDestId })
              }
            >
              Zerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LinuxMonitor() {
  const { isAdmin } = useLocalAuth();

  const {
    data: probes,
    isLoading: probesLoading,
    refetch: refetchProbes,
  } = trpc.linuxProbes.list.useQuery(undefined, { refetchInterval: 30000 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor Linux</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento via ping por probe (IP de loopback). Cada destino possui
            frequência, alertas Telegram e limiares individuais.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchProbes()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

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
            <p className="text-sm text-muted-foreground mt-1">
              Configure probes na página de configuração do Ne8000.
            </p>
          </CardContent>
        </Card>
      )}

      {probes &&
        probes.map((probe, idx) => (
          <ProbeSection
            key={probe.id}
            probe={probe}
            colorIndex={idx}
            isAdmin={isAdmin}
          />
        ))}
    </div>
  );
}
