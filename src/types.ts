
export interface TurboSyncPlugin<TWorkspaceResult extends TurboSyncWorkspaceResult = TurboSyncWorkspaceResult> {
  readonly name: string;
  readonly workspaceFiles: string[];
  readonly ignore: string[];
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
  'turbo-sync'?: TurboSyncConfig;
}

export interface PackageJson {
  name: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}
