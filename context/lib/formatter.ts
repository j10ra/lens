import type { CochangeRow, FileStatRow, FileMetadataRow } from "./structural";

export interface ContextData {
  goal: string;
  files: Array<{ path: string; reason: string }>;
  metadata: FileMetadataRow[];
  reverseImports: Map<string, string[]>;
  forwardImports: Map<string, string[]>;
  hop2Deps: Map<string, string[]>;
  cochanges: CochangeRow[];
  fileStats: Map<string, FileStatRow>;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.substring(i + 1) : p;
}

function daysAgo(d: Date | null): string {
  if (!d) return "unknown";
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function formatContextPack(data: ContextData): string {
  const L: string[] = [];
  const files = data.files.slice(0, 8);

  // Build exports lookup from metadata
  const exportsMap = new Map<string, string[]>();
  for (const m of data.metadata) {
    if (m.exports?.length) exportsMap.set(m.path, m.exports);
  }

  // Header
  L.push(`# ${data.goal}`);
  L.push("");

  // Files — with export signatures
  if (files.length > 0) {
    L.push("## Files");
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const exports = exportsMap.get(f.path);
      const exportStr = exports?.length
        ? ` — exports: ${exports.slice(0, 5).join(", ")}`
        : "";
      L.push(`${i + 1}. ${f.path}${exportStr}`);
    }
    L.push("");
  }

  // Dependency Graph — forward + reverse imports with 2-hop chains
  const depLines: string[] = [];
  for (const f of files.slice(0, 5)) {
    const fwd = data.forwardImports.get(f.path);
    const rev = data.reverseImports.get(f.path);
    const hop2 = data.hop2Deps.get(f.path);
    if (!fwd?.length && !rev?.length) continue;

    depLines.push(f.path);
    if (fwd?.length) {
      depLines.push(`  imports: ${fwd.slice(0, 5).map(basename).join(", ")}`);
    }
    if (rev?.length) {
      let revStr = rev.slice(0, 4).map(basename).join(", ");
      if (hop2?.length) {
        revStr += ` → ${hop2.slice(0, 3).map(basename).join(", ")}`;
      }
      depLines.push(`  imported by: ${revStr}`);
    }
  }
  if (depLines.length > 0) {
    L.push("## Dependency Graph");
    for (const line of depLines) L.push(line);
    L.push("");
  }

  // Co-change Clusters — group co-changes into clusters
  if (data.cochanges.length > 0) {
    const clusters = buildClusters(data.cochanges);
    if (clusters.length > 0) {
      L.push("## Co-change Clusters");
      for (const c of clusters) {
        L.push(`[${c.members.map(basename).join(", ")}] — ${c.count} co-commits`);
      }
      L.push("");
    }
  }

  // Activity
  const activityLines: string[] = [];
  for (const f of files.slice(0, 5)) {
    const stat = data.fileStats.get(f.path);
    if (!stat || stat.commit_count === 0) continue;
    activityLines.push(
      `${basename(f.path)}: ${stat.commit_count} commits, ${stat.recent_count}/90d, last: ${daysAgo(stat.last_modified)}`,
    );
  }
  if (activityLines.length > 0) {
    L.push("## Activity");
    for (const line of activityLines) L.push(line);
  }

  return L.join("\n");
}

interface Cluster {
  members: string[];
  count: number;
}

/** Group co-change rows into clusters by overlapping members */
function buildClusters(cochanges: CochangeRow[]): Cluster[] {
  const clusters: Cluster[] = [];

  for (const cc of cochanges) {
    // Try to merge into existing cluster
    let merged = false;
    for (const c of clusters) {
      if (c.members.includes(cc.path) || c.members.includes(cc.partner)) {
        if (!c.members.includes(cc.path)) c.members.push(cc.path);
        if (!c.members.includes(cc.partner)) c.members.push(cc.partner);
        c.count = Math.max(c.count, cc.count);
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ members: [cc.path, cc.partner], count: cc.count });
    }
  }

  return clusters
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
