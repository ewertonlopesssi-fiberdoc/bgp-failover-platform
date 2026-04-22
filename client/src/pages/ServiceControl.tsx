import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Server, Play, Square, RefreshCw, CheckCircle2, XCircle, Clock, Cpu } from "lucide-react";

export default function ServiceControl() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: status, refetch } = trpc.service.status.useQuery(undefined, { refetchInterval: 10000 });
  const actionMutation = trpc.service.action.useMutation({
    onSuccess: (data) => { toast.success(data.message); utils.service.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const isRunning = status?.status === "running";
  const uptimeHours = Math.floor((status?.uptime ?? 0) / 3600);
  const uptimeMins = Math.floor(((status?.uptime ?? 0) % 3600) / 60);
  const uptimeSecs = (status?.uptime ?? 0) % 60;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Server className="w-5 h-5 text-primary" />Controle do Serviço</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerenciar o serviço de monitoramento BGP Failover</p>
      </div>

      <div className="rounded-xl border p-6" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isRunning ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              {isRunning ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">{isRunning ? "Serviço Ativo" : "Serviço Inativo"}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                <span className="text-xs text-muted-foreground">{isRunning ? "Operando normalmente" : "Serviço parado"}</span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 h-8 text-xs"><RefreshCw className="w-3.5 h-3.5" />Atualizar</Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Clock, label: "Uptime", value: `${uptimeHours}h ${uptimeMins}m ${uptimeSecs}s` },
            { icon: Cpu, label: "Versão", value: status?.version ?? "2.0.0" },
            { icon: CheckCircle2, label: "API", value: status?.apiHealthy ? "Saudável" : "Com problemas" },
          ].map(item => (
            <div key={item.label} className="rounded-lg p-4" style={{ background: "oklch(0.11 0.01 260)" }}>
              <item.icon className="w-4 h-4 text-muted-foreground mb-2" />
              <div className="text-sm font-semibold text-foreground">{item.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-xl border p-6" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Ações do Serviço</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { action: "start", label: "Iniciar", icon: Play, disabled: isRunning },
              { action: "stop", label: "Parar", icon: Square, disabled: !isRunning, confirm: true },
              { action: "restart", label: "Reiniciar", icon: RefreshCw, disabled: false },
            ].map(btn => (
              <button key={btn.action}
                onClick={() => { if ((btn as any).confirm && !confirm("Parar o serviço?")) return; actionMutation.mutate({ action: btn.action as any }); }}
                disabled={actionMutation.isPending || btn.disabled}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:bg-white/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: "oklch(0.22 0.015 260)" }}>
                <btn.icon className="w-5 h-5 text-primary" />
                <span className="text-xs font-medium text-foreground">{btn.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">As ações são registradas no log de auditoria do sistema.</p>
        </div>
      )}
    </div>
  );
}
