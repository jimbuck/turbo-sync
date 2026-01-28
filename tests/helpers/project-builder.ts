import path from 'path';

export interface ProjectStructure {
	files: Record<string, string>;
	packageJson?: {
		workspaces?: string[];
		turboSync?: Record<string, any>;
		[key: string]: any;
	};
}

export class ProjectBuilder {
	private structure: ProjectStructure = {
		files: {},
		packageJson: {
			name: 'test-workspace',
			workspaces: [],
		},
	};

	private basePath: string = '/project';

	constructor(basePath?: string) {
		if (basePath) {
			this.basePath = basePath;
		}
	}

	withWorkspaces(workspaces: string[]) {
		this.structure.packageJson!.workspaces = workspaces;
		return this;
	}

	withTurboSyncConfig(config: Record<string, any>) {
		this.structure.packageJson!['turbo-sync'] = config;
		return this;
	}

	withFile(filePath: string, content: string) {
		const fullPath = path.join(this.basePath, filePath);
		this.structure.files[fullPath] = content;
		return this;
	}

	// Specific project type helpers
	withDotNetProject(projectPath: string, projectType: 'app' | 'lib' | 'test' | 'e2e') {
		// Add appropriate csproj file and structure
		const projectName = path.basename(projectPath);
		const csprojContent = generateDotNetProjectFile(projectName, projectType);

		this.withFile(`${projectPath}/${projectName}.csproj`, csprojContent);

		if (projectType === 'app') {
			this.withFile(`${projectPath}/Program.cs`, 'namespace Test { class Program { static void Main() {} } }');
		} else {
			this.withFile(`${projectPath}/Class1.cs`, 'namespace Test { public class Class1 {} }');
		}

		return this;
	}

	withRustProject(projectPath: string) {
		// Add Cargo.toml and other files
		const projectName = path.basename(projectPath);
		this.withFile(`${projectPath}/Cargo.toml`, generateCargoToml(projectName));
		this.withFile(`${projectPath}/src/lib.rs`, 'pub fn add(left: usize, right: usize) -> usize { left + right }');
		return this;
	}

	withJsProject(projectPath: string, dependencies: Record<string, string> = {}) {
		this.withFile(`${projectPath}/package.json`, JSON.stringify({
			name: path.basename(projectPath),
			version: '1.0.0',
			dependencies
		}, null, 2));
		return this;
	}

	build(): Record<string, string> {
		// Add root package.json
		this.structure.files[path.join(this.basePath, 'package.json')] = JSON.stringify(
			this.structure.packageJson,
			null,
			2
		);

		return this.structure.files;
	}
}

// Helper functions to generate project files
function generateDotNetProjectFile(name: string, type: 'app' | 'lib' | 'test' | 'e2e'): string {
	const sdk = type === 'app' ? 'Microsoft.NET.Sdk.Web' : 'Microsoft.NET.Sdk';
	let content = `<Project Sdk="${sdk}">\n  <PropertyGroup>\n    <TargetFramework>net6.0</TargetFramework>\n`;

	if (type === 'test' || type === 'e2e') {
		content += '    <IsPackable>false</IsPackable>\n';
	}

	content += '  </PropertyGroup>\n';

	if (type === 'test' || type === 'e2e') {
		content += `  <ItemGroup>\n    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.0.0" />\n    <PackageReference Include="xunit" Version="2.4.1" />\n  </ItemGroup>\n`;
	}

	content += '</Project>';
	return content;
}

function generateCargoToml(name: string): string {
	return `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[dependencies]
`;
}