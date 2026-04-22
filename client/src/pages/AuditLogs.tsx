import { trpc } from "@/lib/trpc";
import { FileText, AlertTriangle, CheckCircle2, Activity, Shield, Settings, Info } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, any> = { failover: AlertTriangle, recovery: CheckCircle2, config_change: Settings, alert: AlertTriangle, service: Activity, auth: Shield, info: Info };
const typeLabels: Record<string, string> = { failover: "Failover", recovery: "Recuperação", config_change: "Configuração", alert: "Alerta", service: "Serviço", auth: "Autenticação", info: "Info" };
const severityColors: Record<string, string> = { critical: "text-red-400 bg-red-500/10", warning: "text-amber-400 bg-amber-500/10", success: "text-emerald-400 bg-emerald-500/10", info: "text-blue-400 bg-blue-500/10" };

export default function AuditLogs() {
  const { data: logs, isLoading } = trpc.audit.list.useQuery({ limit: 200 }, { refetchInterval: 30000 });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />Log de Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Histórico completo de eventos, failovers e alterações</p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <span className="text-xs text-muted-foreground">{logs?.length ?? 0} eventos registrados</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !logs?.length ? (
          <div className="p-12 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
            {logs?.map(log => {
              const Icon = typeIcons[log.type] ?? Info;
              const sc = severityColors[log.severity] ?? severityColors.info;
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", sc)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{log.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{typeLabels[log.type] ?? log.type}</span>
                    </div>
                    {log.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{log.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-muted-foreground/60">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ptBR })}</div>
                    <div className="text-[10px] text-muted-foreground/40 mt-0.5">{format(new Date(log.createdAt), "dd/MM HH:mm")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
