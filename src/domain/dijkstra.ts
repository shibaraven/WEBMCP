import type { NodeId, RouteResult, WarehouseEdge, WarehouseNode } from "./types";

type Neighbor = { nodeId: NodeId; distanceMeters: number; edgeId: string };

export function findShortestPath(
  nodes: readonly WarehouseNode[],
  edges: readonly WarehouseEdge[],
  source: NodeId,
  destination: NodeId,
): RouteResult {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(source) || !nodeIds.has(destination)) {
    throw new Error(`Unknown route endpoint: ${source} -> ${destination}`);
  }

  const adjacency = new Map<NodeId, Neighbor[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (edge.distanceMeters < 0 || !Number.isFinite(edge.distanceMeters)) throw new Error(`Invalid edge weight: ${edge.id}`);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Edge ${edge.id} references an unknown node`);
    if (edge.blocked) continue;
    adjacency.get(edge.from)?.push({ nodeId: edge.to, distanceMeters: edge.distanceMeters, edgeId: edge.id });
    adjacency.get(edge.to)?.push({ nodeId: edge.from, distanceMeters: edge.distanceMeters, edgeId: edge.id });
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.edgeId.localeCompare(b.edgeId));
  }

  const distances = new Map<NodeId, number>(nodes.map((node) => [node.id, Infinity]));
  const previous = new Map<NodeId, NodeId>();
  const unvisited = new Set<NodeId>(nodes.map((node) => node.id));
  let visitedNodeCount = 0;
  distances.set(source, 0);

  while (unvisited.size > 0) {
    const current = [...unvisited].sort((a, b) => {
      const delta = (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity);
      return delta || a.localeCompare(b);
    })[0];
    const currentDistance = distances.get(current) ?? Infinity;
    if (!Number.isFinite(currentDistance)) break;
    unvisited.delete(current);
    visitedNodeCount += 1;
    if (current === destination) break;

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!unvisited.has(neighbor.nodeId)) continue;
      const candidate = currentDistance + neighbor.distanceMeters;
      const known = distances.get(neighbor.nodeId) ?? Infinity;
      const predecessor = previous.get(neighbor.nodeId);
      if (candidate < known || (candidate === known && (!predecessor || current.localeCompare(predecessor) < 0))) {
        distances.set(neighbor.nodeId, candidate);
        previous.set(neighbor.nodeId, current);
      }
    }
  }

  const distanceMeters = distances.get(destination) ?? Infinity;
  if (!Number.isFinite(distanceMeters)) return { found: false, path: [], distanceMeters, visitedNodeCount };

  const path: NodeId[] = [destination];
  while (path[0] !== source) {
    const predecessor = previous.get(path[0]);
    if (!predecessor) return { found: false, path: [], distanceMeters: Infinity, visitedNodeCount };
    path.unshift(predecessor);
  }
  return { found: true, path, distanceMeters: Number(distanceMeters.toFixed(3)), visitedNodeCount };
}
