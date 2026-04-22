import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Radio, Save, Plus, Trash2, Server, Network, Pencil, Check, X } from "lucide-react";

export default function Ne8000Config() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: config } = trpc.ne8000.get.useQuery();
  const { data: operators } = trpc.operators.list.useQuery();
  const [form, setForm] = useState({ host: "", port: 22, username: "", sshKeyPath: "", password: "", asNumber: "" });
  const [newOp, setNewOp] = useState({ name: "", interface: "", sourceIp: "", peerIp: "", asNumber: "" });
  const [showOpForm, setShowOpForm] = useState(false);

  // Estado de edição inline de operadora
  const [editingOpId, setEditingOpId] = useState<number | null>(null);
  const [editOp, setEditOp] = useState({ name: "", interface: "", sourceIp: "", peerIp: "", asNumber: "" });

  useEffect(() => {
    if (config) setForm({ host: config.host, port: config.port, username: config.username, sshKeyPath: config.sshKeyPath ?? "", password: "", asNumber: config.asNumber ?? "" });
  }, [config]);

  const saveMutation = trpc.ne8000.save.useMutation({
    onSuccess: () => { toast.success("Configuração salva"); utils.ne8000.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createOp = trpc.operators.create.useMutation({
    onSuccess: () => { toast.success("Operadora adicionada"); utils.operators.list.invalidate(); setNewOp({ name: "", interface: "", sourceIp: "", peerIp: "", asNumber: "" }); setShowOpForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateOp = trpc.operators.update.useMutation({
    onSuccess: () => { toast.success("Operadora atualizada"); utils.operators.list.invalidate(); setEditingOpId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteOp = trpc.operators.delete.useMutation({
    onSuccess: () => { toast.success("Operadora removida"); utils.operators.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function startEditOp(op: { id: number; name: string; interface: string; sourceIp: string; peerIp: string; asNumber?: string | null }) {
    setEditingOpId(op.id);
    setEditOp({ name: op.name, interface: op.interface, sourceIp: op.sourceIp, peerIp: op.peerIp, asNumber: op.asNumber ?? "" });
    setShowOpForm(false);
  }
  function cancelEditOp() { setEditingOpId(null); }
  function saveEditOp() {
    if (!editingOpId || !editOp.name) return;
    updateOp.mutate({ id: editingOpId, ...editOp });
  }

  const statusColor: Record<string, string> = { up: "text-emerald-400", down: "text-red-400", degraded: "text-amber-400", unknown: "text-muted-foreground" };
  const statusLabel: Record<string, string> = { up: "Online", down: "Offline", degraded: "Degradado", unknown: "Desconhecido" };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Radio className="w-5 h-5 text-primary" />Configurar Ne8000</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Conexão SSH e operadoras BGP para monitoramento NQA</p>
      </div>

      <div className="rounded-xl border p-6 space-y-5" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="flex items-center gap-2"><Server className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Conexão SSH com Ne8000 M4</h2></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { k: "host", l: "Endereço IP / Hostname", p: "192.168.1.1" },
            { k: "port", l: "Porta SSH", p: "22", t: "number" },
            { k: "username", l: "Usuário SSH", p: "admin" },
            { k: "asNumber", l: "AS Number", p: "65001" },
            { k: "sshKeyPath", l: "Caminho da Chave SSH", p: "/etc/bgp_failover/id_rsa" },
            { k: "password", l: "Senha (opcional)", p: "", t: "password" },
          ].map(f => (
            <div key={f.k} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{f.l}</Label>
              <Input type={f.t || "text"} value={(form as any)[f.k]} onChange={e => setForm(x => ({ ...x, [f.k]: f.t === "number" ? Number(e.target.value) : e.target.value }))} placeholder={f.p} className="h-9 bg-input border-border text-sm" disabled={!isAdmin} />
            </div>
          ))}
        </div>
        {isAdmin && <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} size="sm" className="gap-2"><Save className="w-3.5 h-3.5" />{saveMutation.isPending ? "Salvando..." : "Salvar Configuração"}</Button>}
      </div>

      <div className="rounded-xl border" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-center gap-2"><Network className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold text-foreground">Operadoras BGP</h2><span className="text-xs text-muted-foreground ml-1">({operators?.length ?? 0}/3)</span></div>
          {isAdmin && (operators?.length ?? 0) < 3 && <Button size="sm" variant="outline" onClick={() => setShowOpForm(!showOpForm)} className="gap-1.5 h-8 text-xs"><Plus className="w-3.5 h-3.5" />Adicionar</Button>}
        </div>
        {showOpForm && isAdmin && (
          <div className="px-6 py-4 border-b space-y-4" style={{ borderColor: "oklch(0.22 0.015 260)", background: "oklch(0.11 0.01 260)" }}>
            <p className="text-xs font-medium text-foreground">Nova Operadora</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[{ k: "name", l: "Nome", p: "Vivo / Claro / TIM" }, { k: "interface", l: "Interface", p: "GE0/0/0" }, { k: "sourceIp", l: "IP de Origem", p: "192.168.1.2" }, { k: "peerIp", l: "IP do Peer BGP", p: "10.0.0.1" }, { k: "asNumber", l: "AS Number", p: "12345" }].map(f => (
                <div key={f.k} className="space-y-1"><Label className="text-xs text-muted-foreground">{f.l}</Label><Input value={(newOp as any)[f.k]} onChange={e => setNewOp(o => ({ ...o, [f.k]: e.target.value }))} placeholder={f.p} className="h-8 bg-input border-border text-xs" /></div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createOp.mutate(newOp)} disabled={createOp.isPending || !newOp.name} className="h-8 text-xs gap-1.5"><Plus className="w-3 h-3" />{createOp.isPending ? "Adicionando..." : "Adicionar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowOpForm(false)} className="h-8 text-xs">Cancelar</Button>
            </div>
          </div>
        )}
        <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
          {!operators?.length ? (
            <div className="text-center py-10"><Network className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma operadora configurada</p></div>
          ) : operators?.map(op => {
            const isEditing = editingOpId === op.id;
            return (
              <div key={op.id} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {([{ k: "name", l: "Nome" }, { k: "interface", l: "Interface" }, { k: "sourceIp", l: "IP de Origem" }, { k: "peerIp", l: "IP do Peer BGP" }, { k: "asNumber", l: "AS Number" }] as { k: keyof typeof editOp; l: string }[]).map(f => (
                        <div key={f.k} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{f.l}</Label>
                          <Input value={editOp[f.k]} onChange={e => setEditOp(o => ({ ...o, [f.k]: e.target.value }))} className="h-8 bg-input border-border text-xs" autoFocus={f.k === "name"} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditOp} disabled={updateOp.isPending || !editOp.name} className="h-7 text-xs gap-1.5">
                        <Check className="w-3 h-3" />{updateOp.isPending ? "Salvando..." : "Salvar"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditOp} className="h-7 text-xs gap-1.5">
                        <X className="w-3 h-3" />Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.55 0.20 255 / 0.1)" }}><Network className="w-4 h-4 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="text-sm font-medium text-foreground">{op.name}</span><span className={`text-xs font-medium ${statusColor[op.status]}`}>{statusLabel[op.status]}</span></div>
                      <div className="flex flex-wrap gap-3 mt-1"><span className="text-xs text-muted-foreground font-mono">if: {op.interface}</span><span className="text-xs text-muted-foreground">src: {op.sourceIp}</span><span className="text-xs text-muted-foreground">peer: {op.peerIp}</span></div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => startEditOp(op)} title="Editar operadora">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10" onClick={() => { if (confirm("Remover operadora?")) deleteOp.mutate({ id: op.id }); }} title="Remover operadora">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
