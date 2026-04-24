import { useState } from "react";
import { BarChart2, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const LIBRENMS_URL = "http://45.237.165.251:8080";

export default function TrafficAnalysis() {
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleReload = () => {
    setLoading(true);
    setError(false);
    setIframeKey((k) => k + 1);
  };

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: "oklch(0.18 0.015 260)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.55 0.20 255 / 0.15)", border: "1px solid oklch(0.55 0.20 255 / 0.25)" }}>
            <BarChart2 className="w-4 h-4" style={{ color: "oklch(0.72 0.16 255)" }} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Análise de Tráfego</h1>
            <p className="text-xs text-muted-foreground">LibreNMS — monitoramento SNMP e gráficos de tráfego</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReload}
            className="gap-2 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(LIBRENMS_URL, "_blank")}
            className="gap-2 text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em nova aba
          </Button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading overlay */}
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
            style={{ background: "oklch(0.10 0.015 260)" }}>
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Carregando LibreNMS...</p>
              <p className="text-xs text-muted-foreground mt-1">Conectando a {LIBRENMS_URL}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
            style={{ background: "oklch(0.10 0.015 260)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "oklch(0.45 0.20 25 / 0.15)", border: "1px solid oklch(0.45 0.20 25 / 0.3)" }}>
              <AlertCircle className="w-6 h-6" style={{ color: "oklch(0.65 0.20 25)" }} />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-sm font-medium text-foreground">Não foi possível carregar o LibreNMS</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Verifique se o serviço está ativo em{" "}
                <span className="font-mono text-primary">{LIBRENMS_URL}</span>
              </p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" onClick={handleReload} className="gap-2 text-xs">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(LIBRENMS_URL, "_blank")}
                  className="gap-2 text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir diretamente
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* LibreNMS iframe */}
        <iframe
          key={iframeKey}
          src={LIBRENMS_URL}
          title="LibreNMS — Análise de Tráfego"
          className="w-full h-full border-0"
          style={{ minHeight: "calc(100vh - 120px)" }}
          onLoad={handleLoad}
          onError={handleError}
          allow="fullscreen"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
