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
  Users,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

// ─── RouteEditorLayer: renders draggable waypoints + midpoint handles ─────────
interface RouteEditorLayerProps {
  points: [number, number][];
  onChange: (pts: [number, number][]) => void;
}
function RouteEditorLayer({ points, onChange }: RouteEditorLayerProps) {
  const map = useMap();

  // Draggable waypoint markers (blue circles)
  const waypointIcon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:grab"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }), []);

  // Midpoint handles (smaller grey circles to insert new points)
  const midIcon = useMemo(() => L.divIcon({
    className: "",
    html: `<div style="width:10px;height:10px;border-radius:50%;background:#94a3b8;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer;opacity:0.8"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  }), []);

  // Disable map drag while editing so dragging points doesn't pan the map
  useEffect(() => {
    map.dragging.disable();
    return () => { map.dragging.enable(); };
  }, [map]);

  // Midpoints between consecutive waypoints
  const midpoints: [number, number][] = useMemo(() => {
    const mids: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      mids.push([(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2]);
    }
    return mids;
  }, [points]);

  return (
    <>
      {/* Preview polyline */}
      <Polyline
        positions={points}
        pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "6 4", opacity: 0.9 }}
      />
      {/* Waypoint markers */}
      {points.map((pt, idx) => (
        <Marker
          key={`wp-${idx}`}
          position={pt}
          icon={waypointIcon}
          draggable={true}
          eventHandlers={{
            drag(e) {
              const latlng = (e.target as L.Marker).getLatLng();
              const newPts = [...points] as [number, number][];
              newPts[idx] = [latlng.lat, latlng.lng];
              onChange(newPts);
            },
            contextmenu() {
              // Right-click to remove a waypoint (keep at least 2)
              if (points.length <= 2) return;
              const newPts = points.filter((_, i) => i !== idx);
              onChange(newPts);
            },
          }}
        />
      ))}
      {/* Midpoint handles to insert new waypoints */}
      {midpoints.map((mid, idx) => (
        <Marker
          key={`mid-${idx}`}
          position={mid}
          icon={midIcon}
          eventHandlers={{
            click() {
              const newPts = [
                ...points.slice(0, idx + 1),
                mid,
                ...points.slice(idx + 1),
              ] as [number, number][];
              onChange(newPts);
            },
          }}
        />
      ))}
    </>
  );
}

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

interface MapCustomer {
  id: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
}
interface CustomerAccessLink {
  id: number;
  customerId: number;
  nodeId: number;
  portId: number | null;
  portName: string | null;
  linkType: LinkType;
  capacityBps: number | null;
  useRoadRoute: boolean;
  routePoints: Array<[number, number]> | null;
  active: boolean;
}

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
interface NetworkLinkSegment {
  id: number;
  linkId: number;
  toNodeId: number;
  toPortId: number | null;
  toPortName: string | null;
  routePoints: Array<[number, number]> | null;
  color: string | null;
  capacityBps: number | null;
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
  segments: NetworkLinkSegment[];
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

// ─── Customer icon (house pin) ──────────────────────────────────────────────
function makeCustomerIcon(customer: MapCustomer, showLabel: boolean): L.DivIcon {
  const color = customer.active ? "#f97316" : "#9ca3af";
  const size = 24;
  const labelHtml = showLabel
    ? `<div style="position:absolute;top:${size + 6}px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:10px;font-weight:700;color:#1e293b;text-shadow:0 0 3px white,0 0 3px white;pointer-events:none;">${customer.name}</div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [size + 8, size + 8 + (showLabel ? 16 : 0)],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -(size + 8) / 2],
    html: `<div style="position:relative;width:${size + 8}px;height:${size + 8 + (showLabel ? 16 : 0)}px;cursor:grab;"><div style="position:absolute;top:0;left:50%;transform:translateX(-50%);pointer-events:none;"><svg width="${size + 8}" height="${size + 8}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="pointer-events:none;"><circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/><path d="M16 8 L8 15 L10 15 L10 24 L14 24 L14 19 L18 19 L18 24 L22 24 L22 15 L24 15 Z" fill="white"/></svg></div>${labelHtml}</div>`,
  });
}

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
interface SegmentFormData {
  toNodeId: string;
  toPortId: string;
  toPortName: string;
}
interface LinkFormData {
  fromNodeId: string;
  fromPortId: string;
  fromPortName: string;
  toNodeId: string;       // legacy (first segment)
  toPortId: string;
  toPortName: string;
  linkType: LinkType;
  capacityBps: string;
  useRoadRoute: boolean;
  segments: SegmentFormData[];
}
const emptySegment = (): SegmentFormData => ({ toNodeId: "", toPortId: "", toPortName: "" });
const emptyLinkForm = (): LinkFormData => ({
  fromNodeId: "", fromPortId: "", fromPortName: "",
  toNodeId: "", toPortId: "", toPortName: "",
  linkType: "fiber", capacityBps: "", useRoadRoute: true,
  segments: [emptySegment()],
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

// ─── MapClickHandler: captures click on map to pick coordinates ──────────────
function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onPick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map, onPick]);
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NetworkMap() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"nodes" | "links" | "customers">("nodes");
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

  // Customer dialog
  const [customerDialog, setCustomerDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<MapCustomer | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", address: "", lat: "", lng: "", active: true });

  // Customer access link dialog
  const [customerLinkDialog, setCustomerLinkDialog] = useState(false);
  const [editingCustomerLink, setEditingCustomerLink] = useState<CustomerAccessLink | null>(null);
  const [customerLinkForm, setCustomerLinkForm] = useState({
    customerId: "",
    nodeId: "",
    portName: "",
    linkType: "fiber" as LinkType,
    capacityBps: "",
    useRoadRoute: true,
    active: true,
  });

  // Customer route editing
  const [editingCustomerRoute, setEditingCustomerRoute] = useState<{ linkId: number } | null>(null);
  const [editingCustomerRoutePoints, setEditingCustomerRoutePoints] = useState<[number, number][]>([]);

  // Route editing state
  const [editingRouteLink, setEditingRouteLink] = useState<{ linkId: number; segIdx: number } | null>(null);
  const [editingRoutePoints, setEditingRoutePoints] = useState<[number, number][]>([]);

  // Pick-location mode: "node" | "customer" | null
  const [pickMode, setPickMode] = useState<"node" | "customer" | null>(null);

  // Temporary drag positions for live line updates
  const [dragNodePos, setDragNodePos] = useState<{ id: number; lat: number; lng: number } | null>(null);
  const [dragCustomerPos, setDragCustomerPos] = useState<{ id: number; lat: number; lng: number } | null>(null);

  // Hover state for link traffic box
  const [hoveredLinkId, setHoveredLinkId] = useState<number | null>(null);
  const [hoveredSegmentIdx, setHoveredSegmentIdx] = useState<number>(0);
  const [hoveredLinkPos, setHoveredLinkPos] = useState<{ x: number; y: number } | null>(null);

  // Data
  const { data: nodes = [], refetch: refetchNodes } = trpc.network.listNodes.useQuery();
  const { data: links = [], refetch: refetchLinks } = trpc.network.listLinks.useQuery();
  const { data: customers = [], refetch: refetchCustomers } = trpc.customers.list.useQuery();
  const { data: customerLinks = [], refetch: refetchCustomerLinks } = trpc.customers.listLinks.useQuery();
  const { data: libreDevices = [] } = trpc.network.getLibreNMSDevices.useQuery(undefined, {
    enabled: importDialog,
  });

  // Ports for link dialog (fetched when a node with deviceId is selected)
  const fromNodeObj = nodes.find((n) => n.id.toString() === linkForm.fromNodeId);
  const { data: fromPorts = [] } = trpc.network.getDevicePorts.useQuery(
    { deviceId: fromNodeObj?.deviceId ?? 0 },
    { enabled: linkDialog && !!fromNodeObj?.deviceId }
  );
  // Per-segment destination ports: collect unique deviceIds from all segments
  const segmentDeviceIds = useMemo(() => {
    const ids = new Set<number>();
    linkForm.segments.forEach((seg) => {
      const n = nodes.find((nd) => nd.id.toString() === seg.toNodeId);
      if (n?.deviceId) ids.add(n.deviceId);
    });
    return Array.from(ids);
  }, [linkForm.segments, nodes]);
  // Fetch ports for each unique destination deviceId
  const segPortQueries = [
    trpc.network.getDevicePorts.useQuery({ deviceId: segmentDeviceIds[0] ?? 0 }, { enabled: linkDialog && !!segmentDeviceIds[0] }),
    trpc.network.getDevicePorts.useQuery({ deviceId: segmentDeviceIds[1] ?? 0 }, { enabled: linkDialog && !!segmentDeviceIds[1] }),
    trpc.network.getDevicePorts.useQuery({ deviceId: segmentDeviceIds[2] ?? 0 }, { enabled: linkDialog && !!segmentDeviceIds[2] }),
    trpc.network.getDevicePorts.useQuery({ deviceId: segmentDeviceIds[3] ?? 0 }, { enabled: linkDialog && !!segmentDeviceIds[3] }),
  ];
  // Map deviceId -> ports array for easy lookup
  const portsByDeviceId = useMemo(() => {
    const map: Record<number, Array<{ portId: number; ifName: string; ifAlias: string; ifSpeed: number; status: string }>> = {};
    segmentDeviceIds.forEach((did, i) => {
      if (segPortQueries[i]?.data) map[did] = segPortQueries[i].data!;
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentDeviceIds, segPortQueries[0].data, segPortQueries[1].data, segPortQueries[2].data, segPortQueries[3].data]);

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

  // Traffic query for hovered link — resolves the hovered segment to get the correct port
  const hoveredLink = links.find((l) => l.id === hoveredLinkId);
  // Resolve the hovered segment (could be a multi-destination hub link)
  const hoveredSegments = hoveredLink
    ? (hoveredLink.segments && hoveredLink.segments.length > 0
        ? hoveredLink.segments
        : [{ id: -1, linkId: hoveredLink.id, toNodeId: hoveredLink.toNodeId, toPortId: hoveredLink.toPortId, toPortName: hoveredLink.toPortName, routePoints: null, color: null, capacityBps: hoveredLink.capacityBps }])
    : [];
  const hoveredSeg = hoveredSegments[hoveredSegmentIdx] ?? hoveredSegments[0] ?? null;
  // Destination node and port for the hovered segment
  const hoveredToNode = hoveredSeg ? nodes.find((n) => n.id === hoveredSeg.toNodeId) : null;
  const hoveredToPortId = hoveredSeg?.toPortId ?? null;
  const hoveredToPortName = hoveredSeg?.toPortName ?? null;
  const hoveredToDeviceId = hoveredToNode?.deviceId ?? null;
  // Source node and port (always from the link origin)
  const hoveredFromPortId = hoveredLink?.fromPortId ?? null;
  const hoveredFromNode = hoveredLink ? nodes.find((n) => n.id === hoveredLink.fromNodeId) : null;
  const { data: fromPortTraffic, isLoading: trafficLoading, isFetching: trafficFetching } = trpc.network.getPortTraffic.useQuery(
    { portId: hoveredFromPortId! },
    { enabled: !!hoveredFromPortId, refetchInterval: 5000 }
  );
  // DOM optical signal query for hovered segment's destination port (if configured), else source port
  const domPortName = hoveredToPortName || hoveredLink?.fromPortName || null;
  const domDeviceId = hoveredToPortName ? hoveredToDeviceId : (hoveredFromNode?.deviceId ?? null);
  const { data: portDOM } = trpc.network.getPortDOM.useQuery(
    { ifName: domPortName!, deviceId: domDeviceId! },
    { enabled: !!domPortName && !!domDeviceId, refetchInterval: 30000 }
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
  const saveRoute = trpc.network.updateLink.useMutation({
    onSuccess: () => { refetchLinks(); setEditingRouteLink(null); setEditingRoutePoints([]); toast.success("Traçado salvo com sucesso"); },
    onError: (err) => toast.error(`Erro ao salvar traçado: ${err.message}`),
  });

  // Customer mutations
  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: () => { refetchCustomers(); setCustomerDialog(false); toast.success("Cliente criado"); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const updateCustomer = trpc.customers.update.useMutation({
    onSuccess: () => { refetchCustomers(); setCustomerDialog(false); toast.success("Cliente atualizado"); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const deleteCustomer = trpc.customers.delete.useMutation({
    onSuccess: () => { refetchCustomers(); refetchCustomerLinks(); toast.success("Cliente removido"); },
  });
  const createCustomerLink = trpc.customers.createLink.useMutation({
    onSuccess: () => { refetchCustomerLinks(); setCustomerLinkDialog(false); toast.success("Link de acesso criado"); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const updateCustomerLink = trpc.customers.updateLink.useMutation({
    onSuccess: () => { refetchCustomerLinks(); setCustomerLinkDialog(false); toast.success("Link de acesso atualizado"); },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const deleteCustomerLink = trpc.customers.deleteLink.useMutation({
    onSuccess: () => { refetchCustomerLinks(); toast.success("Link de acesso removido"); },
  });
  const saveCustomerRoute = trpc.customers.updateLink.useMutation({
    onSuccess: () => { refetchCustomerLinks(); setEditingCustomerRoute(null); setEditingCustomerRoutePoints([]); toast.success("Traçado salvo"); },
    onError: (err) => toast.error(`Erro ao salvar traçado: ${err.message}`),
  });

  function openCreateCustomer() {
    setEditingCustomer(null);
    setCustomerForm({ name: "", address: "", lat: "", lng: "", active: true });
    setSidebarOpen(false); // close sidebar so banner is visible
    setPickMode("customer");
  }
  function openEditCustomer(c: MapCustomer) {
    setEditingCustomer(c);
    setCustomerForm({ name: c.name, address: c.address ?? "", lat: c.lat?.toString() ?? "", lng: c.lng?.toString() ?? "", active: c.active });
    setCustomerDialog(true);
  }
  function submitCustomer() {
    const payload = {
      name: customerForm.name,
      address: customerForm.address || undefined,
      lat: customerForm.lat ? parseFloat(customerForm.lat) : undefined,
      lng: customerForm.lng ? parseFloat(customerForm.lng) : undefined,
      active: customerForm.active,
    };
    if (editingCustomer) updateCustomer.mutate({ id: editingCustomer.id, ...payload });
    else createCustomer.mutate(payload);
  }

  function openCreateCustomerLink(customerId?: number) {
    setEditingCustomerLink(null);
    setCustomerLinkForm({ customerId: customerId?.toString() ?? "", nodeId: "", portName: "", linkType: "fiber", capacityBps: "", useRoadRoute: true, active: true });
    setCustomerLinkDialog(true);
  }
  function openEditCustomerLink(cl: CustomerAccessLink) {
    setEditingCustomerLink(cl);
    setCustomerLinkForm({ customerId: cl.customerId.toString(), nodeId: cl.nodeId.toString(), portName: cl.portName ?? "", linkType: cl.linkType, capacityBps: cl.capacityBps ? (cl.capacityBps / 1e6).toString() : "", useRoadRoute: cl.useRoadRoute, active: cl.active });
    setCustomerLinkDialog(true);
  }
  function submitCustomerLink() {
    const payload = {
      customerId: parseInt(customerLinkForm.customerId),
      nodeId: parseInt(customerLinkForm.nodeId),
      portName: customerLinkForm.portName || undefined,
      linkType: customerLinkForm.linkType,
      capacityBps: customerLinkForm.capacityBps ? parseFloat(customerLinkForm.capacityBps) * 1e6 : undefined,
      useRoadRoute: customerLinkForm.useRoadRoute,
      active: customerLinkForm.active,
    };
    if (editingCustomerLink) updateCustomerLink.mutate({ id: editingCustomerLink.id, ...payload });
    else createCustomerLink.mutate(payload);
  }

  function startCustomerRouteEdit(linkId: number, points: [number, number][]) {
    setHoveredLinkId(null);
    setEditingCustomerRoute({ linkId });
    setEditingCustomerRoutePoints(points.length >= 2 ? [...points] : [...points]);
  }
  function cancelCustomerRouteEdit() {
    setEditingCustomerRoute(null);
    setEditingCustomerRoutePoints([]);
  }
  function confirmCustomerRouteEdit() {
    if (!editingCustomerRoute) return;
    saveCustomerRoute.mutate({ id: editingCustomerRoute.linkId, routePoints: editingCustomerRoutePoints });
  }

  function startRouteEdit(linkId: number, segIdx: number, points: [number, number][]) {
    // Disable hover box while editing
    setHoveredLinkId(null);
    setEditingRouteLink({ linkId, segIdx });
    setEditingRoutePoints(points.length >= 2 ? [...points] : [...points]);
  }

  function cancelRouteEdit() {
    setEditingRouteLink(null);
    setEditingRoutePoints([]);
  }

  function confirmRouteEdit() {
    if (!editingRouteLink) return;
    const link = links.find((l) => l.id === editingRouteLink.linkId);
    if (!link) return;
    const segs = link.segments && link.segments.length > 0
      ? link.segments
      : [{ id: -1, linkId: link.id, toNodeId: link.toNodeId, toPortId: link.toPortId, toPortName: link.toPortName, routePoints: null, color: null, capacityBps: link.capacityBps }];
    const updatedSegments = segs.map((seg, i) => ({
      toNodeId: seg.toNodeId,
      toPortId: seg.toPortId ?? undefined,
      toPortName: seg.toPortName ?? undefined,
      routePoints: i === editingRouteLink.segIdx ? editingRoutePoints : (seg.routePoints ?? undefined),
      color: seg.color ?? undefined,
      capacityBps: seg.capacityBps ?? undefined,
    }));
    saveRoute.mutate({
      id: editingRouteLink.linkId,
      segments: updatedSegments,
    });
  }

  // ─── Node CRUD ──────────────────────────────────────────────────────────────────────────────────
  function openCreateNode() {
    setEditingNode(null);
    setNodeForm(emptyNodeForm());
    setSidebarOpen(false); // close sidebar so banner is visible
    setPickMode("node");
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
      segments: link.segments && link.segments.length > 0
        ? link.segments.map(s => ({
            toNodeId: s.toNodeId.toString(),
            toPortId: s.toPortId?.toString() || "",
            toPortName: s.toPortName || "",
          }))
        : [{ toNodeId: link.toNodeId.toString(), toPortId: link.toPortId?.toString() || "", toPortName: link.toPortName || "" }],
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
    const fNode = nodes.find((n) => n.id.toString() === linkForm.fromNodeId);
    // Validate: at least one segment with a destination
    const validSegments = linkForm.segments.filter(s => s.toNodeId !== "");
    if (validSegments.length === 0) {
      toast.error("Selecione pelo menos um nó de destino");
      return;
    }
    // Calculate OSRM route for each segment
    const segmentsWithRoutes = await Promise.all(validSegments.map(async (seg) => {
      const tNode = nodes.find((n) => n.id.toString() === seg.toNodeId);
      let routePoints: Array<[number, number]> | undefined;
      if (linkForm.useRoadRoute && fNode?.lat && fNode?.lng && tNode?.lat && tNode?.lng) {
        const pts = await fetchOsrmRoute(fNode.lat, fNode.lng, tNode.lat, tNode.lng);
        if (pts) routePoints = pts;
      }
      return {
        toNodeId: parseInt(seg.toNodeId),
        toPortId: seg.toPortId ? parseInt(seg.toPortId) : undefined,
        toPortName: seg.toPortName || undefined,
        routePoints,
        capacityBps: capBps,
      };
    }));
    const firstSeg = segmentsWithRoutes[0];
    const payload = {
      fromNodeId: parseInt(linkForm.fromNodeId),
      fromPortId: linkForm.fromPortId ? parseInt(linkForm.fromPortId) : undefined,
      fromPortName: linkForm.fromPortName || undefined,
      toNodeId: firstSeg.toNodeId,
      toPortId: firstSeg.toPortId,
      toPortName: firstSeg.toPortName,
      linkType: linkForm.linkType,
      capacityBps: capBps,
      useRoadRoute: linkForm.useRoadRoute,
      routePoints: firstSeg.routePoints,
      segments: segmentsWithRoutes,
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

  // ─── Pick-location handler (must be outside conditional JSX) ─────────────────
  const handlePickLocation = useCallback((lat: number, lng: number) => {
    if (pickMode === "node") {
      setNodeForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      setNodeDialog(true);
    } else if (pickMode === "customer") {
      setCustomerForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      setCustomerDialog(true);
    }
    setPickMode(null);
  }, [pickMode]);

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

        {/* Route editing overlay (inside the relative map container) */}
        {editingRouteLink && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(15,23,42,0.92)",
              border: "1px solid #3b82f6",
              borderRadius: 8,
              padding: "8px 16px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              fontFamily: "sans-serif",
              fontSize: 13,
              color: "white",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ marginRight: 4, color: "#93c5fd" }}>✏️ Editando traçado</span>
            <span style={{ color: "#94a3b8", fontSize: 11 }}>Arraste os pontos • Clique nos cinzas para adicionar • Clique direito para remover</span>
            <button
              onClick={confirmRouteEdit}
              disabled={saveRoute.isPending}
              style={{
                marginLeft: 12,
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 5,
                padding: "5px 14px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                opacity: saveRoute.isPending ? 0.6 : 1,
              }}
            >
              {saveRoute.isPending ? "Salvando..." : "✔ Salvar"}
            </button>
            <button
              onClick={cancelRouteEdit}
              style={{
                background: "transparent",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 5,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ✕ Cancelar
            </button>
          </div>
        )}

        {/* ─── Customer route editing overlay ─── */}
        {editingCustomerRoute && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              background: "#1e293b",
              borderRadius: 8,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
              color: "white",
              pointerEvents: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ marginRight: 4, color: "#fb923c" }}>✏️ Editando traçado do cliente</span>
            <span style={{ color: "#94a3b8", fontSize: 11 }}>Arraste os pontos • Clique nos cinzas para adicionar • Clique direito para remover</span>
            <button
              onClick={confirmCustomerRouteEdit}
              disabled={saveCustomerRoute.isPending}
              style={{ marginLeft: 12, background: "#f97316", color: "white", border: "none", borderRadius: 5, padding: "5px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, opacity: saveCustomerRoute.isPending ? 0.6 : 1 }}
            >
              {saveCustomerRoute.isPending ? "Salvando..." : "✔ Salvar"}
            </button>
            <button
              onClick={cancelCustomerRouteEdit}
              style={{ background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 13 }}
            >
              ✕ Cancelar
            </button>
          </div>
        )}

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

        {/* Pick-location overlay instruction */}
        {pickMode && (
          <div style={{
            position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999, background: "rgba(15,23,42,0.97)", borderRadius: 10, padding: "12px 24px",
            display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.7)",
            color: "white", pointerEvents: "auto", whiteSpace: "nowrap",
            border: "2px solid #3b82f6",
          }}>
            <span style={{ fontSize: 20 }}>📍</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Clique no mapa para posicionar o {pickMode === "node" ? "nó" : "cliente"}</span>
            <button
              onClick={() => setPickMode(null)}
              style={{ marginLeft: 12, background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}
            >✕ Cancelar</button>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={9}
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0, cursor: pickMode ? "crosshair" : "" }}
          scrollWheelZoom={true}
        >
          <InvalidateSize />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {nodesWithCoords.length > 0 && <MapFitBounds nodes={nodesWithCoords as NetworkNode[]} />}

          {/* Pick-location click handler */}
          {pickMode && (
            <MapClickHandler onPick={handlePickLocation} />
          )}

          {/* Draw links (polylines) — each link can have multiple segments */}
          {links.flatMap((link) => {
            const fromNodeRaw = nodes.find((n) => n.id === link.fromNodeId);
            // Use live drag position if this node is being dragged
            const fromNode = fromNodeRaw ? (
              dragNodePos?.id === fromNodeRaw.id
                ? { ...fromNodeRaw, lat: dragNodePos.lat, lng: dragNodePos.lng }
                : fromNodeRaw
            ) : undefined;
            if (!fromNode?.lat || !fromNode?.lng) return [];
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

            // Use segments if available, otherwise fall back to legacy toNodeId
            const segs = link.segments && link.segments.length > 0
              ? link.segments
              : [{ id: -1, linkId: link.id, toNodeId: link.toNodeId, toPortId: link.toPortId, toPortName: link.toPortName, routePoints: link.routePoints, color: null, capacityBps: link.capacityBps }];

            return segs.map((seg, segIdx) => {
              const toNodeRaw = nodes.find((n) => n.id === seg.toNodeId);
              // Use live drag position if this node is being dragged
              const toNode = toNodeRaw ? (
                dragNodePos?.id === toNodeRaw.id
                  ? { ...toNodeRaw, lat: dragNodePos.lat, lng: dragNodePos.lng }
                  : toNodeRaw
              ) : undefined;
              if (!toNode?.lat || !toNode?.lng) return null;
              const rawPts = seg.routePoints ?? link.routePoints ?? [];
              const safeRoutePoints = rawPts.filter(
                (pt): pt is [number, number] =>
                  Array.isArray(pt) && pt.length === 2 &&
                  pt[0] != null && pt[1] != null &&
                  typeof pt[0] === 'number' && typeof pt[1] === 'number' &&
                  isFinite(pt[0]) && isFinite(pt[1])
              );
              // When dragging a node, always show straight line (ignore stored route)
              const isDraggingEndpoint = dragNodePos && (dragNodePos.id === link.fromNodeId || dragNodePos.id === seg.toNodeId);
              const positions: [number, number][] =
                !isDraggingEndpoint && link.useRoadRoute && safeRoutePoints.length > 1
                  ? safeRoutePoints
                  : [[fromNode.lat!, fromNode.lng!], [toNode.lat, toNode.lng]];
              const segColor = seg.color || lineColor;
              return (
                <Polyline
                  key={`${link.id}-seg-${seg.id}-${segIdx}`}
                  positions={positions}
                  pathOptions={{
                    color: isHovered && hoveredSegmentIdx === segIdx ? "#facc15" : segColor,
                    weight: isHovered && hoveredSegmentIdx === segIdx ? 5 : (link.active ? 3 : 2),
                    opacity: link.active ? 1 : 0.4,
                    dashArray: link.active ? undefined : "6 4",
                  }}
                  eventHandlers={{
                    mouseover(e) {
                      if (editingRouteLink) return; // don't show hover box while editing
                      setHoveredLinkId(link.id);
                      setHoveredSegmentIdx(segIdx);
                      const me = e.originalEvent as MouseEvent;
                      setHoveredLinkPos({ x: me.clientX, y: me.clientY });
                    },
                    mousemove(e) {
                      if (editingRouteLink) return;
                      const me = e.originalEvent as MouseEvent;
                      setHoveredLinkPos({ x: me.clientX, y: me.clientY });
                    },
                    mouseout() {
                      setHoveredLinkId(null);
                      setHoveredLinkPos(null);
                    },
                    dblclick(e) {
                      // Prevent map zoom on double click
                      (e.originalEvent as MouseEvent).stopPropagation();
                      L.DomEvent.stopPropagation(e);
                      // Build the current route points for this segment
                      const rawPts = seg.routePoints ?? link.routePoints ?? [];
                      const safeRoutePoints = rawPts.filter(
                        (pt): pt is [number, number] =>
                          Array.isArray(pt) && pt.length === 2 &&
                          pt[0] != null && pt[1] != null &&
                          typeof pt[0] === 'number' && typeof pt[1] === 'number' &&
                          isFinite(pt[0]) && isFinite(pt[1])
                      );
                      const editPoints: [number, number][] =
                        link.useRoadRoute && safeRoutePoints.length > 1
                          ? safeRoutePoints
                          : [[fromNode.lat as number, fromNode.lng as number], [toNode.lat as number, toNode.lng as number]];
                      startRouteEdit(link.id, segIdx, editPoints);
                    },
                  }}
                />
              );
            }).filter(Boolean);
          })}

          {/* ─── Route editor: draggable waypoints when editing a segment ─── */}
          {editingRouteLink && editingRoutePoints.length >= 2 && (
            <RouteEditorLayer
              points={editingRoutePoints}
              onChange={setEditingRoutePoints}
            />
          )}

          {/* ─── Customer access links (polylines) ─── */}
          {customerLinks.filter(cl => cl.active).map((cl) => {
            const customerRaw = customers.find(c => c.id === cl.customerId);
            const nodeRaw = nodes.find(n => n.id === cl.nodeId);
            if (!customerRaw?.lat || !customerRaw?.lng || !nodeRaw?.lat || !nodeRaw?.lng) return null;
            // Live drag positions
            const custLat = dragCustomerPos?.id === customerRaw.id ? dragCustomerPos.lat : customerRaw.lat!;
            const custLng = dragCustomerPos?.id === customerRaw.id ? dragCustomerPos.lng : customerRaw.lng!;
            const nodeLat = dragNodePos?.id === nodeRaw.id ? dragNodePos.lat : nodeRaw.lat!;
            const nodeLng = dragNodePos?.id === nodeRaw.id ? dragNodePos.lng : nodeRaw.lng!;
            const isEditingThis = editingCustomerRoute?.linkId === cl.id;
            const rawPts = cl.routePoints ?? [];
            const safePts = rawPts.filter((pt): pt is [number, number] =>
              Array.isArray(pt) && pt.length === 2 && pt[0] != null && pt[1] != null &&
              typeof pt[0] === 'number' && typeof pt[1] === 'number' && isFinite(pt[0]) && isFinite(pt[1])
            );
            // When dragging an endpoint, always show straight line
            const isDraggingEndpoint = (dragCustomerPos?.id === customerRaw.id) || (dragNodePos?.id === nodeRaw.id);
            const positions: [number, number][] = !isDraggingEndpoint && safePts.length > 1
              ? safePts
              : [[custLat, custLng], [nodeLat, nodeLng]];
            return (
              <Polyline
                key={`cal-${cl.id}`}
                positions={positions}
                pathOptions={{ color: isEditingThis ? "#facc15" : "#f97316", weight: 2, opacity: 0.85, dashArray: "5 4" }}
                eventHandlers={{
                  dblclick() {
                    startCustomerRouteEdit(cl.id, positions);
                  },
                }}
              />
            );
          })}

          {/* ─── Customer route editor ─── */}
          {editingCustomerRoute && editingCustomerRoutePoints.length >= 2 && (
            <RouteEditorLayer
              points={editingCustomerRoutePoints}
              onChange={setEditingCustomerRoutePoints}
            />
          )}

          {/* ─── Customer markers ─── */}
          {customers.filter(c => c.lat && c.lng).map((customer) => {
            let justDragged = false;
            return (
              <Marker
                key={`cust-${customer.id}-${showLabels}`}
                position={[customer.lat!, customer.lng!]}
                icon={makeCustomerIcon(customer as MapCustomer, showLabels)}
                draggable={true}
                eventHandlers={{
                  dragstart() { justDragged = false; },
                  drag(e) {
                    justDragged = true;
                    const latlng = (e.target as L.Marker).getLatLng();
                    setDragCustomerPos({ id: customer.id, lat: latlng.lat, lng: latlng.lng });
                  },
                  dragend(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    setDragCustomerPos(null);
                    updateCustomer.mutate({ id: customer.id, lat: latlng.lat, lng: latlng.lng },
                      { onSuccess: () => { refetchCustomers(); toast.success(`${customer.name} reposicionado`); } }
                    );
                  },
                  click() {
                    if (justDragged) { justDragged = false; return; }
                    openEditCustomer(customer as MapCustomer);
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
                  drag(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    setDragNodePos({ id: node.id, lat: latlng.lat, lng: latlng.lng });
                  },
                  dragend(e) {
                    const latlng = (e.target as L.Marker).getLatLng();
                    setDragNodePos(null);
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
        // Use the hovered segment's destination node
        const toN = hoveredToNode ?? nodes.find((n) => n.id === hoveredLink.toNodeId);
        const inBps = fromPortTraffic?.inBps ?? null;
        const outBps = fromPortTraffic?.outBps ?? null;
        const capBps = hoveredSeg?.capacityBps ?? hoveredLink.capacityBps ?? fromPortTraffic?.speedBps ?? null;
        const txPct = outBps && capBps ? Math.min(100, Math.round((outBps / capBps) * 100)) : null;
        const rxPct = inBps && capBps ? Math.min(100, Math.round((inBps / capBps) * 100)) : null;
        // Header shows: source port → destination node (or destination port if configured)
        const headerText = hoveredToPortName
          ? `[ ${hoveredLink.fromPortName ?? fromN?.name ?? "?"} ] → [ ${hoveredToPortName} ]`
          : hoveredLink.fromPortName
          ? `[ ${hoveredLink.fromPortName} ] → ${toN?.name ?? "?"}`
          : `${fromN?.name ?? "?"} \u2192 ${toN?.name ?? "?"}` ;

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
                <span>{headerText}</span>
                {trafficFetching && !trafficLoading && (
                  <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>\u21bb</span>
                )}
              </div>

              {hoveredLink.fromPortId ? (
                trafficLoading ? (
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Carregando...</div>
                ) : fromPortTraffic ? (
                  <>
                  {fromPortTraffic.ifAlias && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 5, fontStyle: "italic" }}>
                      {fromPortTraffic.ifAlias}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: "3px 8px", alignItems: "center" }}>
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
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Sinal:</span>
                        <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                            background: fromPortTraffic.operStatus === "up" ? "#22c55e" : fromPortTraffic.operStatus === "down" ? "#ef4444" : "#f59e0b"
                          }} />
                          <span style={{ color: fromPortTraffic.operStatus === "up" ? "#22c55e" : fromPortTraffic.operStatus === "down" ? "#ef4444" : "#f59e0b" }}>
                            {fromPortTraffic.operStatus === "up" ? "Ativo" : fromPortTraffic.operStatus === "down" ? "Inativo" : fromPortTraffic.operStatus}
                          </span>
                        </span>
                      </>
                    )}
                    {capBps && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Cap.:</span>
                        <span style={{ color: "#374151" }}>{formatBps(capBps)}</span>
                      </>
                    )}
                    {portDOM && portDOM.rxDbm !== null && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Rx dBm:</span>
                        <span style={{ fontWeight: 600, color: portDOM.rxDbm < -30 ? "#ef4444" : portDOM.rxDbm < -20 ? "#f59e0b" : "#22c55e" }}>
                          {portDOM.rxDbm.toFixed(2)} dBm
                        </span>
                      </>
                    )}
                    {portDOM && portDOM.txDbm !== null && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Tx dBm:</span>
                        <span style={{ fontWeight: 600, color: portDOM.txDbm < -30 ? "#ef4444" : portDOM.txDbm < -20 ? "#f59e0b" : "#22c55e" }}>
                          {portDOM.txDbm.toFixed(2)} dBm
                        </span>
                      </>
                    )}
                    {portDOM && portDOM.tempC !== null && (
                      <>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>Temp.:</span>
                        <span style={{ fontWeight: 600, color: portDOM.tempC > 70 ? "#ef4444" : portDOM.tempC > 50 ? "#f59e0b" : "#374151" }}>
                          {portDOM.tempC.toFixed(0)} °C
                        </span>
                      </>
                    )}
                  </div>
                  </>
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
          <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "nodes" | "links" | "customers")} className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="nodes" className="flex-1">
                <Server className="w-3 h-3 mr-1" /> Nós ({nodes.length})
              </TabsTrigger>
              <TabsTrigger value="links" className="flex-1">
                <Link2 className="w-3 h-3 mr-1" /> Links ({links.length})
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex-1">
                <Users className="w-3 h-3 mr-1" /> Clientes ({customers.length})
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

            {/* Customers tab */}
            <TabsContent value="customers" className="mt-4 space-y-2">
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={openCreateCustomer}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar Cliente
                </Button>
                <Button size="sm" variant="outline" onClick={() => openCreateCustomerLink()}>
                  <Link2 className="w-4 h-4 mr-1" /> Novo Link
                </Button>
              </div>
              {customers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente cadastrado</p>
              )}
              {customers.map((customer) => {
                const cLinks = customerLinks.filter(cl => cl.customerId === customer.id);
                return (
                  <div key={customer.id} className="p-3 rounded-lg border border-border bg-card/50">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏠</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.address && <span>{customer.address} · </span>}
                          {customer.lat && customer.lng ? (
                            <span className="text-green-500">📍 {customer.lat.toFixed(4)}, {customer.lng.toFixed(4)}</span>
                          ) : (
                            <span className="text-amber-500">⚠ Sem coordenadas</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={customer.active ? "default" : "secondary"} className="text-xs">
                        {customer.active ? "Ativo" : "Inativo"}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCustomer(customer as MapCustomer)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreateCustomerLink(customer.id)}>
                        <Link2 className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                        if (confirm(`Remover "${customer.name}" e todos os links de acesso?`)) deleteCustomer.mutate({ id: customer.id });
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {cLinks.length > 0 && (
                      <div className="mt-2 pl-2 space-y-1 border-l-2 border-orange-200">
                        {cLinks.map(cl => {
                          const node = nodes.find(n => n.id === cl.nodeId);
                          return (
                            <div key={cl.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="text-orange-500">→</span>
                              <span className="flex-1 truncate">{node?.name ?? `Nó ${cl.nodeId}`}{cl.portName && ` (${cl.portName})`}</span>
                              <span>{cl.linkType}</span>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEditCustomerLink(cl as CustomerAccessLink)}>
                                <Pencil className="w-2.5 h-2.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => {
                                if (confirm("Remover link de acesso?")) deleteCustomerLink.mutate({ id: cl.id });
                              }}>
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
            {/* Nó Origem */}
            <div>
              <Label>Nó Origem *</Label>
              <Select value={linkForm.fromNodeId} onValueChange={(v) => setLinkForm((f) => ({ ...f, fromNodeId: v, fromPortId: "", fromPortName: "" }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Destinos múltiplos */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Destinos *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => setLinkForm((f) => ({ ...f, segments: [...f.segments, emptySegment()] }))}
                >
                  <Plus className="w-3 h-3 mr-1" /> Adicionar destino
                </Button>
              </div>
              <div className="space-y-2">
                {linkForm.segments.map((seg, idx) => {
                  const segToNode = nodes.find((n) => n.id.toString() === seg.toNodeId);
                  const segDeviceId = segToNode?.deviceId ?? null;
                  const segPorts = segDeviceId ? (portsByDeviceId[segDeviceId] ?? []) : [];
                  return (
                  <div key={idx} className="rounded-lg border border-border bg-muted/30 p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select
                          value={seg.toNodeId}
                          onValueChange={(v) => setLinkForm((f) => {
                            const segs = [...f.segments];
                            segs[idx] = { ...segs[idx], toNodeId: v, toPortId: "", toPortName: "" };
                            return { ...f, segments: segs, toNodeId: segs[0]?.toNodeId || "" };
                          })}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={`Destino ${idx + 1}...`} /></SelectTrigger>
                          <SelectContent>
                            {nodes.filter(n => n.id.toString() !== linkForm.fromNodeId).map((n) => (
                              <SelectItem key={n.id} value={n.id.toString()}>{NODE_ICONS[n.nodeType as NodeType]} {n.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {linkForm.segments.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => setLinkForm((f) => {
                            const segs = f.segments.filter((_, i) => i !== idx);
                            return { ...f, segments: segs, toNodeId: segs[0]?.toNodeId || "" };
                          })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    {/* Per-segment destination port selector */}
                    {seg.toNodeId && (
                      <div>
                        {segPorts.length > 0 ? (
                          <Select
                            key={`seg-port-${idx}-${seg.toNodeId}`}
                            value={seg.toPortId || "__none__"}
                            onValueChange={(v) => {
                              const p = segPorts.find((p) => p.portId.toString() === v);
                              setLinkForm((f) => {
                                const segs = [...f.segments];
                                segs[idx] = { ...segs[idx], toPortId: v === "__none__" ? "" : v, toPortName: p?.ifName || "" };
                                return { ...f, segments: segs };
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Porta do destino (opcional)..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Sem porta</SelectItem>
                              {segPorts.map((p) => (
                                <SelectItem key={p.portId} value={p.portId.toString()}>
                                  {p.ifName}{p.ifAlias ? ` — ${p.ifAlias}` : ""}
                                  {p.ifSpeed ? ` (${p.ifSpeed >= 1e9 ? `${p.ifSpeed / 1e9}G` : `${p.ifSpeed / 1e6}M`})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : segDeviceId ? (
                          <Input
                            className="h-7 text-xs"
                            value={seg.toPortName}
                            onChange={(e) => setLinkForm((f) => {
                              const segs = [...f.segments];
                              segs[idx] = { ...segs[idx], toPortName: e.target.value };
                              return { ...f, segments: segs };
                            })}
                            placeholder="Carregando portas..."
                          />
                        ) : (
                          <Input
                            className="h-7 text-xs"
                            value={seg.toPortName}
                            onChange={(e) => setLinkForm((f) => {
                              const segs = [...f.segments];
                              segs[idx] = { ...segs[idx], toPortName: e.target.value };
                              return { ...f, segments: segs };
                            })}
                            placeholder="Porta do destino (opcional, ex: 40GE0/0/1)"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
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
            <Button onClick={submitLink} disabled={!linkForm.fromNodeId || linkForm.segments.every(s => !s.toNodeId) || createLink.isPending || updateLink.isPending}>
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

      {/* ─── Customer Dialog ────────────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={customerDialog} onOpenChange={setCustomerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Adicionar Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={customerForm.name} onChange={(e) => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Empresa XYZ" />
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={customerForm.address} onChange={(e) => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="Ex: Rua das Flores, 123, Garanhuns" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitude</Label>
                <Input value={customerForm.lat} onChange={(e) => setCustomerForm(f => ({ ...f, lat: e.target.value }))} placeholder="Ex: -8.8897" type="number" step="any" />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input value={customerForm.lng} onChange={(e) => setCustomerForm(f => ({ ...f, lng: e.target.value }))} placeholder="Ex: -36.4965" type="number" step="any" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={customerForm.active}
                onCheckedChange={(v) => setCustomerForm(f => ({ ...f, active: v }))}
              />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCustomerDialog(false)}>Cancelar</Button>
            <Button onClick={submitCustomer} disabled={!customerForm.name || createCustomer.isPending || updateCustomer.isPending}>
              {editingCustomer ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Customer Access Link Dialog ────────────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={customerLinkDialog} onOpenChange={setCustomerLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCustomerLink ? "Editar Link de Acesso" : "Novo Link de Acesso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente *</Label>
              <Select value={customerLinkForm.customerId} onValueChange={(v) => setCustomerLinkForm(f => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Switch / Roteador *</Label>
              <Select value={customerLinkForm.nodeId} onValueChange={(v) => setCustomerLinkForm(f => ({ ...f, nodeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o nó..." /></SelectTrigger>
                <SelectContent>
                  {nodes.map(n => <SelectItem key={n.id} value={n.id.toString()}>{n.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Porta (opcional)</Label>
              <Input value={customerLinkForm.portName} onChange={(e) => setCustomerLinkForm(f => ({ ...f, portName: e.target.value }))} placeholder="Ex: GE0/0/1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Link</Label>
                <Select value={customerLinkForm.linkType} onValueChange={(v) => setCustomerLinkForm(f => ({ ...f, linkType: v as LinkType }))}>
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
                <Label>Capacidade (Mbps)</Label>
                <Input value={customerLinkForm.capacityBps} onChange={(e) => setCustomerLinkForm(f => ({ ...f, capacityBps: e.target.value }))} placeholder="Ex: 100" type="number" min="0" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Rota por estradas</div>
                <div className="text-xs text-muted-foreground">Traçar via OSRM</div>
              </div>
              <Switch
                checked={customerLinkForm.useRoadRoute}
                onCheckedChange={(v) => setCustomerLinkForm(f => ({ ...f, useRoadRoute: v }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={customerLinkForm.active}
                onCheckedChange={(v) => setCustomerLinkForm(f => ({ ...f, active: v }))}
              />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCustomerLinkDialog(false)}>Cancelar</Button>
            <Button onClick={submitCustomerLink} disabled={!customerLinkForm.customerId || !customerLinkForm.nodeId || createCustomerLink.isPending || updateCustomerLink.isPending}>
              {editingCustomerLink ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
