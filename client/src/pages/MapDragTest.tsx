import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Test 1: Simple draggable prop
function Test1Marker() {
  const [pos, setPos] = useState<[number, number]>([-8.3, -37.0]);
  return (
    <Marker
      position={pos}
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const latlng = e.target.getLatLng();
          setPos([latlng.lat, latlng.lng]);
          console.log("[Test1] dragend:", latlng.lat, latlng.lng);
        },
      }}
    />
  );
}

// Test 2: useEffect + marker.dragging.enable()
function Test2Marker() {
  const markerRef = useRef<L.Marker | null>(null);
  const map = useMap();

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    console.log("[Test2] marker.dragging before enable:", marker.dragging?.enabled());
    if (marker.dragging) marker.dragging.enable();
    console.log("[Test2] marker.dragging after enable:", marker.dragging?.enabled());

    marker.on("dragstart", () => {
      console.log("[Test2] dragstart");
      map.dragging.disable();
    });
    marker.on("dragend", () => {
      const latlng = marker.getLatLng();
      console.log("[Test2] dragend:", latlng.lat, latlng.lng);
      map.dragging.enable();
    });
  }, [map]);

  return (
    <Marker
      ref={markerRef}
      position={[-8.35, -37.0]}
      draggable={true}
    />
  );
}

// Test 3: L.marker imperativo
function Test3Marker() {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker([-8.4, -37.0], { draggable: true }).addTo(map);
    console.log("[Test3] created imperative marker, dragging enabled:", marker.dragging?.enabled());

    marker.on("dragstart", () => {
      console.log("[Test3] dragstart");
    });
    marker.on("dragend", () => {
      const latlng = marker.getLatLng();
      console.log("[Test3] dragend:", latlng.lat, latlng.lng);
    });

    return () => { marker.remove(); };
  }, [map]);

  return null;
}

export default function MapDragTest() {
  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px", background: "#1e293b", color: "white", fontSize: "14px" }}>
        <strong>Drag Test</strong> — Abra o console e tente arrastar cada marcador:
        <br />🔵 Test1: draggable prop simples | 🔵 Test2: useEffect + enable() | 🔵 Test3: L.marker imperativo
      </div>
      <div style={{ flex: 1 }}>
        <MapContainer
          center={[-8.35, -37.0]}
          zoom={11}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Test1Marker />
          <Test2Marker />
          <Test3Marker />
        </MapContainer>
      </div>
    </div>
  );
}
