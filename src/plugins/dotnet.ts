import { join, basename, extname, dirname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import { XMLParser } from 'fast-xml-parser';
import debug from 'debug';

import { PackageJson, TurboSyncPlugin, TurboSyncWorkspaceResult } from '../types';
import { readJson } from '../utils/file-utils';

const log = debug('turbo-sync:plugin:dotnet');

enum DotnetProjectType {
  App = 'app',
  Library = 'lib',
  Test = 'test',
  E2E = 'e2e',
}

const DEFAULT_SCRIPTS = {
  'dev': 'dotnet run',
  'clean': 'dotnet clean',
  'build': 'dotnet build',
  'typecheck': 'dotnet build',
  'test': 'dotnet test',
  'e2e': 'dotnet watch test',
} as const;
type DotnetScripts = keyof typeof DEFAULT_SCRIPTS;

const DEFAULT_ASSIGNMENTS: Record<DotnetProjectType, DotnetScripts[]> = {
  [DotnetProjectType.App]: ['dev', 'clean', 'build', 'typecheck'],
  [DotnetProjectType.Library]: ['clean', 'build', 'typecheck'],
  [DotnetProjectType.Test]: ['clean', 'build', 'typecheck', 'test'],
  [DotnetProjectType.E2E]: ['clean', 'build', 'typecheck', 'e2e'],
};

const PROJECT_FILE_EXTENSIONS = ['.csproj'];

export interface DotnetPluginConfig {
  defaultScripts?: Record<DotnetProjectType, string[]>;
};

export interface DotnetWorkspacesResult extends TurboSyncWorkspaceResult {
  projectFile: string;
}

const dotnetPlugin = (config: DotnetPluginConfig) => {
  log('Initializing dotnet plugin with config:', config);

  const xmlParser = new XMLParser();

  return {
    getWorkspaces: async ({ files }) => {
      log(`Scanning ${files.length} files for .NET projects`);
      const projectFiles = files.filter(file => PROJECT_FILE_EXTENSIONS.some(ext => file.endsWith(ext)));
      log(`Found ${projectFiles.length} .NET project files`);

      return projectFiles.map(file => {
        const workspace = {
          workspacePath: join(file, '..'),
          workspaceName: getProjectName(file),
          projectFile: file,
        } as DotnetWorkspacesResult;

        log(`Found workspace: ${workspace.workspaceName} at ${workspace.workspacePath}`);
        return workspace;
      });
    },
    updateWorkspace: async ({ packageJson, projectFile }) => {
      log(`Updating package.json for project file: ${projectFile}`);
      const updatedPackageJson = await updatePackageJson(projectFile, packageJson);
      return updatedPackageJson;
    }
  } as TurboSyncPlugin<DotnetWorkspacesResult>;

  function updatePackageJson(projectFilePath: string, packageJson: Partial<PackageJson>) {
    log(`Selecting update strategy for project file: ${projectFilePath}`);
    if (projectFilePath.endsWith('.csproj')) return updatePackageJsonForCsProj(projectFilePath, packageJson);
  }

  async function updatePackageJsonForCsProj(projectFilePath: string, packageJson: Partial<PackageJson>): Promise<PackageJson> {
    log(`Reading .csproj file: ${projectFilePath}`);
    const content = await readFile(projectFilePath, 'utf-8');
    log('Parsing XML content');
    const csproj = xmlParser.parse(content);
    const name = getProjectName(projectFilePath);
    log(`Project name: ${name}`);

    const projectType = getCsProjectType(projectFilePath, csproj);
    log(`Detected project type: ${projectType}`);

    const scripts = DEFAULT_ASSIGNMENTS[projectType].reduce((acc, script) => {
      const scriptCommand = DEFAULT_SCRIPTS[script];
      acc[script] = scriptCommand;
      return acc;
    }, {} as Record<string, string>);
    const dependencies = await getCsProjectDependencies(projectFilePath, csproj);

    log('Preparing updated package.json');

    return {
      name, ...packageJson,
      scripts: { ...packageJson.scripts, ...scripts },
      dependencies: { ...packageJson.dependencies, ...dependencies }
    };
  }
}

export default dotnetPlugin;

function getProjectName(projectFilePath: string): string {
  const projectName = basename(projectFilePath, extname(projectFilePath));
  const [prefix, ...suffixes] = projectName.toLowerCase().split('.');
  const formattedName = `@${prefix}/${suffixes.join('-').replace(/[\-\_]/gi, '-')}`;
  log(`Formatted project name: ${projectName} -> ${formattedName}`);
  return formattedName;
}

function getCsProjectType(projectFilePath: string, csproj: any): DotnetProjectType {
  const log = debug('turbo-sync:plugin:dotnet:projectType');
  log(`Determining project type for: ${projectFilePath}`);

  const projectName = basename(projectFilePath, extname(projectFilePath));
  log(`Project base name: ${projectName}`);

  // Check if it's a test project based on naming convention
  if (/\.Tests?$/i.test(projectName) || /\.UnitTests?$/i.test(projectName)) {
    log('Detected test project based on naming convention');
    return DotnetProjectType.Test;
  }

  // Check if it's an E2E project based on naming convention
  if (/\.E2E$/i.test(projectName) || /\.IntegrationTests?$/i.test(projectName)) {
    log('Detected E2E project based on naming convention');
    return DotnetProjectType.E2E;
  }

  // For the remaining checks, we need to parse the csproj file
  try {
    log('Checking project SDK and property groups');

    // Check if this is a Web SDK project
    if (csproj.Project && csproj.Project['Sdk'] && csproj.Project['Sdk'].includes('Microsoft.NET.Sdk.Web')) {
      log('Detected web application based on SDK');
      return DotnetProjectType.App;
    }

    // Check for console apps (OutputType = Exe) or Azure Functions
    if (csproj.Project && csproj.Project.PropertyGroup) {
      const propertyGroups = Array.isArray(csproj.Project.PropertyGroup) ?
        csproj.Project.PropertyGroup : [csproj.Project.PropertyGroup];

      for (const propertyGroup of propertyGroups) {
        // Check for console apps (OutputType = Exe)
        if (propertyGroup.OutputType === 'Exe') {
          log('Detected console application based on OutputType=Exe');
          return DotnetProjectType.App;
        }
        // Check for Azure Functions
        if (propertyGroup.AzureFunctionsVersion) {
          log('Detected Azure Functions project');
          return DotnetProjectType.App;
        }
      }
    }

    // Look for test frameworks in package references
    if (csproj.Project && csproj.Project.ItemGroup) {
      log('Analyzing package references');
      let hasE2EPackages = false;
      let hasTestPackages = false;

      const itemGroups = Array.isArray(csproj.Project.ItemGroup) ? csproj.Project.ItemGroup : [csproj.Project.ItemGroup];

      for (const itemGroup of itemGroups) {
        if (itemGroup.PackageReference) {
          const packageRefs = Array.isArray(itemGroup.PackageReference) ?
            itemGroup.PackageReference : [itemGroup.PackageReference];

          for (const packageRef of packageRefs) {
            const packageId = packageRef['Include'] || packageRef.Include;

            if (packageId && /xunit|nunit|mstest|fluentassertions|shouldly/i.test(packageId)) {
              log(`Found test framework package: ${packageId}`);
              hasTestPackages = true;
            }

            if (packageId && /playwright|selenium|cypress|webdriver/i.test(packageId)) {
              log(`Found E2E test package: ${packageId}`);
              hasE2EPackages = true;
            }
          }
        }
      }

      if (hasE2EPackages) {
        log('Detected E2E project based on package references');
        return DotnetProjectType.E2E;
      }

      if (hasTestPackages) {
        log('Detected test project based on package references');
        return DotnetProjectType.Test;
      }
    }
  } catch (error) {
    log(`Error parsing project file: ${error}`);
    console.error(`Error parsing project file ${projectFilePath}:`, error);
  }

  log('Defaulting to library project type');
  // Default to Library if no other type identified
  return DotnetProjectType.Library;

}

async function getCsProjectDependencies(projectFilePath: string, csproj: any): Promise<Record<string, string>> {
  const log = debug('turbo-sync:plugin:dotnet:dependencies');
  log(`Analyzing project dependencies for: ${projectFilePath}`);

  const dependencies: Record<string, string> = {};
  const projectDir = dirname(projectFilePath);

  // Check if Project.ItemGroup exists and is not empty
  if (csproj.Project && csproj.Project.ItemGroup) {
    log('Found ItemGroups in project file');

    // Handle both single ItemGroup and array of ItemGroups
    const itemGroups = Array.isArray(csproj.Project.ItemGroup)
      ? csproj.Project.ItemGroup
      : [csproj.Project.ItemGroup];

    // Loop through each ItemGroup
    for (const itemGroup of itemGroups) {
      if (!itemGroup.ProjectReference) continue;

      log('Found ProjectReference elements');

      // Handle both single ProjectReference and array of ProjectReferences
      const projectRefs = Array.isArray(itemGroup.ProjectReference)
        ? itemGroup.ProjectReference
        : [itemGroup.ProjectReference];

      // Loop through each ProjectReference
      for (const projRef of projectRefs) {
        const refPath = projRef.Include || projRef['Include'];

        if (!refPath) continue;

        log(`Processing project reference: ${refPath}`);

        // Resolve the referenced csproj's full path relative to the current projectDir
        const refFullPath = join(projectDir, refPath);

        // Check if the referenced project exists
        try {
          // Using statSync instead of Resolve-Path from PowerShell
          const projectFile = await stat(refFullPath);

          if (!projectFile.isFile()) continue;

          // Check for existing package.json in the referenced project
          const refPackageJsonPath = join(dirname(refFullPath), 'package.json');
          const refPackageJson = await readJson<PackageJson>(refPackageJsonPath);
          const formattedRefName = refPackageJson?.name || getProjectName(refFullPath);
          log(`Found reference with package.json: ${formattedRefName}`);

          // Add the dependency to the collection
          dependencies[formattedRefName] = '*';
          log(`Added dependency: ${formattedRefName} = *`);
        } catch (error) {
          log(`Could not resolve reference '${refPath}' in ${projectFilePath}: ${error}`);
          continue;
        }
      }
    }
  }

  return dependencies;
}
