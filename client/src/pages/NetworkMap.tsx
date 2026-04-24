/// <reference types="@types/google.maps" />
import { useRef, useState, useEffect, useCallback } from "react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Link2,
  Network,
  MapPin,
  RefreshCw,
  Download,
  Wifi,
  Server,
  Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeType = "router" | "switch" | "olt" | "server" | "pop";
type LinkType = "fiber" | "radio" | "copper" | "vpn";

interface NetworkNode {
  id: number;
  name: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  nodeType: NodeType;
  mgmtIp: string | null;
  deviceId: number | null;
  active: boolean;
}

interface NetworkLink {
  id: number;
  fromNodeId: number;
  fromPortId: number | null;
  fromPortName: string | null;
  toNodeId: number;
  toPortId: number | null;
  toPortName: string | null;
  linkType: LinkType;
  capacityBps: number | null;
  active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function utilColor(pct: number): string {
  if (pct >= 80) return "#ef4444";
  if (pct >= 60) return "#f59e0b";
  return "#22c55e";
}

const NODE_ICONS: Record<NodeType, string> = {
  router: "🔷",
  switch: "🔵",
  olt: "🟢",
  server: "🖥️",
  pop: "📡",
};

// ─── Node Form ────────────────────────────────────────────────────────────────
interface NodeFormData {
  name: string;
  city: string;
  lat: string;
  lng: string;
  nodeType: NodeType;
  mgmtIp: string;
  deviceId: string;
}

const emptyNodeForm = (): NodeFormData => ({
  name: "",
  city: "",
  lat: "",
  lng: "",
  nodeType: "switch",
  mgmtIp: "",
  deviceId: "",
});

// ─── Link Form ────────────────────────────────────────────────────────────────
interface LinkFormData {
  fromNodeId: string;
  fromPortId: string;
  fromPortName: string;
  toNodeId: string;
  toPortId: string;
  toPortName: string;
  linkType: LinkType;
  capacityBps: string;
}

const emptyLinkForm = (): LinkFormData => ({
  fromNodeId: "",
  fromPortId: "",
  fromPortName: "",
  toNodeId: "",
  toPortId: "",
  toPortName: "",
  linkType: "fiber",
  capacityBps: "",
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NetworkMap() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const polylinesRef = useRef<Map<number, google.maps.Polyline>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "links">("nodes");

  // Node dialog
  const [nodeDialog, setNodeDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<NetworkNode | null>(null);
  const [nodeForm, setNodeForm] = useState<NodeFormData>(emptyNodeForm());

  // Link dialog
  const [linkDialog, setLinkDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<NetworkLink | null>(null);
  const [linkForm, setLinkForm] = useState<LinkFormData>(emptyLinkForm());

  // Import dialog
  const [importDialog, setImportDialog] = useState(false);

  // Data
  const { data: nodes = [], refetch: refetchNodes } = trpc.network.listNodes.useQuery();
  const { data: links = [], refetch: refetchLinks } = trpc.network.listLinks.useQuery();
  const { data: libreDevices = [] } = trpc.network.getLibreNMSDevices.useQuery(undefined, {
    enabled: importDialog,
  });

  // Mutations
  const createNode = trpc.network.createNode.useMutation({ onSuccess: () => { refetchNodes(); setNodeDialog(false); toast.success("Nó criado com sucesso"); } });
  const updateNode = trpc.network.updateNode.useMutation({ onSuccess: () => { refetchNodes(); setNodeDialog(false); toast.success("Nó atualizado"); } });
  const deleteNode = trpc.network.deleteNode.useMutation({ onSuccess: () => { refetchNodes(); refetchLinks(); toast.success("Nó removido"); } });
  const createLink = trpc.network.createLink.useMutation({ onSuccess: () => { refetchLinks(); setLinkDialog(false); toast.success("Link criado com sucesso"); } });
  const updateLink = trpc.network.updateLink.useMutation({ onSuccess: () => { refetchLinks(); setLinkDialog(false); toast.success("Link atualizado"); } });
  const deleteLink = trpc.network.deleteLink.useMutation({ onSuccess: () => { refetchLinks(); toast.success("Link removido"); } });

  // ─── Map rendering ──────────────────────────────────────────────────────────
  const renderMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    // Clear existing markers
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current.clear();

    // Clear existing polylines
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current.clear();

    if (!infoWindowRef.current) {
      infoWindowRef.current = new window.google.maps.InfoWindow();
    }

    // Draw nodes
    nodes.forEach((node) => {
      if (!node.lat || !node.lng) return;

      const el = document.createElement("div");
      el.style.cssText = `
        background: ${node.active ? "#1e293b" : "#374151"};
        border: 2px solid ${node.active ? "#3b82f6" : "#6b7280"};
        border-radius: 8px;
        padding: 4px 8px;
        color: white;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        white-space: nowrap;
      `;
      el.innerHTML = `${NODE_ICONS[node.nodeType as NodeType] || "🔵"} ${node.name}`;

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: node.lat, lng: node.lng },
        title: node.name,
        content: el,
      });

      marker.addListener("click", () => {
        const content = `
          <div style="font-family:sans-serif;min-width:180px;padding:4px">
            <div style="font-weight:700;font-size:14px;margin-bottom:6px">${NODE_ICONS[node.nodeType as NodeType]} ${node.name}</div>
            ${node.city ? `<div style="color:#6b7280;font-size:12px">📍 ${node.city}</div>` : ""}
            ${node.mgmtIp ? `<div style="font-size:12px">IP: <code>${node.mgmtIp}</code></div>` : ""}
            <div style="font-size:12px">Tipo: ${node.nodeType}</div>
            <div style="margin-top:4px">
              <span style="background:${node.active ? "#22c55e" : "#ef4444"};color:white;padding:2px 6px;border-radius:4px;font-size:11px">
                ${node.active ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        `;
        infoWindowRef.current!.setContent(content);
        infoWindowRef.current!.open(map, marker);
      });

      markersRef.current.set(node.id, marker);
    });

    // Draw links
    links.forEach((link) => {
      const fromNode = nodes.find((n) => n.id === link.fromNodeId);
      const toNode = nodes.find((n) => n.id === link.toNodeId);
      if (!fromNode?.lat || !fromNode?.lng || !toNode?.lat || !toNode?.lng) return;

      const linkColors: Record<LinkType, string> = {
        fiber: "#3b82f6",
        radio: "#f59e0b",
        copper: "#8b5cf6",
        vpn: "#06b6d4",
      };

      const polyline = new window.google.maps.Polyline({
        path: [
          { lat: fromNode.lat, lng: fromNode.lng },
          { lat: toNode.lat, lng: toNode.lng },
        ],
        geodesic: true,
        strokeColor: link.active ? linkColors[link.linkType] : "#6b7280",
        strokeOpacity: link.active ? 0.85 : 0.4,
        strokeWeight: link.active ? 3 : 2,
        map,
      });

      polyline.addListener("click", () => {
        const midLat = (fromNode.lat! + toNode.lat!) / 2;
        const midLng = (fromNode.lng! + toNode.lng!) / 2;
        const content = `
          <div style="font-family:sans-serif;min-width:200px;padding:4px">
            <div style="font-weight:700;font-size:13px;margin-bottom:6px">
              ${fromNode.name} → ${toNode.name}
            </div>
            <div style="font-size:12px">Tipo: <b>${link.linkType}</b></div>
            ${link.fromPortName ? `<div style="font-size:12px">Porta origem: ${link.fromPortName}</div>` : ""}
            ${link.toPortName ? `<div style="font-size:12px">Porta destino: ${link.toPortName}</div>` : ""}
            ${link.capacityBps ? `<div style="font-size:12px">Capacidade: ${formatBps(link.capacityBps)}</div>` : ""}
            <div style="margin-top:4px">
              <span style="background:${link.active ? "#22c55e" : "#ef4444"};color:white;padding:2px 6px;border-radius:4px;font-size:11px">
                ${link.active ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        `;
        infoWindowRef.current!.setContent(content);
        infoWindowRef.current!.open(map);
        infoWindowRef.current!.setPosition({ lat: midLat, lng: midLng });
      });

      polylinesRef.current.set(link.id, polyline);
    });

    // Fit bounds to all nodes with coordinates
    const nodesWithCoords = nodes.filter((n) => n.lat && n.lng);
    if (nodesWithCoords.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      nodesWithCoords.forEach((n) => bounds.extend({ lat: n.lat!, lng: n.lng! }));
      map.fitBounds(bounds, 60);
    }
  }, [nodes, links]);

  useEffect(() => {
    if (mapRef.current) renderMap();
  }, [nodes, links, renderMap]);

  // ─── Node handlers ──────────────────────────────────────────────────────────
  function openCreateNode() {
    setEditingNode(null);
    setNodeForm(emptyNodeForm());
    setNodeDialog(true);
  }

  function openEditNode(node: NetworkNode) {
    setEditingNode(node);
    setNodeForm({
      name: node.name,
      city: node.city || "",
      lat: node.lat?.toString() || "",
      lng: node.lng?.toString() || "",
      nodeType: node.nodeType,
      mgmtIp: node.mgmtIp || "",
      deviceId: node.deviceId?.toString() || "",
    });
    setNodeDialog(true);
  }

  function submitNode() {
    const payload = {
      name: nodeForm.name,
      city: nodeForm.city || undefined,
      lat: nodeForm.lat ? parseFloat(nodeForm.lat) : undefined,
      lng: nodeForm.lng ? parseFloat(nodeForm.lng) : undefined,
      nodeType: nodeForm.nodeType,
      mgmtIp: nodeForm.mgmtIp || undefined,
      deviceId: nodeForm.deviceId ? parseInt(nodeForm.deviceId) : undefined,
    };
    if (editingNode) {
      updateNode.mutate({ id: editingNode.id, ...payload });
    } else {
      createNode.mutate(payload);
    }
  }

  // ─── Link handlers ──────────────────────────────────────────────────────────
  function openCreateLink() {
    setEditingLink(null);
    setLinkForm(emptyLinkForm());
    setLinkDialog(true);
  }

  function openEditLink(link: NetworkLink) {
    setEditingLink(link);
    setLinkForm({
      fromNodeId: link.fromNodeId.toString(),
      fromPortId: link.fromPortId?.toString() || "",
      fromPortName: link.fromPortName || "",
      toNodeId: link.toNodeId.toString(),
      toPortId: link.toPortId?.toString() || "",
      toPortName: link.toPortName || "",
      linkType: link.linkType,
      capacityBps: link.capacityBps?.toString() || "",
    });
    setLinkDialog(true);
  }

  function submitLink() {
    const payload = {
      fromNodeId: parseInt(linkForm.fromNodeId),
      fromPortId: linkForm.fromPortId ? parseInt(linkForm.fromPortId) : undefined,
      fromPortName: linkForm.fromPortName || undefined,
      toNodeId: parseInt(linkForm.toNodeId),
      toPortId: linkForm.toPortId ? parseInt(linkForm.toPortId) : undefined,
      toPortName: linkForm.toPortName || undefined,
      linkType: linkForm.linkType,
      capacityBps: linkForm.capacityBps ? parseFloat(linkForm.capacityBps) : undefined,
    };
    if (editingLink) {
      updateLink.mutate({ id: editingLink.id, ...payload });
    } else {
      createLink.mutate(payload);
    }
  }

  // ─── Import from LibreNMS ────────────────────────────────────────────────────
  function importDevice(device: { deviceId: number; name: string; mgmtIp: string; location: string }) {
    const doCreate = (lat?: number, lng?: number) => {
      createNode.mutate({
        name: device.name,
        city: device.location || undefined,
        lat,
        lng,
        nodeType: "router",
        mgmtIp: device.mgmtIp,
        deviceId: device.deviceId,
      });
      toast.success(`${device.name} importado${lat ? " com localização" : " (sem coordenadas — edite manualmente)"}`);
    };
    // Tenta geocoding se o Google Maps já estiver carregado, caso contrário importa sem coordenadas
    if (window.google?.maps?.Geocoder) {
      const address = device.location || device.name;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: `${address}, Pernambuco, Brasil` }, (results, status) => {
        const lat = status === "OK" && results?.[0] ? results[0].geometry.location.lat() : undefined;
        const lng = status === "OK" && results?.[0] ? results[0].geometry.location.lng() : undefined;
        doCreate(lat, lng);
      });
    } else {
      doCreate();
    }
  }

  // ─── Geocode city for node form ──────────────────────────────────────────────
  function geocodeCity() {
    if (!nodeForm.city || !window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: `${nodeForm.city}, Pernambuco, Brasil` }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        setNodeForm((f) => ({
          ...f,
          lat: results[0].geometry.location.lat().toFixed(6),
          lng: results[0].geometry.location.lng().toFixed(6),
        }));
        toast.success("Coordenadas preenchidas automaticamente");
      } else {
        toast.error("Cidade não encontrada — preencha as coordenadas manualmente");
      }
    });
  }

  const nodesWithCoords = nodes.filter((n) => n.lat && n.lng);
  const center = nodesWithCoords.length > 0
    ? { lat: nodesWithCoords[0].lat!, lng: nodesWithCoords[0].lng! }
    : { lat: -8.89, lng: -36.49 }; // Garanhuns, PE

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Mapa de Rede</h1>
            <p className="text-xs text-muted-foreground">
              {nodes.length} nós · {links.length} links
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchNodes(); refetchLinks(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialog(true)}>
            <Download className="w-4 h-4 mr-1" /> Importar LibreNMS
          </Button>
          <Button size="sm" onClick={() => setSidebarOpen(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Gerenciar
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 bg-card/50 border-b border-border text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Links:</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-blue-500 inline-block" /> Fibra</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block" /> Rádio</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-purple-500 inline-block" /> Cobre</span>
        <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-cyan-500 inline-block" /> VPN</span>
        <span className="ml-4 font-semibold text-foreground">Nós:</span>
        <span>🔷 Roteador</span><span>🔵 Switch</span><span>🟢 OLT</span><span>🖥️ Servidor</span><span>📡 PoP</span>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: "calc(100vh - 130px)" }}>
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
            <div className="bg-card/90 border border-border rounded-xl p-6 text-center shadow-lg pointer-events-auto">
              <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold mb-1">Nenhum nó cadastrado</p>
              <p className="text-sm text-muted-foreground mb-4">Adicione switches e roteadores para visualizar a topologia</p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" onClick={openCreateNode}><Plus className="w-4 h-4 mr-1" /> Adicionar nó</Button>
                <Button size="sm" variant="outline" onClick={() => setImportDialog(true)}><Download className="w-4 h-4 mr-1" /> Importar LibreNMS</Button>
              </div>
            </div>
          </div>
        )}
        <div style={{ width: "100%", height: "100%" }}>
          <MapView
            className="w-full h-full"
            initialCenter={center}
            initialZoom={10}
            onMapReady={(map) => {
              mapRef.current = map;
              renderMap();
            }}
          />
        </div>
      </div>

      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Network className="w-4 h-4" /> Gerenciar Topologia
            </SheetTitle>
          </SheetHeader>

          <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "nodes" | "links")} className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="nodes" className="flex-1">
                <Server className="w-4 h-4 mr-1" /> Nós ({nodes.length})
              </TabsTrigger>
              <TabsTrigger value="links" className="flex-1">
                <Link2 className="w-4 h-4 mr-1" /> Links ({links.length})
              </TabsTrigger>
            </TabsList>

            {/* Nodes tab */}
            <TabsContent value="nodes" className="mt-4 space-y-2">
              <Button size="sm" className="w-full" onClick={openCreateNode}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar Nó
              </Button>
              {nodes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum nó cadastrado</p>
              )}
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
                  <span className="text-lg">{NODE_ICONS[node.nodeType as NodeType]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{node.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {node.city && <span>{node.city} · </span>}
                      {node.lat && node.lng ? (
                        <span className="text-green-500">📍 {node.lat.toFixed(4)}, {node.lng.toFixed(4)}</span>
                      ) : (
                        <span className="text-amber-500">⚠ Sem coordenadas</span>
                      )}
                    </div>
                  </div>
                  <Badge variant={node.active ? "default" : "secondary"} className="text-xs">
                    {node.active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditNode(node as NetworkNode)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                    if (confirm(`Remover "${node.name}" e todos os links associados?`)) deleteNode.mutate({ id: node.id });
                  }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </TabsContent>

            {/* Links tab */}
            <TabsContent value="links" className="mt-4 space-y-2">
              <Button size="sm" className="w-full" onClick={openCreateLink} disabled={nodes.length < 2}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar Link
              </Button>
              {nodes.length < 2 && (
                <p className="text-xs text-muted-foreground text-center">Cadastre pelo menos 2 nós para criar links</p>
              )}
              {links.length === 0 && nodes.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum link cadastrado</p>
              )}
              {links.map((link) => {
                const fromNode = nodes.find((n) => n.id === link.fromNodeId);
                const toNode = nodes.find((n) => n.id === link.toNodeId);
                const linkColors: Record<LinkType, string> = { fiber: "bg-blue-500", radio: "bg-amber-500", copper: "bg-purple-500", vpn: "bg-cyan-500" };
                return (
                  <div key={link.id} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
                    <span className={`w-2 h-2 rounded-full ${linkColors[link.linkType as LinkType]} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {fromNode?.name || "?"} → {toNode?.name || "?"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {link.linkType}
                        {link.fromPortName && ` · ${link.fromPortName}`}
                        {link.toPortName && ` → ${link.toPortName}`}
                        {link.capacityBps && ` · ${formatBps(link.capacityBps)}`}
                      </div>
                    </div>
                    <Badge variant={link.active ? "default" : "secondary"} className="text-xs">
                      {link.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLink(link as NetworkLink)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                      if (confirm("Remover este link?")) deleteLink.mutate({ id: link.id });
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* ─── Node Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={nodeDialog} onOpenChange={setNodeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingNode ? "Editar Nó" : "Adicionar Nó"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nodeForm.name} onChange={(e) => setNodeForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: SW-GARANHUNS-01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={nodeForm.nodeType} onValueChange={(v) => setNodeForm((f) => ({ ...f, nodeType: v as NodeType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="router">🔷 Roteador</SelectItem>
                    <SelectItem value="switch">🔵 Switch</SelectItem>
                    <SelectItem value="olt">🟢 OLT</SelectItem>
                    <SelectItem value="server">🖥️ Servidor</SelectItem>
                    <SelectItem value="pop">📡 PoP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>IP de Gerência</Label>
                <Input value={nodeForm.mgmtIp} onChange={(e) => setNodeForm((f) => ({ ...f, mgmtIp: e.target.value }))} placeholder="192.168.1.1" />
              </div>
            </div>
            <div>
              <Label>Cidade</Label>
              <div className="flex gap-2">
                <Input value={nodeForm.city} onChange={(e) => setNodeForm((f) => ({ ...f, city: e.target.value }))} placeholder="Ex: Garanhuns" />
                <Button type="button" variant="outline" size="sm" onClick={geocodeCity} title="Buscar coordenadas pela cidade">
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitude</Label>
                <Input value={nodeForm.lat} onChange={(e) => setNodeForm((f) => ({ ...f, lat: e.target.value }))} placeholder="-8.890" />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input value={nodeForm.lng} onChange={(e) => setNodeForm((f) => ({ ...f, lng: e.target.value }))} placeholder="-36.490" />
              </div>
            </div>
            <div>
              <Label>Device ID LibreNMS</Label>
              <Input value={nodeForm.deviceId} onChange={(e) => setNodeForm((f) => ({ ...f, deviceId: e.target.value }))} placeholder="1" type="number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialog(false)}>Cancelar</Button>
            <Button onClick={submitNode} disabled={!nodeForm.name || createNode.isPending || updateNode.isPending}>
              {editingNode ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Link Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Editar Link" : "Adicionar Link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nó de Origem *</Label>
                <Select value={linkForm.fromNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, fromNodeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nó de Destino *</Label>
                <Select value={linkForm.toNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, toNodeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Porta Origem</Label>
                <Input value={linkForm.fromPortName} onChange={(e) => setLinkForm((f) => ({ ...f, fromPortName: e.target.value }))} placeholder="Ex: GE0/0/1" />
              </div>
              <div>
                <Label>Porta Destino</Label>
                <Input value={linkForm.toPortName} onChange={(e) => setLinkForm((f) => ({ ...f, toPortName: e.target.value }))} placeholder="Ex: GE0/0/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Port ID Origem (LibreNMS)</Label>
                <Input value={linkForm.fromPortId} onChange={(e) => setLinkForm((f) => ({ ...f, fromPortId: e.target.value }))} placeholder="Ex: 42" type="number" />
              </div>
              <div>
                <Label>Port ID Destino (LibreNMS)</Label>
                <Input value={linkForm.toPortId} onChange={(e) => setLinkForm((f) => ({ ...f, toPortId: e.target.value }))} placeholder="Ex: 55" type="number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Link</Label>
                <Select value={linkForm.linkType} onValueChange={(v) => setLinkForm((f) => ({ ...f, linkType: v as LinkType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fiber">Fibra Óptica</SelectItem>
                    <SelectItem value="radio">Rádio</SelectItem>
                    <SelectItem value="copper">Cobre</SelectItem>
                    <SelectItem value="vpn">VPN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Capacidade (bps)</Label>
                <Input value={linkForm.capacityBps} onChange={(e) => setLinkForm((f) => ({ ...f, capacityBps: e.target.value }))} placeholder="Ex: 1000000000" type="number" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Cancelar</Button>
            <Button onClick={submitLink} disabled={!linkForm.fromNodeId || !linkForm.toNodeId || createLink.isPending || updateLink.isPending}>
              {editingLink ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Import Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Importar do LibreNMS
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Selecione os dispositivos para importar. As coordenadas serão buscadas automaticamente pela localização cadastrada no LibreNMS.
          </p>
          {libreDevices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando dispositivos...</p>
          )}
          <div className="space-y-2">
            {libreDevices.map((device) => {
              const alreadyImported = nodes.some((n) => n.deviceId === device.deviceId);
              return (
                <div key={device.deviceId} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{device.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {device.mgmtIp} {device.location && `· ${device.location}`}
                    </div>
                  </div>
                  <Badge variant={device.online ? "default" : "secondary"} className="text-xs">
                    {device.online ? "Online" : "Offline"}
                  </Badge>
                  {alreadyImported ? (
                    <Badge variant="outline" className="text-xs">Importado</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => importDevice(device)}>
                      <Plus className="w-3 h-3 mr-1" /> Importar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
