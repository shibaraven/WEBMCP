"use client";

import { useEffect, useMemo, useState } from "react";
import { createWebMcpTools, WEBMCP_TOOL_NAMES, type WebMcpCommandExecutor } from "./tools";

export type WebMcpRegistrationState = {
  status: "checking" | "ready" | "unavailable" | "error";
  discoveredCount: number;
  message: string;
};

export function useWebMcpTools(executeCommand: WebMcpCommandExecutor): WebMcpRegistrationState {
  const tools = useMemo(() => createWebMcpTools(executeCommand), [executeCommand]);
  const [registration, setRegistration] = useState<WebMcpRegistrationState>({
    status: "checking",
    discoveredCount: 0,
    message: "Checking browser support",
  });

  useEffect(() => {
    const context = document.modelContext;
    let active = true;
    if (!context) {
      queueMicrotask(() => {
        if (active) setRegistration({ status: "unavailable", discoveredCount: 0, message: "Use a WebMCP-compatible browser or extension" });
      });
      return () => { active = false; };
    }

    const controller = new AbortController();
    Promise.all(tools.map((tool) => Promise.resolve(context.registerTool(tool, { signal: controller.signal }))))
      .then(() => context.getTools())
      .then((registeredTools) => {
        if (!active) return;
        const names = new Set(registeredTools.map((tool) => tool.name));
        const discoveredCount = WEBMCP_TOOL_NAMES.filter((name) => names.has(name)).length;
        setRegistration(discoveredCount === WEBMCP_TOOL_NAMES.length
          ? { status: "ready", discoveredCount, message: "7/7 tools discovered on this origin" }
          : { status: "error", discoveredCount, message: `${discoveredCount}/7 tools discovered` });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setRegistration({ status: "error", discoveredCount: 0, message: error instanceof Error ? error.message : "Tool registration failed" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [tools]);

  return registration;
}
