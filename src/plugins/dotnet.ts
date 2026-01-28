import { join, basename, extname, dirname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import { XMLParser } from 'fast-xml-parser';
import debug from 'debug';

import { PackageJson, TurboSyncConfig, TurboSyncPluginDefinition, TurboSyncPlugin, TurboSyncWorkspaceResult } from '../types.js';
import { readJson } from '../utils.js';

const log = debug('turborepo-sync:plugin:dotnet');

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

const DEFAULT_SCRIPT_ASSIGNMENTS: Record<DotnetProjectType, DotnetScripts[]> = {
  [DotnetProjectType.App]: ['dev', 'clean', 'build', 'typecheck'],
  [DotnetProjectType.Library]: ['clean', 'build', 'typecheck'],
  [DotnetProjectType.Test]: ['clean', 'build', 'typecheck', 'test'],
  [DotnetProjectType.E2E]: ['clean', 'build', 'typecheck', 'e2e'],
};

const PROJECT_FILE_EXTENSIONS = ['.csproj', '.fsproj', '.vbproj'];

export interface DotnetPluginConfig {
  scripts?: Record<string, string>;
  scriptAssignments?: Record<DotnetProjectType, string[]>;
};

export interface DotnetWorkspacesResult extends TurboSyncWorkspaceResult {
  projectFile: string;
}

export const dotnetPlugin: TurboSyncPluginDefinition<DotnetWorkspacesResult> = {
  name: 'dotnet',
  workspaceFiles: ['*.csproj', '*.fsproj', '*.vbproj'],
  ignore: ['**/bin/**', '**/obj/**'],
  build(config: TurboSyncConfig) {
    const dotnetConfig = (config.dotnet ?? {}) as DotnetPluginConfig;
    log('Initializing dotnet plugin with config:', config);

    const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

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
      updateWorkspace: async ({ packageJson, projectFile, isPnpm }) => {
        log(`Updating package.json for project file: ${projectFile}`);
        const content = await readFile(projectFile, 'utf-8');
        log('Parsing XML content');
        const projectData = xmlParser.parse(content);
        const name = getProjectName(projectFile);
        log(`Project name: ${name}`);

        const projectType = getProjectType(projectFile, projectData);
        log(`Detected project type: ${projectType}`);

        const scripts = DEFAULT_SCRIPT_ASSIGNMENTS[projectType].reduce((acc, script) => {
          const scriptCommand = dotnetConfig.scripts?.[script] ?? DEFAULT_SCRIPTS[script];
          acc[script] = packageJson.scripts?.[script] ?? scriptCommand;
          return acc;
        }, {} as Record<string, string>);
        const dependencies = await getProjectDependencies({ projectFilePath: projectFile, projectFile: projectData, isPnpm });

        log('Preparing updated package.json');

        return {
          name, ...packageJson,
          scripts: { ...packageJson.scripts, ...scripts },
          dependencies: { ...dependencies }
        };
      }
    };
  }
};

function getProjectName(projectFilePath: string): string {
  const projectName = basename(projectFilePath, extname(projectFilePath));
  const [prefix, ...suffixes] = projectName.toLowerCase().split('.');
  const suffixPart = suffixes.length > 0 ? suffixes.join('-').replace(/[\-\_]/gi, '-') : prefix;
  const formattedName = `@${prefix}/${suffixPart}`;
  log(`Formatted project name: ${projectName} -> ${formattedName}`);
  return formattedName;
}

function getProjectType(projectFilePath: string, projectFile: any): DotnetProjectType {
  const log = debug('turborepo-sync:plugin:dotnet:projectType');
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

  // For the remaining checks, we need to parse the proj file
  try {
    log('Checking project SDK and property groups');

    // Check if this is a Web SDK project
    if (projectFile.Project && projectFile.Project['@_Sdk'] && projectFile.Project['@_Sdk'].includes('Microsoft.NET.Sdk.Web')) {
      log('Detected web application based on SDK');
      return DotnetProjectType.App;
    }

    // Check for console apps (OutputType = Exe) or Azure Functions
    if (projectFile.Project && projectFile.Project.PropertyGroup) {
      const propertyGroups = Array.isArray(projectFile.Project.PropertyGroup) ?
        projectFile.Project.PropertyGroup : [projectFile.Project.PropertyGroup];

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
    if (projectFile.Project && projectFile.Project.ItemGroup) {
      log('Analyzing package references');
      let hasE2EPackages = false;
      let hasTestPackages = false;

      const itemGroups = Array.isArray(projectFile.Project.ItemGroup) ? projectFile.Project.ItemGroup : [projectFile.Project.ItemGroup];

      for (const itemGroup of itemGroups) {
        if (itemGroup.PackageReference) {
          const packageRefs = Array.isArray(itemGroup.PackageReference) ?
            itemGroup.PackageReference : [itemGroup.PackageReference];

          for (const packageRef of packageRefs) {
            const packageId = packageRef['@_Include'] || packageRef.Include;

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

async function getProjectDependencies({ projectFilePath, projectFile, isPnpm }: { projectFilePath: string, projectFile: any, isPnpm: boolean }): Promise<Record<string, string>> {
  const log = debug('turborepo-sync:plugin:dotnet:dependencies');
  log(`Analyzing project dependencies for: ${projectFilePath}`);

  const dependencies: Record<string, string> = {};
  const projectDir = dirname(projectFilePath);

  // Check if Project.ItemGroup exists and is not empty
  if (projectFile.Project && projectFile.Project.ItemGroup) {
    log('Found ItemGroups in project file');

    // Handle both single ItemGroup and array of ItemGroups
    const itemGroups = Array.isArray(projectFile.Project.ItemGroup)
      ? projectFile.Project.ItemGroup
      : [projectFile.Project.ItemGroup];

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
        const refPath = projRef['@_Include'] || projRef.Include;

        if (!refPath) continue;

        log(`Processing project reference: ${refPath}`);

        // Resolve the referenced project file's full path relative to the current projectDir
        const refFullPath = join(projectDir, refPath);
        log(`Resolved project reference path: ${refFullPath}`);

        // Check if the referenced project exists
        try {
          // Using statSync instead of Resolve-Path from PowerShell
          const projectFile = await stat(refFullPath);

          if (!projectFile.isFile()) {
            log(`Referenced project is not a file: ${refFullPath}`);
            continue;
          }

          // Check for existing package.json in the referenced project
          const refPackageJsonPath = join(dirname(refFullPath), 'package.json');
          const refPackageJson = await readJson<PackageJson>(refPackageJsonPath);
          const formattedRefName = refPackageJson?.name || getProjectName(refFullPath);
          log(`Found reference with package.json: ${formattedRefName}`);

          // Add the dependency to the collection
          dependencies[formattedRefName] = isPnpm ? 'workspace:*' : '*';
          log(`Added dependency: ${formattedRefName} = ${dependencies[formattedRefName]}`);
        } catch (error) {
          log(`Could not resolve reference '${refPath}' in ${projectFilePath}: ${error}`);
          continue;
        }
      }
    }
  }

  return dependencies;
}
