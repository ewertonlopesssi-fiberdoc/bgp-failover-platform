import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";

// ─── InvalidateSize: forces Leaflet to recalculate tile layout after mount ────
function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    const t3 = setTimeout(() => map.invalidateSize(), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [map]);
  return null;
}
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
  Eye,
  EyeOff,
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
  useRoadRoute: boolean;
  routePoints: Array<[number, number]> | null;
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

// ─── Utilization color helper ─────────────────────────────────────────────────
function utilColor(pct: number): string {
  if (pct > 80) return "#ef4444";
  if (pct > 50) return "#f59e0b";
  return "#22c55e";
}

// ─── Custom circular Leaflet icon (LibreNMS-style) ────────────────────────────
function makeNodeIcon(
  node: NetworkNode,
  utilPct: number | null,
  showLabel: boolean
): L.DivIcon {
  // Color ring: red if util>80, orange if util>50, green otherwise. Gray if inactive.
  const ringColor = !node.active
    ? "#6b7280"
    : utilPct !== null
    ? utilColor(utilPct)
    : "#22c55e"; // default green when no traffic data

  // Inner circle color (slightly darker)
  const innerColor = !node.active ? "#374151" : "#dc2626"; // red inner like LibreNMS

  // Halo (outer glow) color
  const haloColor = ringColor + "55"; // 33% opacity

  const size = 28;
  const haloSize = size + 16;

  const labelHtml = showLabel
    ? `<div style="
        position: absolute;
        top: ${haloSize / 2 + 2}px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 11px;
        font-weight: 700;
        color: #1e293b;
        text-shadow: 0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 3px white;
        pointer-events: none;
        letter-spacing: 0.01em;
      ">${node.name}</div>`
    : "";

  return L.divIcon({
    className: "",
    iconSize: [haloSize, haloSize + (showLabel ? 18 : 0)],
    iconAnchor: [haloSize / 2, haloSize / 2],
    popupAnchor: [0, -haloSize / 2 - 4],
    html: `
      <div style="position: relative; width: ${haloSize}px; height: ${haloSize}px; cursor: pointer;">
        <!-- Halo glow -->
        <div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: ${haloColor};
          animation: none;
        "></div>
        <!-- Outer ring -->
        <div style="
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: ${size + 6}px; height: ${size + 6}px;
          border-radius: 50%;
          background: ${ringColor};
          display: flex; align-items: center; justify-content: center;
        ">
          <!-- Inner circle -->
          <div style="
            width: ${size}px; height: ${size}px;
            border-radius: 50%;
            background: ${innerColor};
            border: 2px solid rgba(255,255,255,0.3);
            display: flex; align-items: center; justify-content: center;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
          ">
            <!-- Switch icon (horizontal lines) -->
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect x="0" y="1" width="16" height="2" rx="1" fill="white" opacity="0.9"/>
              <rect x="0" y="5" width="16" height="2" rx="1" fill="white" opacity="0.9"/>
              <rect x="0" y="9" width="16" height="2" rx="1" fill="white" opacity="0.9"/>
            </svg>
          </div>
        </div>
        ${labelHtml}
      </div>
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
      map.fitBounds(bounds, { padding: [60, 60] });
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
  name: "", city: "", lat: "", lng: "", nodeType: "switch", mgmtIp: "", deviceId: "",
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
  useRoadRoute: boolean;
}
const emptyLinkForm = (): LinkFormData => ({
  fromNodeId: "", fromPortId: "", fromPortName: "",
  toNodeId: "", toPortId: "", toPortName: "",
  linkType: "fiber", capacityBps: "", useRoadRoute: true, // default ON
});

// ─── OSRM route fetcher ───────────────────────────────────────────────────────
async function fetchOsrmRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): Promise<Array<[number, number]> | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    const data = await resp.json() as {
      routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }>;
    };
    if (data.routes?.[0]) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NetworkMap() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "links">("nodes");
  const [showLabels, setShowLabels] = useState(true);

  // Node dialog
  const [nodeDialog, setNodeDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<NetworkNode | null>(null);
  const [nodeForm, setNodeForm] = useState<NodeFormData>(emptyNodeForm());

  // Link dialog
  const [linkDialog, setLinkDialog] = useState(false);
  const [editingLink, setEditingLink] = useState<NetworkLink | null>(null);
  const [linkForm, setLinkForm] = useState<LinkFormData>(emptyLinkForm());
  const [capacityUnit, setCapacityUnit] = useState<"mbps" | "gbps">("mbps");
  const [capacityValue, setCapacityValue] = useState("");

  // Import dialog
  const [importDialog, setImportDialog] = useState(false);

  // Hover state for link traffic box
  const [hoveredLinkId, setHoveredLinkId] = useState<number | null>(null);
  const [hoveredLinkPos, setHoveredLinkPos] = useState<{ x: number; y: number } | null>(null);

  // Data
  const { data: nodes = [], refetch: refetchNodes } = trpc.network.listNodes.useQuery();
  const { data: links = [], refetch: refetchLinks } = trpc.network.listLinks.useQuery();
  const { data: libreDevices = [] } = trpc.network.getLibreNMSDevices.useQuery(undefined, {
    enabled: importDialog,
  });

  // Ports for link dialog (fetched when a node with deviceId is selected)
  const fromNodeObj = nodes.find((n) => n.id.toString() === linkForm.fromNodeId);
  const toNodeObj = nodes.find((n) => n.id.toString() === linkForm.toNodeId);
  const { data: fromPorts = [] } = trpc.network.getDevicePorts.useQuery(
    { deviceId: fromNodeObj?.deviceId ?? 0 },
    { enabled: linkDialog && !!fromNodeObj?.deviceId }
  );
  const { data: toPorts = [] } = trpc.network.getDevicePorts.useQuery(
    { deviceId: toNodeObj?.deviceId ?? 0 },
    { enabled: linkDialog && !!toNodeObj?.deviceId }
  );

  // Traffic query for ALL active links (for utilization-based coloring)
  const allLinkPortIds = useMemo(() => {
    const ids = new Set<number>();
    links.forEach((l) => {
      if (l.active && l.fromPortId) ids.add(l.fromPortId);
    });
    return Array.from(ids);
  }, [links]);
  const { data: linksTrafficData } = trpc.network.getLinksTraffic.useQuery(
    { portIds: allLinkPortIds },
    { enabled: allLinkPortIds.length > 0, refetchInterval: 10000 }
  );

  // Traffic query for hovered link — only fromPortId (port of origin device)
  const hoveredLink = links.find((l) => l.id === hoveredLinkId);
  const hoveredFromPortId = hoveredLink?.fromPortId ?? null;
  const { data: fromPortTraffic, isLoading: trafficLoading, isFetching: trafficFetching } = trpc.network.getPortTraffic.useQuery(
    { portId: hoveredFromPortId! },
    { enabled: !!hoveredFromPortId, refetchInterval: 5000 }
  );

  // Per-node utilization (max of all links from that node)
  const nodeUtilMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (!linksTrafficData) return map;
    links.forEach((l) => {
      if (!l.active || !l.fromPortId) return;
      const td = linksTrafficData[l.fromPortId];
      if (!td) return;
      const capBps = l.capacityBps ?? td.speedBps;
      if (capBps <= 0) return;
      const pct = (Math.max(td.inBps, td.outBps) / capBps) * 100;
      // Assign to fromNode (highest util wins)
      if ((map[l.fromNodeId] ?? 0) < pct) map[l.fromNodeId] = pct;
      if ((map[l.toNodeId] ?? 0) < pct) map[l.toNodeId] = pct;
    });
    return map;
  }, [linksTrafficData, links]);

  // Mutations
  const createNode = trpc.network.createNode.useMutation({
    onSuccess: () => { refetchNodes(); setNodeDialog(false); toast.success("Nó criado com sucesso"); },
    onError: (err) => { toast.error(`Erro ao criar nó: ${err.message}`); },
  });
  const updateNode = trpc.network.updateNode.useMutation({
    onSuccess: () => { refetchNodes(); setNodeDialog(false); toast.success("Nó atualizado com sucesso"); },
    onError: (err) => { toast.error(`Erro ao salvar nó: ${err.message}`); },
  });
  const deleteNode = trpc.network.deleteNode.useMutation({ onSuccess: () => { refetchNodes(); refetchLinks(); toast.success("Nó removido"); } });
  const createLink = trpc.network.createLink.useMutation({
    onSuccess: () => { refetchLinks(); setLinkDialog(false); toast.success("Link criado com sucesso"); },
    onError: (err) => toast.error(`Erro ao criar link: ${err.message}`),
  });
  const updateLink = trpc.network.updateLink.useMutation({
    onSuccess: () => { refetchLinks(); setLinkDialog(false); toast.success("Link atualizado"); },
    onError: (err) => toast.error(`Erro ao atualizar link: ${err.message}`),
  });
  const deleteLink = trpc.network.deleteLink.useMutation({ onSuccess: () => { refetchLinks(); toast.success("Link removido"); } });

  // ─── Node CRUD ──────────────────────────────────────────────────────────────
  function openCreateNode() {
    setEditingNode(null);
    setNodeForm(emptyNodeForm());
    setNodeDialog(true);
  }
  function openEditNode(node: NetworkNode) {
    setEditingNode(node);
    setNodeForm({
      name: node.name,
      city: node.city ?? "",
      lat: node.lat?.toString() ?? "",
      lng: node.lng?.toString() ?? "",
      nodeType: node.nodeType,
      mgmtIp: node.mgmtIp ?? "",
      deviceId: node.deviceId?.toString() ?? "",
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
      active: true,
    };
    if (editingNode) {
      updateNode.mutate({ id: editingNode.id, ...payload });
    } else {
      createNode.mutate(payload);
    }
  }

  // ─── Geocode city ───────────────────────────────────────────────────────────
  const geocodeCity = useCallback(() => {
    const city = nodeForm.city;
    if (!city) return;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", Pernambuco, Brasil")}&format=json&limit=1`)
      .then((r) => r.json())
      .then((data: Array<{ lat: string; lon: string }>) => {
        if (data[0]) {
          setNodeForm((f) => ({ ...f, lat: parseFloat(data[0].lat).toFixed(5), lng: parseFloat(data[0].lon).toFixed(5) }));
          toast.success(`Coordenadas encontradas para ${city}`);
        } else {
          toast.error("Cidade não encontrada");
        }
      })
      .catch(() => toast.error("Erro ao buscar coordenadas"));
  }, [nodeForm.city]);

  // ─── Link CRUD ──────────────────────────────────────────────────────────────
  function openCreateLink() {
    setEditingLink(null);
    setLinkForm(emptyLinkForm());
    setCapacityValue("");
    setCapacityUnit("mbps");
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
      useRoadRoute: link.useRoadRoute ?? true,
    });
    if (link.capacityBps) {
      if (link.capacityBps >= 1e9) { setCapacityUnit("gbps"); setCapacityValue(String(link.capacityBps / 1e9)); }
      else { setCapacityUnit("mbps"); setCapacityValue(String(link.capacityBps / 1e6)); }
    } else { setCapacityValue(""); setCapacityUnit("mbps"); }
    setLinkDialog(true);
  }

  async function submitLink() {
    const capBps = capacityValue
      ? parseFloat(capacityValue) * (capacityUnit === "gbps" ? 1e9 : 1e6)
      : undefined;

    // Always try to fetch OSRM route (useRoadRoute is true by default)
    let routePoints: Array<[number, number]> | undefined;
    const fNode = nodes.find((n) => n.id.toString() === linkForm.fromNodeId);
    const tNode = nodes.find((n) => n.id.toString() === linkForm.toNodeId);
    if (linkForm.useRoadRoute && fNode?.lat && fNode?.lng && tNode?.lat && tNode?.lng) {
      const pts = await fetchOsrmRoute(fNode.lat, fNode.lng, tNode.lat, tNode.lng);
      if (pts) {
        routePoints = pts;
      } else {
        toast.warning("Rota OSRM não disponível — usando linha reta");
      }
    }

    const payload = {
      fromNodeId: parseInt(linkForm.fromNodeId),
      fromPortId: linkForm.fromPortId ? parseInt(linkForm.fromPortId) : undefined,
      fromPortName: linkForm.fromPortName || undefined,
      toNodeId: parseInt(linkForm.toNodeId),
      toPortId: linkForm.toPortId ? parseInt(linkForm.toPortId) : undefined,
      toPortName: linkForm.toPortName || undefined,
      linkType: linkForm.linkType,
      capacityBps: capBps,
      useRoadRoute: linkForm.useRoadRoute,
      routePoints,
    };
    if (editingLink) {
      updateLink.mutate({ id: editingLink.id, ...payload });
    } else {
      createLink.mutate(payload);
    }
  }

  // ─── Import from LibreNMS ────────────────────────────────────────────────────
  function importDevice(device: { deviceId: number; name: string; mgmtIp: string; location: string }) {
    const city = device.location || device.name;
    const doCreate = (lat?: number, lng?: number) => {
      createNode.mutate({
        name: device.name,
        city: device.location || undefined,
        lat,
        lng,
        nodeType: "switch",
        mgmtIp: device.mgmtIp,
        deviceId: device.deviceId,
        active: true,
      });
    };
    if (city) {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", Pernambuco, Brasil")}&format=json&limit=1`)
        .then((r) => r.json())
        .then((data: Array<{ lat: string; lon: string }>) => {
          if (data[0]) {
            doCreate(parseFloat(data[0].lat), parseFloat(data[0].lon));
            toast.success(`${device.name} importado com coordenadas`);
          } else {
            doCreate();
            toast.success(`${device.name} importado (sem coordenadas)`);
          }
        })
        .catch(() => { doCreate(); toast.success(`${device.name} importado`); });
    } else {
      doCreate();
      toast.success(`${device.name} importado`);
    }
  }

  // ─── Map container height ────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState("calc(100vh - 130px)");
  useEffect(() => {
    function updateHeight() {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        const available = window.innerHeight - rect.top;
        setMapHeight(`${Math.max(available, 400)}px`);
      }
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    const t = setTimeout(updateHeight, 200);
    return () => { window.removeEventListener("resize", updateHeight); clearTimeout(t); };
  }, []);

  // ─── Derived values ──────────────────────────────────────────────────────────
  const nodesWithCoords = nodes.filter((n) => n.lat && n.lng);
  const defaultCenter: [number, number] = [-8.89, -36.49];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-base font-bold leading-tight">Mapa de Rede</h1>
            <p className="text-xs text-muted-foreground">{nodes.length} nós · {links.length} links</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle labels */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLabels((v) => !v)}
            title={showLabels ? "Ocultar nomes" : "Mostrar nomes"}
          >
            {showLabels ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
            {showLabels ? "Ocultar nomes" : "Mostrar nomes"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetchNodes(); refetchLinks(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialog(true)}>
            <Download className="w-4 h-4 mr-1" /> Importar
          </Button>
          <Button size="sm" onClick={() => setSidebarOpen(true)}>
            <Pencil className="w-4 h-4 mr-1" /> Gerenciar
          </Button>
        </div>
      </div>

      {/* Utilization legend bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-card/50 border-b border-border text-xs text-muted-foreground">
        {linksTrafficData && Object.keys(linksTrafficData).length > 0 ? (
          <>
            <span className="font-semibold text-foreground">Utilização:</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block" style={{ background: "#22c55e" }} /> &lt;50%</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block" style={{ background: "#f59e0b" }} /> 50–80%</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block" style={{ background: "#ef4444" }} /> &gt;80%</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block bg-gray-400" /> Sem dados</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">Links:</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block bg-blue-500" /> Fibra</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block bg-amber-500" /> Rádio</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block bg-purple-500" /> Cobre</span>
            <span className="flex items-center gap-1"><span className="w-5 h-1 rounded inline-block bg-cyan-500" /> VPN</span>
          </>
        )}
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="relative" style={{ height: mapHeight, minHeight: "400px" }}>
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
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
          scrollWheelZoom={true}
        >
          <InvalidateSize />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {nodesWithCoords.length > 0 && <MapFitBounds nodes={nodesWithCoords as NetworkNode[]} />}

          {/* Draw links (polylines) */}
          {links.map((link) => {
            const fromNode = nodes.find((n) => n.id === link.fromNodeId);
            const toNode = nodes.find((n) => n.id === link.toNodeId);
            if (!fromNode?.lat || !fromNode?.lng || !toNode?.lat || !toNode?.lng) return null;
            const isHovered = hoveredLinkId === link.id;

            // Utilization color
            let lineColor: string;
            if (!link.active) {
              lineColor = "#9ca3af";
            } else if (link.fromPortId && linksTrafficData?.[link.fromPortId]) {
              const td = linksTrafficData[link.fromPortId];
              const capBps = link.capacityBps ?? td.speedBps;
              const pct = capBps > 0 ? (Math.max(td.inBps, td.outBps) / capBps) * 100 : 0;
              lineColor = utilColor(pct);
            } else {
              lineColor = LINK_COLORS[link.linkType as LinkType];
            }

            // Filter out any null/invalid coordinate pairs from routePoints
            const safeRoutePoints = (link.routePoints ?? []).filter(
              (pt): pt is [number, number] =>
                Array.isArray(pt) && pt.length === 2 &&
                pt[0] != null && pt[1] != null &&
                typeof pt[0] === 'number' && typeof pt[1] === 'number' &&
                isFinite(pt[0]) && isFinite(pt[1])
            );
            const positions: [number, number][] =
              link.useRoadRoute && safeRoutePoints.length > 1
                ? safeRoutePoints
                : [[fromNode.lat, fromNode.lng], [toNode.lat, toNode.lng]];

            return (
              <Polyline
                key={link.id}
                positions={positions}
                pathOptions={{
                  color: isHovered ? "#facc15" : lineColor,
                  weight: isHovered ? 5 : (link.active ? 3 : 2),
                  opacity: link.active ? 1 : 0.4,
                  dashArray: link.active ? undefined : "6 4",
                }}
                eventHandlers={{
                  mouseover(e) {
                    setHoveredLinkId(link.id);
                    const me = e.originalEvent as MouseEvent;
                    setHoveredLinkPos({ x: me.clientX, y: me.clientY });
                  },
                  mousemove(e) {
                    const me = e.originalEvent as MouseEvent;
                    setHoveredLinkPos({ x: me.clientX, y: me.clientY });
                  },
                  mouseout() {
                    setHoveredLinkId(null);
                    setHoveredLinkPos(null);
                  },
                }}
              />
            );
          })}

          {/* Draw nodes (circular markers) */}
          {nodesWithCoords.map((node) => {
            const pct = nodeUtilMap[node.id] ?? null;
            return (
              <Marker
                key={`${node.id}-${showLabels}-${pct?.toFixed(0)}`}
                position={[node.lat!, node.lng!]}
                icon={makeNodeIcon(node as NetworkNode, pct, showLabels)}
                draggable={true}
                eventHandlers={{
                  dragend(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    updateNode.mutate(
                      {
                        id: node.id,
                        name: node.name,
                        city: node.city ?? undefined,
                        nodeType: node.nodeType as NodeType,
                        mgmtIp: node.mgmtIp ?? undefined,
                        lat: latlng.lat,
                        lng: latlng.lng,
                        active: node.active ?? true,
                      },
                      {
                        onSuccess: () => { refetchNodes(); toast.success(`${node.name} reposicionado`); },
                        onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
                      }
                    );
                  },
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* ─── Traffic hover box ─────────────────────────────────────────────── */}
      {hoveredLinkId !== null && hoveredLinkPos && hoveredLink && (() => {
        const fromN = nodes.find((n) => n.id === hoveredLink.fromNodeId);
        const toN = nodes.find((n) => n.id === hoveredLink.toNodeId);
        const inBps = fromPortTraffic?.inBps ?? null;
        const outBps = fromPortTraffic?.outBps ?? null;
        const capBps = hoveredLink.capacityBps ?? fromPortTraffic?.speedBps ?? null;
        const txPct = outBps && capBps ? Math.min(100, Math.round((outBps / capBps) * 100)) : null;
        const rxPct = inBps && capBps ? Math.min(100, Math.round((inBps / capBps) * 100)) : null;

        return (
          <div
            style={{
              position: "fixed",
              left: hoveredLinkPos.x + 16,
              top: hoveredLinkPos.y - 10,
              zIndex: 3000,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                padding: "10px 14px",
                minWidth: 200,
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                fontFamily: "sans-serif",
                fontSize: 13,
              }}
            >
              {/* Port name header */}
              <div style={{ fontWeight: 700, fontSize: 13, color: "#111827", marginBottom: 6, borderBottom: "1px solid #e5e7eb", paddingBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{hoveredLink.fromPortName
                  ? `[ ${hoveredLink.fromPortName} ]`
                  : `${fromN?.name ?? "?"} \u2192 ${toN?.name ?? "?"}`}</span>
                {trafficFetching && !trafficLoading && (
                  <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>\u21bb</span>
                )}
              </div>

              {hoveredLink.fromPortId ? (
                trafficLoading ? (
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Carregando...</div>
                ) : fromPortTraffic ? (
                  <div style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: "3px 8px", alignItems: "center" }}>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>TX:</span>
                    <span style={{ fontWeight: 700, color: txPct !== null ? utilColor(txPct) : "#111827" }}>
                      {outBps !== null ? formatBps(outBps) : "—"}
                      {txPct !== null && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: 4 }}>({txPct}%)</span>}
                    </span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>RX:</span>
                    <span style={{ fontWeight: 700, color: rxPct !== null ? utilColor(rxPct) : "#111827" }}>
                      {inBps !== null ? formatBps(inBps) : "—"}
                      {rxPct !== null && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: 4 }}>({rxPct}%)</span>}
                    </span>
                    {fromPortTraffic.operStatus && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Status:</span>
                        <span style={{ fontWeight: 600, color: fromPortTraffic.operStatus === "up" ? "#22c55e" : "#ef4444" }}>
                          {fromPortTraffic.operStatus}
                        </span>
                      </>
                    )}
                    {capBps && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Cap.:</span>
                        <span style={{ color: "#374151" }}>{formatBps(capBps)}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Sem dados de tráfego</div>
                )
              ) : (
                <div style={{ color: "#9ca3af", fontSize: 12 }}>
                  {fromN?.name} → {toN?.name}
                  {hoveredLink.capacityBps && (
                    <div style={{ marginTop: 2 }}>Cap.: {formatBps(hoveredLink.capacityBps)}</div>
                  )}
                  <div style={{ marginTop: 2, color: "#d1d5db" }}>Porta não configurada</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
                        {link.capacityBps && ` · ${formatBps(link.capacityBps)}`}
                        {link.useRoadRoute && " · 🛣️"}
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
                <Select value={linkForm.fromNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, fromNodeId: v, fromPortId: "", fromPortName: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nó Destino *</Label>
                <Select value={linkForm.toNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, toNodeId: v, toPortId: "", toPortName: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Porta de Saída (apenas do nó de origem) */}
            <div>
              <Label>Porta de Saída (nó origem)</Label>
              <p className="text-xs text-muted-foreground mb-1">Selecione a porta de saída do equipamento de origem para monitorar o tráfego</p>
              {fromPorts.length > 0 ? (
                <Select
                  key={`from-ports-${linkForm.fromNodeId}`}
                  value={linkForm.fromPortId}
                  onValueChange={(v) => {
                    const p = fromPorts.find((p) => p.portId.toString() === v);
                    setLinkForm((f) => ({ ...f, fromPortId: v, fromPortName: p?.ifName || "" }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a porta..." /></SelectTrigger>
                  <SelectContent>
                    {fromPorts.map((p) => (
                      <SelectItem key={p.portId} value={p.portId.toString()}>
                        {p.ifName}{p.ifAlias ? ` — ${p.ifAlias}` : ""}
                        {p.ifSpeed ? ` (${p.ifSpeed >= 1e9 ? `${p.ifSpeed / 1e9}G` : `${p.ifSpeed / 1e6}M`})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={linkForm.fromPortName}
                  onChange={(e) => setLinkForm((f) => ({ ...f, fromPortName: e.target.value }))}
                  placeholder={fromNodeObj?.deviceId ? "Carregando portas..." : "Ex: GE0/0/1 (configure Device ID no nó)"}
                />
              )}
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
                <Label>Capacidade</Label>
                <div className="flex gap-1">
                  <Input
                    value={capacityValue}
                    onChange={(e) => setCapacityValue(e.target.value)}
                    placeholder="Ex: 10"
                    type="number"
                    min="0"
                    className="flex-1"
                  />
                  <Select value={capacityUnit} onValueChange={(v) => setCapacityUnit(v as "mbps" | "gbps")}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mbps">Mbps</SelectItem>
                      <SelectItem value="gbps">Gbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Road route toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Rota por estradas</div>
                <div className="text-xs text-muted-foreground">Traçar seguindo as vias reais (OSRM) — ativado por padrão</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={linkForm.useRoadRoute}
                onClick={() => setLinkForm((f) => ({ ...f, useRoadRoute: !f.useRoadRoute }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  linkForm.useRoadRoute ? "bg-primary" : "bg-muted"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${linkForm.useRoadRoute ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Cancelar</Button>
            <Button onClick={submitLink} disabled={!linkForm.fromNodeId || !linkForm.toNodeId || createLink.isPending || updateLink.isPending}>
              {(createLink.isPending || updateLink.isPending) ? "Calculando rota..." : (editingLink ? "Salvar" : "Criar")}
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
