import { join, basename, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import toml from 'toml';
import debug from 'debug';

import { PackageJson, TurboSyncConfig, TurboSyncPlugin, TurboSyncPluginDefinition, TurboSyncWorkspaceResult } from '../types.js';
import { readJson } from '../utils.js';
import pMap from 'p-map';

interface CargoToml {
	package?: {
		name?: string;
		version?: string;
		metadata?: {
			'turborepo-sync'?: {
				name?: string;
				scripts?: Record<string, string>;
			};
		};
	};
	dependencies?: Record<string, string | { path: string }>;
}

const log = debug('turborepo-sync:plugin:rust');

const CARGO_FILE = 'Cargo.toml';

const DEFAULT_SCRIPTS = {
	build: 'cargo build',
	test: 'cargo test',
	clean: 'cargo clean',
	dev: 'cargo run',
} as const;

export interface RustPluginConfig {
	scripts?: Record<string, string>;
}

export interface RustWorkspacesResult extends TurboSyncWorkspaceResult {
	cargoFile: string;
}

export const rustPlugin: TurboSyncPluginDefinition<RustWorkspacesResult> = {
	name: 'rust',
	workspaceFiles: [CARGO_FILE],
	ignore: ['**/target/**'],
	build(config: TurboSyncConfig) {
		const rustConfig = (config.rust ?? {}) as RustPluginConfig;
		log('Initializing rust plugin with config:', config);

		return {
			getWorkspaces: async ({ files }) => {
				log(`Scanning ${files.length} files for Rust projects`);
				const cargoFiles = files.filter(file => basename(file) === CARGO_FILE);
				log(`Found ${cargoFiles.length} Rust project files`);

				const workspaces = pMap(cargoFiles, async (cargoFile: string) => {
					const packageJson = await readJson<PackageJson>(join(dirname(cargoFile), 'package.json'));
					const cargoData = await readTomlFile(cargoFile);

					const workspace = {
						workspacePath: dirname(cargoFile),
						workspaceName: getProjectName({ cargoFile: cargoFile, cargoData: cargoData!, packageJson }),
						cargoFile: cargoFile,
					} as RustWorkspacesResult;

					log(`Found workspace: ${workspace.workspaceName} at ${workspace.workspacePath}`);
					return workspace;
				});

				return workspaces;
			},
			updateWorkspace: async ({ packageJson, isPnpm, cargoFile }) => {
				log(`Updating package.json for cargo file: ${cargoFile}`);

				log(`Reading cargo file: ${cargoFile}`);
				const cargoData = await readTomlFile<CargoToml>(cargoFile);
				const name = getProjectName({ cargoFile, cargoData, packageJson });
				log(`Project name: ${name}`);

				const dependencies: Record<string, string> = {};

				for (const [key, value] of Object.entries(cargoData?.dependencies || {})) {
					// Handle dependencies that might be objects with path or version
					if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string') {
						const depPath = value.path;
						const depCargoFile = join(dirname(cargoFile), depPath, CARGO_FILE);
						const depCargoData = await readTomlFile<CargoToml>(depCargoFile);
						const depPackageJsonFile = join(dirname(cargoFile), depPath, 'package.json');
						const depPackageJson = await readJson<PackageJson>(depPackageJsonFile);
						const depName = getProjectName({ cargoFile: depCargoFile, cargoData: depCargoData, packageJson: depPackageJson });
						log(`Found path dependency: ${key} with path ${depPath}, cargo file: ${depCargoFile}`);

						// Use the path in the dependency name to indicate the relationship
						dependencies[depName] = isPnpm ? 'workspace:*' : '*';
					}
				}

				log('Preparing updated package.json');

				// Get custom scripts from metadata if available
				const customScripts = cargoData?.package?.metadata?.['turborepo-sync']?.scripts || {};
				const scripts = { ...DEFAULT_SCRIPTS, ...customScripts };

				return {
					name, ...packageJson,
					scripts: { ...packageJson.scripts, ...scripts },
					dependencies: { ...packageJson.dependencies, ...dependencies },
				};
			}
		} as TurboSyncPlugin<RustWorkspacesResult>;
	}
}

function getProjectName({ cargoFile, cargoData, packageJson }: { cargoFile: string, cargoData: CargoToml | undefined, packageJson: Partial<PackageJson> | undefined }): string {
	if (packageJson?.name) {
		log(`Project name from package.json: ${packageJson.name}`);
		return packageJson.name;
	}

	// Check for custom metadata first
	if (cargoData?.package?.metadata?.['turborepo-sync']?.name) {
		const customName = cargoData.package.metadata['turborepo-sync'].name;
		log(`Project name from Cargo.toml metadata: ${customName}`);
		return customName;
	}

	if (cargoData && cargoData.package && cargoData.package.name) {
		log(`Project name from Cargo.toml: ${cargoData.package.name}`);
		return `@rust/${cargoData.package.name}`;
	}
	const projectName = basename(dirname(cargoFile));
	const formattedName = `@rust/${projectName}`;
	log(`Project name computed from directory name: ${formattedName}`);
	return formattedName;
}

async function readTomlFile<T>(filePath: string): Promise<T | undefined> {
	log(`Reading TOML file: ${filePath}`);
	try {
		const fileContent = await readFile(filePath, 'utf-8');
		return toml.parse(fileContent);
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			log(`File not found: ${filePath}`);
			return undefined;
		}
		log(`Error reading file: ${filePath}`, error);
		throw error;
	}
}