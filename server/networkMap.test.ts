/**
 * Tests for NetworkMap inactive-node visibility logic.
 * These tests validate the filtering logic that powers the "Ocultar inativos" toggle.
 */
import { describe, it, expect } from "vitest";

// Simulate the node type used in NetworkMap
interface NetworkNode {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  active: boolean;
}

// Replicate the filtering logic from NetworkMap.tsx
function getVisibleNodes(nodes: NetworkNode[], showInactive: boolean): NetworkNode[] {
  return showInactive ? nodes : nodes.filter((n) => n.active !== false);
}

function getNodesWithCoords(visibleNodes: NetworkNode[]): NetworkNode[] {
  return visibleNodes.filter((n) => n.lat && n.lng);
}

const mockNodes: NetworkNode[] = [
  { id: 1, name: "Router A", lat: -8.5, lng: -36.0, active: true },
  { id: 2, name: "Router B", lat: -9.0, lng: -37.0, active: true },
  { id: 3, name: "CIRCUITO DESPROVISIONADO", lat: -8.7, lng: -36.5, active: false },
  { id: 4, name: "Router D (no coords)", lat: null, lng: null, active: true },
  { id: 5, name: "Router E (inactive, no coords)", lat: null, lng: null, active: false },
];

describe("NetworkMap inactive node toggle logic", () => {
  it("shows all nodes when showInactiveNodes is true", () => {
    const visible = getVisibleNodes(mockNodes, true);
    expect(visible).toHaveLength(5);
  });

  it("hides inactive nodes when showInactiveNodes is false", () => {
    const visible = getVisibleNodes(mockNodes, false);
    expect(visible).toHaveLength(3);
    expect(visible.every((n) => n.active !== false)).toBe(true);
  });

  it("inactive node is not in visible list when toggle is off", () => {
    const visible = getVisibleNodes(mockNodes, false);
    const ids = visible.map((n) => n.id);
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(5);
  });

  it("nodesWithCoords filters out nodes without coordinates", () => {
    const visible = getVisibleNodes(mockNodes, true);
    const withCoords = getNodesWithCoords(visible);
    expect(withCoords).toHaveLength(3);
    expect(withCoords.every((n) => n.lat && n.lng)).toBe(true);
  });

  it("nodesWithCoords with inactive hidden returns only active nodes with coords", () => {
    const visible = getVisibleNodes(mockNodes, false);
    const withCoords = getNodesWithCoords(visible);
    expect(withCoords).toHaveLength(2);
    expect(withCoords.every((n) => n.active && n.lat && n.lng)).toBe(true);
  });
});

describe("MapFitBounds one-time execution logic", () => {
  it("fitBounds should only be called once (hasFitted guard)", () => {
    let callCount = 0;
    let hasFitted = false;

    function simulateFitBounds(nodes: NetworkNode[]) {
      if (hasFitted) return;
      const withCoords = nodes.filter((n) => n.lat && n.lng);
      if (withCoords.length === 0) return;
      hasFitted = true;
      callCount++;
    }

    // Simulate multiple renders (e.g., zoom events triggering re-renders)
    simulateFitBounds(mockNodes);
    simulateFitBounds(mockNodes);
    simulateFitBounds(mockNodes);

    expect(callCount).toBe(1);
  });

  it("fitBounds should not be called if no nodes have coordinates", () => {
    let callCount = 0;
    let hasFitted = false;

    function simulateFitBounds(nodes: NetworkNode[]) {
      if (hasFitted) return;
      const withCoords = nodes.filter((n) => n.lat && n.lng);
      if (withCoords.length === 0) return;
      hasFitted = true;
      callCount++;
    }

    const noCoordNodes: NetworkNode[] = [
      { id: 1, name: "A", lat: null, lng: null, active: true },
    ];

    simulateFitBounds(noCoordNodes);
    expect(callCount).toBe(0);
    expect(hasFitted).toBe(false);
  });
});
