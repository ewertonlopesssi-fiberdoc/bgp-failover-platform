import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Network, Lock, User, Shield } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("Login realizado com sucesso");
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Credenciais inválidas");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { toast.error("Preencha todos os campos"); return; }
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: "linear-gradient(135deg, oklch(0.08 0.01 260) 0%, oklch(0.12 0.025 255) 100%)" }}>
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(oklch(0.8 0.1 255) 1px, transparent 1px), linear-gradient(90deg, oklch(0.8 0.1 255) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10 blur-3xl"
          style={{ background: "oklch(0.55 0.20 255)" }} />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-8 blur-3xl"
          style={{ background: "oklch(0.60 0.18 145)" }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.55 0.20 255 / 0.2)", border: "1px solid oklch(0.55 0.20 255 / 0.3)" }}>
              <Network className="w-5 h-5" style={{ color: "oklch(0.75 0.15 255)" }} />
            </div>
            <span className="text-sm font-medium text-muted-foreground tracking-widest uppercase">BGP Failover</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-light text-foreground leading-tight mb-3">
              Monitoramento<br />
              <span style={{ color: "oklch(0.75 0.15 255)" }}>Inteligente</span><br />
              de Roteamento
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
              Plataforma de gerenciamento BGP com failover automático, monitoramento de latência e notificações em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Operadoras", value: "3" },
              { label: "Uptime", value: "99.9%" },
              { label: "Failover", value: "Auto" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-4"
                style={{ background: "oklch(0.13 0.015 260 / 0.8)", border: "1px solid oklch(0.25 0.015 260 / 0.5)" }}>
                <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Acesso seguro com autenticação JWT</span>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.55 0.20 255 / 0.15)", border: "1px solid oklch(0.55 0.20 255 / 0.3)" }}>
              <Network className="w-5 h-5" style={{ color: "oklch(0.75 0.15 255)" }} />
            </div>
            <span className="font-semibold text-foreground">BGP Failover Platform</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-1">Bem-vindo</h2>
            <p className="text-sm text-muted-foreground">Entre com suas credenciais para acessar o painel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium text-foreground">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 h-11 bg-card border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 h-11 bg-card border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11 font-medium" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : "Entrar"}
            </Button>
          </form>

          <div className="mt-8 p-4 rounded-xl" style={{ background: "oklch(0.13 0.012 260)", border: "1px solid oklch(0.22 0.015 260)" }}>
            <p className="text-xs text-muted-foreground text-center">
              Primeiro acesso? Use <span className="text-foreground font-mono">admin</span> / <span className="text-foreground font-mono">admin123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
