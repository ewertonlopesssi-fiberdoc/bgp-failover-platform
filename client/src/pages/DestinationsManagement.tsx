import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Target } from "lucide-react";

export default function DestinationsManagement() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: operators } = trpc.operators.list.useQuery();
  const [filterOp, setFilterOp] = useState<string>("all");
  const { data: destinations } = trpc.destinations.list.useQuery({
    operatorId: filterOp && filterOp !== "all" ? Number(filterOp) : undefined,
  });
  const [form, setForm] = useState({ name: "", host: "", operatorId: "" });
  const [showForm, setShowForm] = useState(false);

  const createMutation = trpc.destinations.create.useMutation({
    onSuccess: () => {
      toast.success("Destino adicionado");
      utils.destinations.list.invalidate();
      setForm({ name: "", host: "", operatorId: "" });
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.destinations.delete.useMutation({
    onSuccess: () => { toast.success("Destino removido"); utils.destinations.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const hasOperators = operators && operators.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />Destinos Monitorados
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">IPs e hosts monitorados por operadora para detecção de falhas</p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => {
              if (!hasOperators) {
                toast.error("Cadastre uma operadora primeiro em 'Configurar Ne8000'");
                return;
              }
              setShowForm(!showForm);
            }}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />Adicionar Destino
          </Button>
        )}
      </div>

      {/* Filtro por operadora */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">Filtrar por operadora:</Label>
        <Select value={filterOp} onValueChange={setFilterOp}>
          <SelectTrigger className="w-56 h-9 bg-card border-border text-sm">
            <SelectValue placeholder="Selecione uma operadora" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todas</SelectItem>
            {operators?.map(op => (
              <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Formulário de novo destino */}
      {showForm && isAdmin && (
        <div className="rounded-xl border p-5 space-y-4" style={{ background: "oklch(0.11 0.01 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <p className="text-sm font-medium text-foreground">Novo Destino</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome / Identificação</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="AWS São Paulo"
                className="h-9 bg-input border-border text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">IP ou Hostname</Label>
              <Input
                value={form.host}
                onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                placeholder="8.8.8.8"
                className="h-9 bg-input border-border text-sm"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-muted-foreground">Operadora</Label>
              <Select value={form.operatorId} onValueChange={v => setForm(f => ({ ...f, operatorId: v }))}>
                <SelectTrigger className="h-9 bg-input border-border text-sm">
                  <SelectValue placeholder="Selecione a operadora" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {operators?.map(op => (
                    <SelectItem key={op.id} value={String(op.id)}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ operatorId: Number(form.operatorId), name: form.name, host: form.host })}
              disabled={createMutation.isPending || !form.name || !form.host || !form.operatorId}
              className="h-8 text-xs gap-1.5"
            >
              <Plus className="w-3 h-3" />{createMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-8 text-xs">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de destinos */}
      <div className="rounded-xl border overflow-hidden" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
          {!destinations?.length ? (
            <div className="text-center py-12">
              <Target className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum destino configurado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {hasOperators ? "Clique em 'Adicionar Destino' para começar" : "Cadastre uma operadora primeiro em 'Configurar Ne8000'"}
              </p>
            </div>
          ) : destinations?.map(dest => {
            const op = operators?.find(o => o.id === dest.operatorId);
            return (
              <div key={dest.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.55 0.20 255 / 0.1)" }}>
                  <Target className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{dest.name}</span>
                    {op && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{op.name}</span>}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{dest.host}</span>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => { if (confirm("Remover destino?")) deleteMutation.mutate({ id: dest.id }); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
