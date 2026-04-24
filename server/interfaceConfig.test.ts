import { describe, it, expect } from "vitest";

// ─── Testar lógica de formatação de bps (espelhada do InterfaceConfig.tsx) ────
function parseBps(value: string): number {
  const v = value.trim().toUpperCase();
  if (!v || v === "0") return 0;
  const match = v.match(/^([\d.]+)\s*(G|GBPS|GB|M|MBPS|MB|K|KBPS|KB)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] || "";
  if (unit.startsWith("G")) return num * 1e9;
  if (unit.startsWith("M")) return num * 1e6;
  if (unit.startsWith("K")) return num * 1e3;
  return num;
}

function formatBpsAlert(bps: number): string {
  if (!bps || bps <= 0) return "0 bps";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function calcUtilization(currentBps: number, referenceBps: number): number {
  if (!referenceBps || referenceBps <= 0) return 0;
  return Math.min(100, (currentBps / referenceBps) * 100);
}

describe("parseBps", () => {
  it("parses Gbps strings", () => {
    expect(parseBps("1G")).toBe(1e9);
    expect(parseBps("5G")).toBe(5e9);
    expect(parseBps("1.5G")).toBe(1.5e9);
    expect(parseBps("10GBPS")).toBe(10e9);
  });

  it("parses Mbps strings", () => {
    expect(parseBps("500M")).toBe(500e6);
    expect(parseBps("100MBPS")).toBe(100e6);
  });

  it("parses Kbps strings", () => {
    expect(parseBps("100K")).toBe(100e3);
  });

  it("returns 0 for empty or zero", () => {
    expect(parseBps("")).toBe(0);
    expect(parseBps("0")).toBe(0);
  });

  it("returns 0 for invalid strings", () => {
    expect(parseBps("invalid")).toBe(0);
  });
});

describe("formatBpsAlert", () => {
  it("formats Gbps", () => {
    expect(formatBpsAlert(5e9)).toBe("5.00 Gbps");
    expect(formatBpsAlert(1.5e9)).toBe("1.50 Gbps");
  });

  it("formats Mbps", () => {
    expect(formatBpsAlert(500e6)).toBe("500.0 Mbps");
    expect(formatBpsAlert(100e6)).toBe("100.0 Mbps");
  });

  it("formats Kbps", () => {
    expect(formatBpsAlert(100e3)).toBe("100 Kbps");
  });

  it("returns 0 bps for zero", () => {
    expect(formatBpsAlert(0)).toBe("0 bps");
  });
});

describe("calcUtilization", () => {
  it("calculates correct percentage", () => {
    expect(calcUtilization(5e9, 10e9)).toBe(50);
    expect(calcUtilization(8e9, 10e9)).toBe(80);
    expect(calcUtilization(10e9, 10e9)).toBe(100);
  });

  it("caps at 100%", () => {
    expect(calcUtilization(15e9, 10e9)).toBe(100);
  });

  it("returns 0 for zero reference", () => {
    expect(calcUtilization(5e9, 0)).toBe(0);
  });

  it("detects threshold breach", () => {
    const threshold = 80;
    const utilization = calcUtilization(8.5e9, 10e9);
    expect(utilization).toBeGreaterThanOrEqual(threshold);
  });
});
