import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Settings, Save, Bell, BellOff, RefreshCw, Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Utilitários ──────────────────────────────────────────────────────────────
function parseBps(value: string): number {
  const v = value.trim().toUpperCase();
  if (!v || v === "0") return 0;
  const match = v.match(/^([\d.]+)\s*(G|GBPS|GB|M|MBPS|MB|K|KBPS|KB)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] || "";
  if (unit.startsWith("G")) return num * 1e9;
  if (unit.startsWith("M")) return num * 1e6;
  if (unit.startsWith("K")) return num * 1e3;
  return num;
}

function formatBpsDisplay(bps: number): string {
  if (!bps || bps <= 0) return "—";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(0)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

// ─── Linha editável ───────────────────────────────────────────────────────────
interface InterfaceRow {
  id: number;
  portId: number;
  ifName: string;
  label: string;
  category: "upstream" | "dedicated";
  contractedBps: number;
  alertThreshold: number;
  alertEnabled: boolean;
  lastAlertAt: Date | null;
}

function InterfaceRow({
  row,
  onSave,
}: {
  row: InterfaceRow;
  onSave: (data: Omit<InterfaceRow, "id" | "lastAlertAt">) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [contractedInput, setContractedInput] = useState(
    row.contractedBps > 0 ? formatBpsDisplay(row.contractedBps).replace(" ", "") : ""
  );
  const [threshold, setThreshold] = useState(String(row.alertThreshold));
  const [alertEnabled, setAlertEnabled] = useState(row.alertEnabled);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        portId: row.portId,
        ifName: row.ifName,
        label: label.trim() || row.ifName,
        category: row.category,
        contractedBps: parseBps(contractedInput),
        alertThreshold: Math.min(100, Math.max(1, parseInt(threshold) || 80)),
        alertEnabled,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setLabel(row.label);
    setContractedInput(row.contractedBps > 0 ? formatBpsDisplay(row.contractedBps).replace(" ", "") : "");
    setThreshold(String(row.alertThreshold));
    setAlertEnabled(row.alertEnabled);
    setEditing(false);
  };

  return (
    <tr className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${editing ? "bg-gray-800/50" : ""}`}>
      {/* Interface */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${row.category === "upstream" ? "bg-blue-500" : "bg-orange-500"}`}
          />
          <div>
            <p className="text-white text-xs font-mono">{row.ifName}</p>
            <Badge
              className={`text-[10px] px-1 py-0 mt-0.5 ${
                row.category === "upstream"
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "bg-orange-500/20 text-orange-400 border-orange-500/30"
              }`}
            >
              {row.category === "upstream" ? "Upstream" : "Dedicado"}
            </Badge>
          </div>
        </div>
      </td>

      {/* Nome/Label */}
      <td className="px-3 py-2">
        {editing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-7 text-xs bg-gray-900 border-gray-600 text-white w-full max-w-[200px]"
            placeholder="Nome do cliente"
          />
        ) : (
          <span className="text-white text-sm font-medium">{row.label}</span>
        )}
      </td>

      {/* Plano contratado */}
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={contractedInput}
              onChange={(e) => setContractedInput(e.target.value)}
              className="h-7 text-xs bg-gray-900 border-gray-600 text-white w-24"
              placeholder="ex: 1G, 500M"
            />
            <span className="text-gray-500 text-xs">Gbps/Mbps</span>
          </div>
        ) : (
          <span className={`text-sm font-mono ${row.contractedBps > 0 ? "text-cyan-400" : "text-gray-600"}`}>
            {row.contractedBps > 0 ? formatBpsDisplay(row.contractedBps) : "Link speed"}
          </span>
        )}
      </td>

      {/* Threshold */}
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              type="number"
              min={1}
              max={100}
              className="h-7 text-xs bg-gray-900 border-gray-600 text-white w-16"
            />
            <span className="text-gray-500 text-xs">%</span>
          </div>
        ) : (
          <span className="text-yellow-400 text-sm font-mono">{row.alertThreshold}%</span>
        )}
      </td>

      {/* Alerta */}
      <td className="px-3 py-2">
        {editing ? (
          <button
            onClick={() => setAlertEnabled(!alertEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
              alertEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-gray-700 text-gray-400 border border-gray-600"
            }`}
          >
            {alertEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
            {alertEnabled ? "Ativo" : "Inativo"}
          </button>
        ) : (
          <div className="flex flex-col gap-0.5">
            {row.alertEnabled ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs w-fit flex items-center gap-1">
                <Bell className="w-2.5 h-2.5" /> Ativo
              </Badge>
            ) : (
              <Badge className="bg-gray-700 text-gray-500 border-gray-600 text-xs w-fit flex items-center gap-1">
                <BellOff className="w-2.5 h-2.5" /> Inativo
              </Badge>
            )}
            {row.lastAlertAt && (
              <span className="text-gray-600 text-[10px]">
                Último: {new Date(row.lastAlertAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Ações */}
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2"
            >
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span className="ml-1">Salvar</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="h-7 text-xs border-gray-600 text-gray-400 bg-transparent px-2"
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-7 text-xs border-gray-700 text-gray-400 hover:text-white bg-transparent px-2"
          >
            <Settings className="w-3 h-3 mr-1" />
            Editar
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function InterfaceConfigPage() {
  const { data: configs, isLoading, refetch } = trpc.traffic.getInterfaceConfigs.useQuery();
  const upsertMutation = trpc.traffic.upsertInterfaceConfig.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Configuração salva", { description: "Interface atualizada com sucesso." });
    },
    onError: (e) => {
      toast.error("Erro ao salvar", { description: e.message });
    },
  });

  const upstream = (configs || []).filter((c) => c.category === "upstream");
  const dedicated = (configs || []).filter((c) => c.category === "dedicated");

  const handleSave = async (data: any) => {
    await upsertMutation.mutateAsync(data);
  };

  const alertCount = (configs || []).filter((c) => c.alertEnabled).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-bold text-white">Configuração de Interfaces</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Gerencie nomes, planos contratados e alertas de saturação por interface.
        </p>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800 rounded px-2.5 py-1.5">
            <Bell className="w-3.5 h-3.5 text-emerald-400" />
            <span><span className="text-white font-semibold">{alertCount}</span> interfaces com alerta ativo</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-800/50 rounded px-2.5 py-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>Cooldown de 15 min entre alertas repetidos · Alertas via Telegram</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upstream */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold text-white">Upstream</h2>
              <span className="text-xs text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">{upstream.length}</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/50">
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Interface</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Nome / Cliente</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Plano Contratado</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Threshold</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Alerta Telegram</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {upstream.map((row) => (
                    <InterfaceRow
                      key={row.portId}
                      row={row as InterfaceRow}
                      onSave={handleSave}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dedicados */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <h2 className="text-sm font-semibold text-white">Clientes Dedicados</h2>
              <span className="text-xs text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded">{dedicated.length}</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/50">
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Interface</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Nome / Cliente</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Plano Contratado</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Threshold</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Alerta Telegram</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dedicated.map((row) => (
                    <InterfaceRow
                      key={row.portId}
                      row={row as InterfaceRow}
                      onSave={handleSave}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
