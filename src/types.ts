
export interface TurboSyncPluginDefinition<TWorkspaceResult extends TurboSyncWorkspaceResult> {
  readonly name: string;
  readonly workspaceFiles: string[];
  readonly ignore: string[];
  build(config: TurboSyncConfig): TurboSyncPlugin<TWorkspaceResult>;
}

export interface TurboSyncPlugin<TWorkspaceResult extends TurboSyncWorkspaceResult> {
  getWorkspaces: (args: { cwd: string, files: string[] }) => Promise<TWorkspaceResult[]>;
  updateWorkspace: (args: { cwd: string, packageJson: Partial<PackageJson>, isPnpm: boolean } & TWorkspaceResult) => Promise<PackageJson | undefined>;
}

export interface TurboSyncWorkspaceResult {
  workspacePath: string;
  workspaceName: string;
}

export interface TurboSyncConfig {
  [key: string]: unknown;
}

export interface RootPackageJson {
  workspaces: string[];
  packageManager?: string;
  'turborepo-sync'?: TurboSyncConfig;
}

export interface PackageJson {
  name: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}
