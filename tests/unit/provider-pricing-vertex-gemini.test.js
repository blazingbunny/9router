import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  PROVIDER_PRICING,
  PATTERN_PRICING,
  matchPattern,
  getPricingForModel,
} from "../../open-sse/providers/pricing.js";

// All Vertex AI SKU-sourced prices from:
// https://cloud.google.com/skus/sku-groups/deprecate-vertex-genai-offer-2025
// Service: Vertex AI (C7E2-9256-1C43)
// Standard (non-Priority, non-Batch) text input/output per 1M tokens.

// Vertex-specific prices live in PROVIDER_PRICING.vertex — isolated from the
// shared MODEL_PRICING table so other providers (gemini.js, github.js, etc.)
// serving the same model IDs are unaffected.

describe("Vertex Gemini pricing — PROVIDER_PRICING.vertex", () => {
  it("has vertex provider override", () => {
    expect(PROVIDER_PRICING.vertex).toBeDefined();
  });

  // --- Gemini 2.5 Pro ---
  it("gemini-2.5-pro has correct input price (SKU A121-E2B5-1418)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-pro"]).toBeDefined();
    expect(PROVIDER_PRICING.vertex["gemini-2.5-pro"].input).toBe(1.25);
  });
  it("gemini-2.5-pro has correct output price (SKU 5DA2-3F77-1CA5)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-pro"].output).toBe(10.0);
  });
  it("gemini-2.5-pro cached is 10% of input (0.13)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-pro"].cached).toBe(0.13);
  });

  // --- Gemini 2.5 Flash Lite ---
  it("gemini-2.5-flash-lite has correct input price (SKU F91E-007E-3BA1)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-flash-lite"]).toBeDefined();
    expect(PROVIDER_PRICING.vertex["gemini-2.5-flash-lite"].input).toBe(0.1);
  });
  it("gemini-2.5-flash-lite has correct output price (SKU 2D6E-6AC5-B1FD)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-flash-lite"].output).toBe(0.4);
  });
  it("gemini-2.5-flash-lite cached is 10% of input (0.01)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.5-flash-lite"].cached).toBe(0.01);
  });

  // --- Gemini 2.0 Flash ---
  it("gemini-2.0-flash has correct input price (SKU 1127-99B9-1860)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash"]).toBeDefined();
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash"].input).toBe(0.15);
  });
  it("gemini-2.0-flash has correct output price (SKU DFB0-8442-43A8)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash"].output).toBe(0.6);
  });

  // --- Gemini 2.0 Flash Lite ---
  it("gemini-2.0-flash-lite has correct input price (SKU CF72-F84C-8E3B)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash-lite"]).toBeDefined();
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash-lite"].input).toBe(0.075);
  });
  it("gemini-2.0-flash-lite has correct output price (SKU 4D69-506A-5D33)", () => {
    expect(PROVIDER_PRICING.vertex["gemini-2.0-flash-lite"].output).toBe(0.3);
  });
});

describe("Vertex Gemini pricing — MODEL_PRICING (unaffected, original values)", () => {
  // Shared MODEL_PRICING is NOT vertex-scoped — other providers use these entries.
  it("gemini-2.5-pro in MODEL_PRICING unchanged ($2.00/$12.00)", () => {
    expect(MODEL_PRICING["gemini-2.5-pro"].input).toBe(2.0);
    expect(MODEL_PRICING["gemini-2.5-pro"].output).toBe(12.0);
  });
  it("gemini-2.5-flash-lite in MODEL_PRICING unchanged ($0.15/$1.25)", () => {
    expect(MODEL_PRICING["gemini-2.5-flash-lite"].input).toBe(0.15);
    expect(MODEL_PRICING["gemini-2.5-flash-lite"].output).toBe(1.25);
  });
  it("gemini-2.0-flash and gemini-2.0-flash-lite absent from MODEL_PRICING", () => {
    expect(MODEL_PRICING["gemini-2.0-flash"]).toBeUndefined();
    expect(MODEL_PRICING["gemini-2.0-flash-lite"]).toBeUndefined();
  });
  // gemini-3.5-flash corrected in MODEL_PRICING — not Vertex-scoped
  it("gemini-3.5-flash-low corrected to $1.50/$9.00 (SKU 7EBE-3B46-F75C, 0127-F0B7-365E)", () => {
    expect(MODEL_PRICING["gemini-3.5-flash-low"].input).toBe(1.5);
    expect(MODEL_PRICING["gemini-3.5-flash-low"].output).toBe(9.0);
  });
  it("gemini-3.5-flash-extra-low corrected to $1.50/$9.00", () => {
    expect(MODEL_PRICING["gemini-3.5-flash-extra-low"].input).toBe(1.5);
    expect(MODEL_PRICING["gemini-3.5-flash-extra-low"].output).toBe(9.0);
  });
});

describe("Vertex Gemini pricing — PATTERN_PRICING", () => {
  it("gemini-*-flash-lite pattern match", () => {
    expect(matchPattern("gemini-*-flash-lite", "gemini-2.5-flash-lite")).toBe(
      true,
    );
  });
  it("gemini-*-flash-lite pattern corrected ($0.10/$0.40)", () => {
    const entry = PATTERN_PRICING.find(
      (e) => e.pattern === "gemini-*-flash-lite",
    );
    expect(entry).toBeDefined();
    expect(entry.pricing.input).toBe(0.1);
    expect(entry.pricing.output).toBe(0.4);
  });
});

describe("Vertex Gemini pricing — getPricingForModel resolution", () => {
  it("resolves vertex gemini-2.5-pro from PROVIDER_PRICING.vertex", () => {
    const p = getPricingForModel("vertex", "gemini-2.5-pro");
    expect(p.input).toBe(1.25);
    expect(p.output).toBe(10.0);
  });
  it("resolves vertex gemini-2.0-flash from PROVIDER_PRICING.vertex", () => {
    const p = getPricingForModel("vertex", "gemini-2.0-flash");
    expect(p.input).toBe(0.15);
    expect(p.output).toBe(0.6);
  });
  it("resolves non-vertex gemini-2.5-pro from MODEL_PRICING", () => {
    const p = getPricingForModel("gemini", "gemini-2.5-pro");
    expect(p.input).toBe(2.0);
    expect(p.output).toBe(12.0);
  });
  it("resolves vertex gemini-2.5-flash from MODEL_PRICING (no vertex override)", () => {
    const p = getPricingForModel("vertex", "gemini-2.5-flash");
    expect(p.input).toBe(0.3);
    expect(p.output).toBe(2.5);
  });
});
