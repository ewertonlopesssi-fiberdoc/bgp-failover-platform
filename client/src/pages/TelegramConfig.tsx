import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MessageSquare, Save, ExternalLink, Bell, Send } from "lucide-react";

export default function TelegramConfig() {
  const { isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: config } = trpc.telegram.get.useQuery();
  const [form, setForm] = useState({ botToken: "", chatId: "", enabled: false, notifyFailover: true, notifyRecovery: true, notifyHighLatency: true, notifyBgpDown: true });

  useEffect(() => {
    if (config) setForm({ botToken: "", chatId: config.chatId ?? "", enabled: config.enabled, notifyFailover: config.notifyFailover, notifyRecovery: config.notifyRecovery, notifyHighLatency: config.notifyHighLatency, notifyBgpDown: config.notifyBgpDown });
  }, [config]);

  const testMutation = trpc.telegram.sendTest.useMutation({
    onSuccess: () => toast.success("✅ Mensagem de teste enviada com sucesso! Verifique o Telegram."),
    onError: (e) => toast.error(`Falha no teste: ${e.message}`),
  });
  const saveMutation = trpc.telegram.save.useMutation({
    onSuccess: () => { toast.success("Configuração Telegram salva"); utils.telegram.get.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const notifs = [
    { key: "notifyFailover", label: "Failover acionado", desc: "Quando uma operadora entra em failover" },
    { key: "notifyRecovery", label: "Recuperação", desc: "Quando o serviço se recupera" },
    { key: "notifyHighLatency", label: "Latência alta", desc: "Quando latência excede o limite" },
    { key: "notifyBgpDown", label: "BGP offline", desc: "Quando uma sessão BGP cai" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-5 h-5 text-primary" />Notificações Telegram</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure o bot para receber alertas em tempo real</p>
      </div>
      <div className="rounded-xl border p-5" style={{ background: "oklch(0.55 0.20 255 / 0.05)", borderColor: "oklch(0.55 0.20 255 / 0.2)" }}>
        <p className="text-sm font-medium text-foreground mb-2">Como configurar</p>
        <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
          <li>Abra o Telegram e busque por <span className="font-mono text-foreground">@BotFather</span></li>
          <li>Envie <span className="font-mono text-foreground">/newbot</span> e siga as instruções</li>
          <li>Copie o token gerado e cole abaixo</li>
          <li>Adicione o bot ao seu grupo e obtenha o Chat ID</li>
        </ol>
        <a href="https://core.telegram.org/bots" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary mt-3 hover:underline"><ExternalLink className="w-3 h-3" />Documentação oficial</a>
      </div>
      <div className="rounded-xl border p-6 space-y-5" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-semibold text-foreground">Ativar Notificações</p><p className="text-xs text-muted-foreground mt-0.5">Habilitar envio de alertas via Telegram</p></div>
          <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} disabled={!isAdmin} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Bot Token</Label><Input value={form.botToken} onChange={e => setForm(f => ({ ...f, botToken: e.target.value }))} placeholder={config?.botToken ? "Token salvo (oculto)" : "1234567890:ABC..."} type="password" className="h-9 bg-input border-border text-sm" disabled={!isAdmin} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Chat ID</Label><Input value={form.chatId} onChange={e => setForm(f => ({ ...f, chatId: e.target.value }))} placeholder="-1001234567890" className="h-9 bg-input border-border text-sm" disabled={!isAdmin} /></div>
        </div>
        <div className="border-t pt-5" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"><Bell className="w-4 h-4 text-primary" />Tipos de Notificação</p>
          <div className="space-y-3">
            {notifs.map(n => (
              <div key={n.key} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.11 0.01 260)" }}>
                <div><p className="text-sm font-medium text-foreground">{n.label}</p><p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p></div>
                <Switch checked={(form as any)[n.key]} onCheckedChange={v => setForm(f => ({ ...f, [n.key]: v }))} disabled={!isAdmin} />
              </div>
            ))}
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} size="sm" className="gap-2">
              <Save className="w-3.5 h-3.5" />{saveMutation.isPending ? "Salvando..." : "Salvar Configuração"}
            </Button>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !config?.botToken || !config?.chatId}
              size="sm"
              variant="outline"
              className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 bg-transparent"
            >
              <Send className="w-3.5 h-3.5" />
              {testMutation.isPending ? "Enviando..." : "Testar Envio"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
