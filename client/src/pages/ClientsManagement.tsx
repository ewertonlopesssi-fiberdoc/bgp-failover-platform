import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Edit, Target, ChevronDown, ChevronRight } from "lucide-react";

export default function ClientsManagement() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: clients } = trpc.clients.list.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", prefix: "", asNumber: "", contactEmail: "", latencyThreshold: 100, packetLossThreshold: 5 });
  const [destForm, setDestForm] = useState({ name: "", host: "" });
  const [showDestForm, setShowDestForm] = useState<number | null>(null);

  const createMutation = trpc.clients.create.useMutation({
    onSuccess: () => { toast.success("Cliente adicionado"); utils.clients.list.invalidate(); setShowCreate(false); setForm({ name: "", prefix: "", asNumber: "", contactEmail: "", latencyThreshold: 100, packetLossThreshold: 5 }); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.clients.update.useMutation({
    onSuccess: () => { toast.success("Cliente atualizado"); utils.clients.list.invalidate(); setEditClient(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.clients.delete.useMutation({
    onSuccess: () => { toast.success("Cliente removido"); utils.clients.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addDestMutation = trpc.clients.addDestination.useMutation({
    onSuccess: () => { toast.success("Destino adicionado"); utils.clients.list.invalidate(); setDestForm({ name: "", host: "" }); setShowDestForm(null); },
    onError: (e) => toast.error(e.message),
  });
  const removeDestMutation = trpc.clients.removeDestination.useMutation({
    onSuccess: () => { toast.success("Destino removido"); utils.clients.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const statusColors: Record<string, string> = { normal: "text-emerald-400", failover: "text-amber-400", critical: "text-red-400" };
  const statusLabels: Record<string, string> = { normal: "Normal", failover: "Failover Ativo", critical: "Crítico" };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />Clientes Dedicados</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Clientes com failover automático de AS-Path Prepend</p>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Novo Cliente</Button>}
      </div>

      <div className="space-y-3">
        {!clients?.length ? (
          <div className="rounded-xl border text-center py-14" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum cliente configurado</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Adicione clientes para ativar o failover automático</p>
          </div>
        ) : clients?.map(client => (
          <div key={client.id} className="rounded-xl border overflow-hidden" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
            <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setExpanded(expanded === client.id ? null : client.id)}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.55 0.20 255 / 0.1)" }}><Zap className="w-4 h-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{client.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{client.prefix}</span>
                  <span className={`text-xs font-medium ${client.active ? "text-emerald-400" : "text-muted-foreground"}`}>{client.active ? "Ativo" : "Inativo"}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">Limite: {client.latencyThreshold}ms / {client.packetLossThreshold}% perda</span>
                  <span className="text-xs text-muted-foreground">{(client.destinations as any[])?.length ?? 0} destinos</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && <>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setEditClient(client); }}><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10" onClick={e => { e.stopPropagation(); if (confirm("Remover cliente?")) deleteMutation.mutate({ id: client.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </>}
                {expanded === client.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {expanded === client.id && (
              <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: "oklch(0.22 0.015 260)", background: "oklch(0.11 0.01 260)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-primary" />Destinos Monitorados</p>
                  {isAdmin && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowDestForm(showDestForm === client.id ? null : client.id)}><Plus className="w-3 h-3" />Adicionar</Button>}
                </div>
                {showDestForm === client.id && isAdmin && (
                  <div className="flex items-end gap-2 p-3 rounded-lg" style={{ background: "oklch(0.13 0.012 260)" }}>
                    <div className="flex-1 space-y-1"><Label className="text-xs text-muted-foreground">Nome</Label><Input value={destForm.name} onChange={e => setDestForm(f => ({ ...f, name: e.target.value }))} placeholder="AWS SP" className="h-8 bg-input border-border text-xs" /></div>
                    <div className="flex-1 space-y-1"><Label className="text-xs text-muted-foreground">IP / Host</Label><Input value={destForm.host} onChange={e => setDestForm(f => ({ ...f, host: e.target.value }))} placeholder="8.8.8.8" className="h-8 bg-input border-border text-xs" /></div>
                    <Button size="sm" className="h-8 text-xs" onClick={() => addDestMutation.mutate({ clientId: client.id, ...destForm })} disabled={!destForm.name || !destForm.host}>Adicionar</Button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {!(client.destinations as any[])?.length ? (
                    <p className="text-xs text-muted-foreground py-2">Nenhum destino configurado</p>
                  ) : (client.destinations as any[]).map((dest: any) => (
                    <div key={dest.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "oklch(0.13 0.012 260)" }}>
                      <Target className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground flex-1">{dest.name}</span>
                      <span className="text-xs font-mono text-muted-foreground">{dest.host}</span>
                      {isAdmin && <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground hover:text-red-400" onClick={() => removeDestMutation.mutate({ id: dest.id })}><Trash2 className="w-3 h-3" /></Button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Novo Cliente Dedicado</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {[{ k: "name", l: "Nome do Cliente", p: "Empresa ABC" }, { k: "prefix", l: "Prefixo IP", p: "200.100.0.0/24" }, { k: "asNumber", l: "AS Number", p: "65100" }, { k: "contactEmail", l: "E-mail de Contato", p: "noc@empresa.com" }].map(f => (
              <div key={f.k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{f.l}</Label><Input value={(form as any)[f.k]} onChange={e => setForm(x => ({ ...x, [f.k]: e.target.value }))} placeholder={f.p} className="h-9 bg-input border-border text-sm" /></div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Limite Latência (ms)</Label><Input type="number" value={form.latencyThreshold} onChange={e => setForm(f => ({ ...f, latencyThreshold: Number(e.target.value) }))} className="h-9 bg-input border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Limite Perda (%)</Label><Input type="number" value={form.packetLossThreshold} onChange={e => setForm(f => ({ ...f, packetLossThreshold: Number(e.target.value) }))} className="h-9 bg-input border-border text-sm" /></div>
            </div>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="w-full">{createMutation.isPending ? "Adicionando..." : "Adicionar Cliente"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editClient} onOpenChange={() => setEditClient(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          {editClient && (
            <div className="space-y-4 pt-2">
              {[{ k: "name", l: "Nome" }, { k: "prefix", l: "Prefixo IP" }, { k: "description", l: "Descrição" }].map(f => (
                <div key={f.k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{f.l}</Label><Input value={editClient[f.k] ?? ""} onChange={e => setEditClient((c: any) => ({ ...c, [f.k]: e.target.value }))} className="h-9 bg-input border-border text-sm" /></div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Limite Latência (ms)</Label><Input type="number" value={editClient.latencyThreshold} onChange={e => setEditClient((c: any) => ({ ...c, latencyThreshold: Number(e.target.value) }))} className="h-9 bg-input border-border text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Limite Perda (%)</Label><Input type="number" value={editClient.packetLossThreshold} onChange={e => setEditClient((c: any) => ({ ...c, packetLossThreshold: Number(e.target.value) }))} className="h-9 bg-input border-border text-sm" /></div>
              </div>
              <Button onClick={() => updateMutation.mutate({ id: editClient.id, name: editClient.name, prefix: editClient.prefix, description: editClient.description, latencyThreshold: editClient.latencyThreshold, packetLossThreshold: editClient.packetLossThreshold })} disabled={updateMutation.isPending} className="w-full">{updateMutation.isPending ? "Salvando..." : "Salvar"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
