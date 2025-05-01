
export interface RootPackageJson {
  workspaces: string[];
  'turbo-sync'?: {
    dotnet?: any;
  };
}

export interface PackageJson {
  name: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export interface TurboSyncWorkspaceResult {
  workspacePath: string;
  workspaceName: string;
}

export interface TurboSyncPlugin<TWorkspaceResult extends TurboSyncWorkspaceResult = TurboSyncWorkspaceResult> {
  readonly name: string;
  readonly workspaceFiles: string[];
  getWorkspaces: (args: { cwd: string, files: string[] }) => Promise<TWorkspaceResult[]>;
  updateWorkspace: (args: { cwd: string, packageJson: Partial<PackageJson> } & TWorkspaceResult) => Promise<PackageJson | undefined>;
}