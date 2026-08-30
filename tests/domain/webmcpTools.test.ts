import assert from "node:assert/strict";
import test from "node:test";
import { createWebMcpTools, WEBMCP_TOOL_NAMES } from "../../src/webmcp/tools";

test("exactly seven meaningful WebMCP tools are defined", () => {
  const tools = createWebMcpTools(() => ({}));
  assert.equal(tools.length, 7);
  assert.deepEqual(tools.map((tool) => tool.name), [...WEBMCP_TOOL_NAMES]);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 7);
});

test("all tools have strict JSON Schema and correct read/write annotations", () => {
  const tools = createWebMcpTools(() => ({}));
  const mutating = new Set(["propose_transport", "replan_mission"]);
  for (const tool of tools) {
    assert.equal((tool.inputSchema as { type: string }).type, "object");
    assert.equal((tool.inputSchema as { additionalProperties: boolean }).additionalProperties, false);
    assert.equal(tool.annotations?.readOnlyHint, !mutating.has(tool.name));
    assert.equal(tool.annotations?.untrustedContentHint, false);
    assert.ok(tool.description.length <= 500);
    assert.ok(tool.name.length <= 30);
  }
});

test("tool execution delegates arguments and respects cancellation", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const tools = createWebMcpTools((name, input) => {
    calls.push({ name, input });
    return { status: "ok" };
  });
  const signal = new AbortController().signal;
  await tools[1].execute({ locationId: "INBOUND-01" }, { signal });
  assert.deepEqual(calls, [{ name: "inspect_location", input: { locationId: "INBOUND-01" } }]);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(async () => { await tools[0].execute({}, { signal: controller.signal }); }, /cancelled/);
});
