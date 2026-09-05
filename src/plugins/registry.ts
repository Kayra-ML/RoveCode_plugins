import { readdir, readFile } from "fs/promises";
import { watch } from "fs";
import { join, resolve } from "path";
import type { Plugin, PluginManifest, SkillMetadata } from "../types/index.js";

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private pluginsDir: string;
  private loaded = false;
  private _dirty = false;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(pluginsDir: string) {
    this.pluginsDir = resolve(pluginsDir);
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    let entries: string[];
    try {
      entries = await readdir(this.pluginsDir);
    } catch {
      throw new Error(`Plugins directory not found: ${this.pluginsDir}`);
    }

    const loadPromises = entries.map(async (entry) => {
      const pluginDir = join(this.pluginsDir, entry);
      await this.loadPlugin(pluginDir, entry).catch((err) => {
        console.warn(`[registry] Skipping plugin ${entry}: ${err.message}`);
      });
    });

    await Promise.all(loadPromises);
    this.loaded = true;
  }

  private async loadPlugin(pluginDir: string, pluginId: string): Promise<void> {
    const manifestPath = join(pluginDir, "manifest.json");

    let manifestText: string;
    try {
      manifestText = await readFile(manifestPath, "utf-8");
    } catch {
      throw new Error(`No manifest.json in ${pluginDir}`);
    }

    let manifest: PluginManifest;
    try {
      // Strip UTF-8 BOM if present (written by some Windows editors)
      const cleaned = manifestText.replace(/^\uFEFF/, "");
      manifest = JSON.parse(cleaned);
    } catch {
      throw new Error(`Invalid JSON in manifest: ${manifestPath}`);
    }

    // Load skill metadata without loading skill bodies
    const skillsMetaDir = join(pluginDir, "skills-meta");
    const skills = new Map<string, SkillMetadata>();

    let metaFiles: string[];
    try {
      metaFiles = await readdir(skillsMetaDir);
    } catch {
      metaFiles = []; // Plugin may have no skills yet
    }

    await Promise.all(
      metaFiles
        .filter((f) => f.endsWith(".json"))
        .map(async (metaFile) => {
          const metaPath = join(skillsMetaDir, metaFile);
          try {
            const metaText = await readFile(metaPath, "utf-8");
            const raw = JSON.parse(metaText);
            const meta: SkillMetadata = {
              ...raw,
              requires: raw.requires ?? undefined,
              suggests: raw.suggests ?? undefined,
              extends: raw.extends ?? undefined,
            };
            // Resolve bodyPath relative to pluginDir
            meta.bodyPath = join(pluginDir, meta.bodyPath);
            skills.set(meta.id, meta);
          } catch (err: any) {
            console.warn(`[registry] Skipping skill meta ${metaFile}: ${err.message}`);
          }
        })
    );

    // Resolve `extends`: merge parent activationSignals into child (union, no duplicates)
    for (const skill of skills.values()) {
      if (!skill.extends) continue;
      const parent = skills.get(skill.extends);
      if (!parent) continue;
      const merged = new Set([...skill.activationSignals, ...parent.activationSignals]);
      skill.activationSignals = Array.from(merged);
    }

    this.plugins.set(manifest.id, { manifest, skills, pluginDir });
  }

  startWatching(): void {
    if (this.watcher) return; // already watching
    this.watcher = watch(
      this.pluginsDir,
      { recursive: true },
      (event, filename) => {
        if (!filename) return;
        // Invalidate only the affected plugin
        const parts = (filename as string).replace(/\\/g, "/").split("/");
        const pluginId = parts[0];
        if (pluginId && this.plugins.has(pluginId)) {
          this.plugins.delete(pluginId);
        }
        // Full reload triggered on next getAllPlugins() or getPlugin() call
        this._dirty = true;
      }
    );
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  getPlugin(id: string): Plugin | undefined {
    if (this._dirty) {
      this._reloadDirty();
    }
    return this.plugins.get(id);
  }

  getAllPlugins(): Plugin[] {
    if (this._dirty) {
      this._reloadDirty();
    }
    return Array.from(this.plugins.values());
  }

  private _reloadDirty(): void {
    this._dirty = false;
    // Reset loaded flag so load() will re-scan the directory
    this.loaded = false;
    // Fire-and-forget async reload; synchronous callers get stale data for
    // at most one call while the reload is in flight, which is acceptable for
    // a cache-invalidation hot-path.
    this.load().catch((err) => {
      console.warn("[registry] Hot-reload failed:", err.message);
    });
  }

  getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  getSkillMetadata(pluginId: string, skillId: string): SkillMetadata | undefined {
    return this.plugins.get(pluginId)?.skills.get(skillId);
  }

  async loadSkillBody(meta: SkillMetadata): Promise<string> {
    try {
      return await readFile(meta.bodyPath, "utf-8");
    } catch {
      throw new Error(`Skill body not found: ${meta.bodyPath}`);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}