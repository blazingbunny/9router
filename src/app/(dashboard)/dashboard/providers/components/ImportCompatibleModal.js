"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Modal } from "@/shared/components";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider";
}

function stripEndpointSuffix(url) {
  return String(url || "").replace(/\/(chat\/completions|completions|responses)\/?$/i, "");
}

// OpenCode config.json: { provider: { <key>: { name, options: { baseURL, apiKey }, models: { <modelId>: {...} } } } }
function parseOpenCodeConfig(json) {
  const entries = Object.entries(json?.provider || {});
  if (entries.length === 0) return null;
  const [key, entry] = entries[0];
  const baseUrl = entry?.options?.baseURL;
  if (!baseUrl) return null;
  return {
    name: entry.name || key,
    prefix: slugify(entry.name || key),
    baseUrl: stripEndpointSuffix(baseUrl),
    apiKey: entry.options?.apiKey || "",
    models: Object.keys(entry.models || {}),
  };
}

// Fallback for other shapes: recursively find the first object with a baseURL-ish key,
// take API-key-ish and models-ish sibling keys. Deterministic, no LLM involved.
const BASE_URL_KEY_RE = /^(base_?url|endpoint|api_?base)$/i;
const API_KEY_KEY_RE = /^(api_?key|token|secret|apikey)$/i;
const MODELS_KEY_RE = /^models?$/i;
const NAME_KEY_RE = /^(name|provider|id)$/i;

function findGenericConfig(node, parentKey = "") {
  if (!node || typeof node !== "object") return null;
  const keys = Object.keys(node);
  const baseUrlKey = keys.find((k) => BASE_URL_KEY_RE.test(k) && typeof node[k] === "string");
  if (baseUrlKey) {
    const apiKeyKey = keys.find((k) => API_KEY_KEY_RE.test(k) && typeof node[k] === "string");
    const modelsKey = keys.find((k) => MODELS_KEY_RE.test(k));
    let models = [];
    if (modelsKey) {
      const val = node[modelsKey];
      if (Array.isArray(val)) models = val.map((m) => (typeof m === "string" ? m : m?.id || m?.name)).filter(Boolean);
      else if (val && typeof val === "object") models = Object.keys(val);
    }
    return {
      name: node[keys.find((k) => NAME_KEY_RE.test(k))] || parentKey || "Imported Provider",
      prefix: slugify(node[keys.find((k) => NAME_KEY_RE.test(k))] || parentKey),
      baseUrl: stripEndpointSuffix(node[baseUrlKey]),
      apiKey: apiKeyKey ? node[apiKeyKey] : "",
      models,
    };
  }
  for (const k of keys) {
    const found = findGenericConfig(node[k], k);
    if (found) return found;
  }
  return null;
}

function parseProviderConfig(text) {
  const json = JSON.parse(text);
  return parseOpenCodeConfig(json) || findGenericConfig(json);
}

function ImportCompatibleModal({ isOpen, onClose, onCreated }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [detectedModels, setDetectedModels] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("upload");

  const reset = () => {
    setFileName("");
    setParsed(null);
    setDetectedModels([]);
    setError("");
    setStep("upload");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    try {
      const text = await file.text();
      const result = parseProviderConfig(text);
      if (!result) throw new Error("Could not find a provider base URL in this file.");
      setParsed({ name: result.name, prefix: result.prefix, baseUrl: result.baseUrl, apiKey: result.apiKey });
      setDetectedModels(result.models.map((id) => ({ id, selected: true })));
      setStep("review");
    } catch (err) {
      setError(err.message || "Could not parse this file — it may not be a supported provider config.");
      setParsed(null);
    }
  };

  const update = (field, value) => setParsed((prev) => ({ ...prev, [field]: value }));
  const toggleModel = (id) =>
    setDetectedModels((prev) => prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m)));

  const handleCreate = async () => {
    if (!parsed?.name.trim() || !parsed?.prefix.trim() || !parsed?.baseUrl.trim() || !parsed?.apiKey.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const nodeRes = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parsed.name,
          prefix: parsed.prefix,
          apiType: "chat",
          baseUrl: parsed.baseUrl,
          type: "openai-compatible",
        }),
      });
      const nodeData = await nodeRes.json();
      if (!nodeRes.ok) throw new Error(nodeData.error || "Failed to create provider");
      const node = nodeData.node;

      const connRes = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: node.id, apiKey: parsed.apiKey, name: "imported", priority: 1 }),
      });
      const connData = await connRes.json();
      if (!connRes.ok) throw new Error(connData.error || "Failed to create connection");

      for (const model of detectedModels.filter((m) => m.selected)) {
        await fetch("/api/models/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAlias: node.id, id: model.id, type: "llm" }),
        });
      }

      onCreated(node);
      reset();
    } catch (err) {
      setError(err.message || "Failed to import provider");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Import Provider from File" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Upload a provider config export (OpenCode config.json or similar) — the base URL,
          API key, and model list are extracted automatically. Review before creating.
        </p>

        {step === "upload" && (
          <div>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              className="block w-full text-sm text-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-border file:bg-sidebar file:text-sm file:cursor-pointer"
            />
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
        )}

        {step === "review" && parsed && (
          <>
            <p className="text-xs text-text-muted">
              From: {fileName} —{" "}
              <button className="underline" onClick={reset}>
                choose a different file
              </button>
            </p>
            <Input label="Name" value={parsed.name} onChange={(e) => update("name", e.target.value)} />
            <Input
              label="Prefix"
              value={parsed.prefix}
              onChange={(e) => update("prefix", e.target.value)}
              hint="Used as the model-id prefix, e.g. inferx/model-name."
            />
            <Input
              label="Base URL"
              value={parsed.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              hint="Endpoint suffixes like /chat/completions are stripped automatically."
            />
            <Input
              label="API Key"
              type="password"
              value={parsed.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              hint="Read directly from the uploaded file — verify it's current before creating."
            />
            <div>
              <p className="text-xs text-text-muted mb-1">
                Models ({detectedModels.filter((m) => m.selected).length}/{detectedModels.length} selected)
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-border rounded-lg p-2">
                {detectedModels.length === 0 && (
                  <p className="text-xs text-text-muted">No models found in file — add them manually after creating.</p>
                )}
                {detectedModels.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={m.selected} onChange={() => toggleModel(m.id)} />
                    <code className="text-xs">{m.id}</code>
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleCreate}
                fullWidth
                disabled={
                  !parsed.name.trim() || !parsed.prefix.trim() || !parsed.baseUrl.trim() || !parsed.apiKey.trim() || submitting
                }
              >
                {submitting ? "Creating..." : "Create"}
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

ImportCompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default ImportCompatibleModal;
