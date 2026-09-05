import { join, resolve } from "path";
import { stat } from "fs/promises";
import type { PluginRegistry } from "./registry.js";

export interface DiscoveryConfig {
  /** Built-in plugins directory (shipped with the system) */
  builtinPluginsDir: string;
  /** User-added plugin directories */
  userPluginsDirs?: string[];
}

export class PluginDiscovery {
  constructor(
    private registry: PluginRegistry,
    private config: DiscoveryConfig
  ) {}

  async discoverAll(): Promise<void> {
    await this.registry.load();
  }

  getPluginIds(): string[] {
    return this.registry.getPluginIds();
  }

  listPluginSummaries() {
    return this.registry.getAllPlugins().map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      version: p.manifest.version,
      skillCount: p.skills.size,
    }));
  }
}