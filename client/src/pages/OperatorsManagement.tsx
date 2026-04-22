import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Network, Plus, Trash2, Pencil, X, Check, Wifi, WifiOff } from "lucide-react";

type FormData = { name: string; interface: string; sourceIp: string; peerIp: string; asNumber: string };
const emptyForm: FormData = { name: "", interface: "", sourceIp: "", peerIp: "", asNumber: "" };

export default function OperatorsManagement() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: operators, isLoading } = trpc.operators.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormData>>({});

  const createMutation = trpc.operators.create.useMutation({
    onSuccess: () => {
      toast.success("Operadora adicionada com sucesso");
      utils.operators.list.invalidate();
      setForm(emptyForm);
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.operators.update.useMutation({
    onSuccess: () => {
      toast.success("Operadora atualizada");
      utils.operators.list.invalidate();
      setEditId(null);
      setEditForm({});
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.operators.delete.useMutation({
    onSuccess: () => {
      toast.success("Operadora removida");
      utils.operators.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (op: NonNullable<typeof operators>[0]) => {
    setEditId(op.id);
    setEditForm({ name: op.name, interface: op.interface, sourceIp: op.sourceIp, peerIp: op.peerIp, asNumber: op.asNumber ?? "" });
  };

  const statusColor: Record<string, string> = {
    up: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    down: "bg-red-500/10 text-red-400 border-red-500/20",
    degraded: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    unknown: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />Operadoras BGP
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie as operadoras e seus parâmetros de sessão BGP
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); }} className="gap-1.5">
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancelar" : "Nova Operadora"}
          </Button>
        )}
      </div>

      {/* Formulário de criação */}
      {showForm && isAdmin && (
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "oklch(0.11 0.01 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <p className="text-sm font-medium text-foreground">Nova Operadora</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome da Operadora *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vivo / Claro / Tim..." className="h-9 bg-input border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Interface *</Label>
              <Input value={form.interface} onChange={e => setForm(f => ({ ...f, interface: e.target.value }))} placeholder="eth0 / GigabitEthernet0/0" className="h-9 bg-input border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">IP de Origem *</Label>
              <Input value={form.sourceIp} onChange={e => setForm(f => ({ ...f, sourceIp: e.target.value }))} placeholder="192.168.1.1" className="h-9 bg-input border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">IP do Peer BGP *</Label>
              <Input value={form.peerIp} onChange={e => setForm(f => ({ ...f, peerIp: e.target.value }))} placeholder="10.0.0.1" className="h-9 bg-input border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Número AS (opcional)</Label>
              <Input value={form.asNumber} onChange={e => setForm(f => ({ ...f, asNumber: e.target.value }))} placeholder="65001" className="h-9 bg-input border-border text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.name || !form.interface || !form.sourceIp || !form.peerIp}
              className="h-8 text-xs gap-1.5"
            >
              <Plus className="w-3 h-3" />
              {createMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setForm(emptyForm); }} className="h-8 text-xs">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de operadoras */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        {isLoading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
        ) : !operators?.length ? (
          <div className="text-center py-12">
            <Network className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma operadora cadastrada</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Nova Operadora" para começar</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
            {operators.map(op => (
              <div key={op.id} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                {editId === op.id ? (
                  /* Modo edição inline */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Nome</Label><Input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-8 bg-input border-border text-sm" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Interface</Label><Input value={editForm.interface ?? ""} onChange={e => setEditForm(f => ({ ...f, interface: e.target.value }))} className="h-8 bg-input border-border text-sm" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">IP de Origem</Label><Input value={editForm.sourceIp ?? ""} onChange={e => setEditForm(f => ({ ...f, sourceIp: e.target.value }))} className="h-8 bg-input border-border text-sm" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">IP do Peer</Label><Input value={editForm.peerIp ?? ""} onChange={e => setEditForm(f => ({ ...f, peerIp: e.target.value }))} className="h-8 bg-input border-border text-sm" /></div>
                      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Número AS</Label><Input value={editForm.asNumber ?? ""} onChange={e => setEditForm(f => ({ ...f, asNumber: e.target.value }))} className="h-8 bg-input border-border text-sm" /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => updateMutation.mutate({ id: op.id, ...editForm })} disabled={updateMutation.isPending}><Check className="w-3 h-3" />Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditId(null)}><X className="w-3 h-3" />Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  /* Modo visualização */
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.55 0.20 255 / 0.1)" }}>
                      {op.status === "up" ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{op.name}</span>
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusColor[op.status ?? "unknown"]}`}>
                          {op.status ?? "unknown"}
                        </Badge>
                        {!op.active && <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">inativa</Badge>}
                      </div>
                      <div className="flex gap-4 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">iface: {op.interface}</span>
                        <span className="text-xs text-muted-foreground font-mono">src: {op.sourceIp}</span>
                        <span className="text-xs text-muted-foreground font-mono">peer: {op.peerIp}</span>
                        {op.asNumber && <span className="text-xs text-muted-foreground font-mono">AS: {op.asNumber}</span>}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => startEdit(op)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10" onClick={() => { if (confirm(`Remover operadora "${op.name}"?`)) deleteMutation.mutate({ id: op.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
