import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Plus, Trash2, Edit, Shield, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function UsersManagement() {
  const { user: me, isAdmin } = useLocalAuth();
  const utils = trpc.useUtils();
  const { data: users } = trpc.users.list.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ username: "", password: "", name: "", email: "", role: "viewer" as "admin" | "viewer" });

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => { toast.success("Usuário criado"); utils.users.list.invalidate(); setShowCreate(false); setForm({ username: "", password: "", name: "", email: "", role: "viewer" }); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => { toast.success("Usuário atualizado"); utils.users.list.invalidate(); setEditUser(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => { toast.success("Usuário removido"); utils.users.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div><h1 className="text-xl font-semibold text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Usuários</h1><p className="text-sm text-muted-foreground mt-0.5">Gerenciar contas de acesso ao sistema</p></div>
        {isAdmin && <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" />Novo Usuário</Button>}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: "oklch(0.13 0.012 260)", borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="divide-y" style={{ borderColor: "oklch(0.18 0.012 260)" }}>
          {!users?.length ? (
            <div className="text-center py-12"><Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p></div>
          ) : users?.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold" style={{ background: "oklch(0.55 0.20 255 / 0.15)", color: "oklch(0.72 0.16 255)" }}>{u.username[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{u.name || u.username}</span>
                  <span className="text-xs font-mono text-muted-foreground">@{u.username}</span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {u.role === "admin" ? <Shield className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                    {u.role === "admin" ? "Admin" : "Viewer"}
                  </span>
                  {!u.active && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Inativo</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                  {u.lastSignedIn && <span className="text-xs text-muted-foreground">Último acesso: {formatDistanceToNow(new Date(u.lastSignedIn), { addSuffix: true, locale: ptBR })}</span>}
                </div>
              </div>
              {isAdmin && u.id !== me?.id && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => setEditUser(u)}><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10" onClick={() => { if (confirm("Remover usuário?")) deleteMutation.mutate({ id: u.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {[{ k: "username", l: "Usuário", p: "john.doe" }, { k: "password", l: "Senha", p: "", t: "password" }, { k: "name", l: "Nome completo", p: "João Silva" }, { k: "email", l: "E-mail", p: "joao@empresa.com" }].map(f => (
              <div key={f.k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{f.l}</Label><Input type={f.t || "text"} value={(form as any)[f.k]} onChange={e => setForm(x => ({ ...x, [f.k]: e.target.value }))} placeholder={f.p} className="h-9 bg-input border-border text-sm" /></div>
            ))}
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Perfil</Label>
              <Select value={form.role} onValueChange={(v: any) => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9 bg-input border-border text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border"><SelectItem value="viewer">Viewer (somente leitura)</SelectItem><SelectItem value="admin">Admin (acesso total)</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="w-full">{createMutation.isPending ? "Criando..." : "Criar Usuário"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4 pt-2">
              {[{ k: "name", l: "Nome completo", p: "João Silva" }, { k: "email", l: "E-mail", p: "joao@empresa.com" }].map(f => (
                <div key={f.k} className="space-y-1.5"><Label className="text-xs text-muted-foreground">{f.l}</Label><Input value={editUser[f.k] ?? ""} onChange={e => setEditUser((u: any) => ({ ...u, [f.k]: e.target.value }))} placeholder={f.p} className="h-9 bg-input border-border text-sm" /></div>
              ))}
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Nova Senha (deixe em branco para manter)</Label><Input type="password" value={editUser.newPassword ?? ""} onChange={e => setEditUser((u: any) => ({ ...u, newPassword: e.target.value }))} placeholder="••••••••" className="h-9 bg-input border-border text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Perfil</Label>
                <Select value={editUser.role} onValueChange={v => setEditUser((u: any) => ({ ...u, role: v }))}>
                  <SelectTrigger className="h-9 bg-input border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border"><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                </Select>
              </div>
              <Button onClick={() => updateMutation.mutate({ id: editUser.id, name: editUser.name, email: editUser.email, role: editUser.role, password: editUser.newPassword || undefined })} disabled={updateMutation.isPending} className="w-full">{updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
