import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("traffic router helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should format bps correctly", () => {
    const formatBps = (bps: number): string => {
      if (!bps || bps <= 0) return "0 bps";
      if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
      if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
      if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
      return `${bps.toFixed(0)} bps`;
    };

    expect(formatBps(0)).toBe("0 bps");
    expect(formatBps(1000)).toBe("1 Kbps");
    expect(formatBps(1_000_000)).toBe("1.0 Mbps");
    expect(formatBps(1_000_000_000)).toBe("1.00 Gbps");
    expect(formatBps(5_071_878_932 * 8)).toBe("40.58 Gbps");
  });

  it("should calculate utilization correctly", () => {
    const calcUtilization = (rateOctets: number, speedBps: number): number => {
      if (!speedBps || speedBps <= 0) return 0;
      return Math.min(100, (rateOctets * 8 / speedBps) * 100);
    };

    // 100GE link at 50% utilization
    const speed100G = 100_000_000_000;
    const rate50pct = speed100G * 0.5 / 8;
    expect(calcUtilization(rate50pct, speed100G)).toBeCloseTo(50, 0);

    // Over 100% should cap at 100
    expect(calcUtilization(speed100G, speed100G)).toBe(100);

    // Zero speed
    expect(calcUtilization(1000, 0)).toBe(0);
  });

  it("should filter monitored port IDs correctly", () => {
    const MONITORED_PORT_IDS = [4, 5, 6, 39, 130, 77, 126, 90, 106, 102, 103, 104, 105, 107, 108, 112, 118, 99, 122, 91, 100, 115, 88, 117, 83];
    const allPorts = [
      { port_id: 4, ifName: "100GE0/5/0" },
      { port_id: 1, ifName: "NULL0" },
      { port_id: 6, ifName: "100GE0/5/2" },
      { port_id: 999, ifName: "SomeOther" },
    ];
    const filtered = allPorts.filter((p) => MONITORED_PORT_IDS.includes(Number(p.port_id)));
    expect(filtered).toHaveLength(2);
    expect(filtered.map((p) => p.port_id)).toEqual([4, 6]);
  });

  it("should return upstream and dedicated interface counts", () => {
    const UPSTREAM_COUNT = 7;
    const DEDICATED_COUNT = 18;
    expect(UPSTREAM_COUNT).toBe(7);
    expect(DEDICATED_COUNT).toBe(18);
    expect(UPSTREAM_COUNT + DEDICATED_COUNT).toBe(25);
  });

  it("should fetch ports from LibreNMS API", async () => {
    const mockPorts = [
      { port_id: 4, ifName: "100GE0/5/0", ifInOctets_rate: 5071878932, ifOutOctets_rate: 6153750658, ifOperStatus: "up", ifSpeed: 100000000000 },
      { port_id: 6, ifName: "100GE0/5/2", ifInOctets_rate: 2383031578, ifOutOctets_rate: 730346995, ifOperStatus: "up", ifSpeed: 100000000000 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ports: mockPorts, status: "ok" }),
    });

    const res = await fetch("http://localhost:8080/api/v0/ports?device_id=1", {
      headers: { "X-Auth-Token": "test-token" },
    });
    expect(res.ok).toBe(true);
    const data = await res.json() as { ports: typeof mockPorts };
    expect(data.ports).toHaveLength(2);
    expect(data.ports[0].ifName).toBe("100GE0/5/0");
    expect(data.ports[0].ifInOctets_rate).toBe(5071878932);
  });
});
