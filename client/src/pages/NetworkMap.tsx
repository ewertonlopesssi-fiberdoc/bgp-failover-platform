import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useRef, useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
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
  Server,
  Radio,
} from "lucide-react";

// ─── Fix Leaflet default icon URLs (broken with Vite/webpack) ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

const NODE_COLORS: Record<NodeType, string> = {
  router: "#3b82f6",   // blue
  switch: "#22c55e",   // green
  olt: "#f97316",      // orange
  server: "#a855f7",   // purple
  pop: "#06b6d4",      // cyan
};

const NODE_ICONS: Record<NodeType, string> = {
  router: "🔷",
  switch: "🔵",
  olt: "🟢",
  server: "🖥️",
  pop: "📡",
};

const LINK_COLORS: Record<LinkType, string> = {
  fiber: "#3b82f6",
  radio: "#f59e0b",
  copper: "#8b5cf6",
  vpn: "#06b6d4",
};

// ─── Custom Leaflet icon factory ──────────────────────────────────────────────
function makeNodeIcon(node: NetworkNode): L.DivIcon {
  const color = node.active ? NODE_COLORS[node.nodeType] : "#6b7280";
  const emoji = NODE_ICONS[node.nodeType] || "🔵";
  return L.divIcon({
    className: "",
    iconAnchor: [0, 0],
    popupAnchor: [0, -8],
    html: `
      <div style="
        background: ${node.active ? "#1e293b" : "#374151"};
        border: 2px solid ${color};
        border-radius: 8px;
        padding: 3px 8px;
        color: white;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        white-space: nowrap;
        user-select: none;
      ">${emoji} ${node.name}</div>
    `,
  });
}

// ─── MapFitBounds: adjusts bounds when nodes change ──────────────────────────
function MapFitBounds({ nodes }: { nodes: NetworkNode[] }) {
  const map = useMap();
  useEffect(() => {
    const withCoords = nodes.filter((n) => n.lat && n.lng);
    if (withCoords.length === 0) return;
    if (withCoords.length === 1) {
      map.setView([withCoords[0].lat!, withCoords[0].lng!], 12);
    } else {
      const bounds = L.latLngBounds(withCoords.map((n) => [n.lat!, n.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [nodes, map]);
  return null;
}

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
    // Geocode via Nominatim (OpenStreetMap free geocoder — no API key required)
    const address = device.location || device.name;
    const query = encodeURIComponent(`${address}, Pernambuco, Brasil`);
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`)
      .then((r) => r.json())
      .then((results) => {
        const lat = results[0] ? parseFloat(results[0].lat) : undefined;
        const lng = results[0] ? parseFloat(results[0].lon) : undefined;
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
      })
      .catch(() => {
        createNode.mutate({
          name: device.name,
          city: device.location || undefined,
          nodeType: "router",
          mgmtIp: device.mgmtIp,
          deviceId: device.deviceId,
        });
        toast.success(`${device.name} importado (sem coordenadas — edite manualmente)`);
      });
  }

  // ─── Geocode city for node form (via Nominatim) ──────────────────────────────
  function geocodeCity() {
    if (!nodeForm.city) return;
    const query = encodeURIComponent(`${nodeForm.city}, Pernambuco, Brasil`);
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`)
      .then((r) => r.json())
      .then((results) => {
        if (results[0]) {
          setNodeForm((f) => ({
            ...f,
            lat: parseFloat(results[0].lat).toFixed(6),
            lng: parseFloat(results[0].lon).toFixed(6),
          }));
          toast.success("Coordenadas preenchidas automaticamente");
        } else {
          toast.error("Cidade não encontrada — preencha as coordenadas manualmente");
        }
      })
      .catch(() => toast.error("Erro ao buscar coordenadas"));
  }

  // ─── Derived values ──────────────────────────────────────────────────────────
  const nodesWithCoords = nodes.filter((n) => n.lat && n.lng);
  const defaultCenter: [number, number] = [-8.89, -36.49]; // Garanhuns, PE

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
      <div className="relative flex-1" style={{ minHeight: "400px" }}>
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[1000] pointer-events-none">
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

        <MapContainer
          center={defaultCenter}
          zoom={9}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fit bounds when nodes change */}
          {nodesWithCoords.length > 0 && <MapFitBounds nodes={nodesWithCoords as NetworkNode[]} />}

          {/* Draw links (polylines) */}
          {links.map((link) => {
            const fromNode = nodes.find((n) => n.id === link.fromNodeId);
            const toNode = nodes.find((n) => n.id === link.toNodeId);
            if (!fromNode?.lat || !fromNode?.lng || !toNode?.lat || !toNode?.lng) return null;
            const color = link.active ? LINK_COLORS[link.linkType as LinkType] : "#6b7280";
            const positions: [number, number][] = [
              [fromNode.lat, fromNode.lng],
              [toNode.lat, toNode.lng],
            ];
            return (
              <Polyline
                key={link.id}
                positions={positions}
                pathOptions={{
                  color,
                  weight: link.active ? 3 : 2,
                  opacity: link.active ? 0.85 : 0.4,
                  dashArray: link.active ? undefined : "6 4",
                }}
              >
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      {fromNode.name} → {toNode.name}
                    </div>
                    <div style={{ fontSize: 12 }}>Tipo: <b>{link.linkType}</b></div>
                    {link.fromPortName && <div style={{ fontSize: 12 }}>Porta origem: {link.fromPortName}</div>}
                    {link.toPortName && <div style={{ fontSize: 12 }}>Porta destino: {link.toPortName}</div>}
                    {link.capacityBps && <div style={{ fontSize: 12 }}>Capacidade: {formatBps(link.capacityBps)}</div>}
                    <div style={{ marginTop: 4 }}>
                      <span style={{ background: link.active ? "#22c55e" : "#ef4444", color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                        {link.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* Draw nodes (markers) */}
          {nodesWithCoords.map((node) => (
            <Marker
              key={node.id}
              position={[node.lat!, node.lng!]}
              icon={makeNodeIcon(node as NetworkNode)}
            >
              <Popup>
                <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                    {NODE_ICONS[node.nodeType as NodeType]} {node.name}
                  </div>
                  {node.city && <div style={{ color: "#6b7280", fontSize: 12 }}>📍 {node.city}</div>}
                  {node.mgmtIp && <div style={{ fontSize: 12 }}>IP: <code>{node.mgmtIp}</code></div>}
                  <div style={{ fontSize: 12 }}>Tipo: {node.nodeType}</div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ background: node.active ? "#22c55e" : "#ef4444", color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                      {node.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
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
                const linkColorClasses: Record<LinkType, string> = { fiber: "bg-blue-500", radio: "bg-amber-500", copper: "bg-purple-500", vpn: "bg-cyan-500" };
                return (
                  <div key={link.id} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
                    <span className={`w-2 h-2 rounded-full ${linkColorClasses[link.linkType as LinkType]} flex-shrink-0`} />
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
              <Label>Device ID (LibreNMS)</Label>
              <Input value={nodeForm.deviceId} onChange={(e) => setNodeForm((f) => ({ ...f, deviceId: e.target.value }))} placeholder="Ex: 42" type="number" />
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
                <Label>Nó Origem *</Label>
                <Select value={linkForm.fromNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, fromNodeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nó Destino *</Label>
                <Select value={linkForm.toNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, toNodeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
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
