[CmdletBinding()]
param(
	[string]$PathToCheck
)

# This script facilitates .NET project integration within turborepo's workspace system.
# For each .NET project (.csproj file) found in the monorepo workspaces, it:
#   - Creates/updates a package.json with appropriate npm scripts based on project type (App, Library, Test, E2E)
#   - Formats the package name according to monorepo conventions (@namespace/package-name format)
#   - Parses the .csproj for <ProjectReference> entries and adds them as npm dependencies
#   - Ensures consistent script naming across the monorepo
#
# The script can be run:
#   - Against the entire monorepo (no parameters)
#   - Against a specific directory via the -PathToCheck parameter
#
# This enables .NET projects to participate in the monorepo's unified build system while
# maintaining proper dependency relationships between projects.

# Define project type constants
$ProjectType_App = "App"
$ProjectType_Library = "Library"
$ProjectType_Test = "Test"
$ProjectType_E2E = "E2E"

# Define default npm scripts for .NET projects.
$defaultScripts = @(
	@{Name = "dev"; Value = "dotnet run"; ApplicableTypes = @($ProjectType_App) },
	@{Name = "clean"; Value = "dotnet clean"; ApplicableTypes = @($ProjectType_App, $ProjectType_Library, $ProjectType_Test, $ProjectType_E2E) },
	@{Name = "build"; Value = "dotnet build"; ApplicableTypes = @($ProjectType_App, $ProjectType_Library, $ProjectType_Test, $ProjectType_E2E) },
	@{Name = "typecheck"; Value = "dotnet build"; ApplicableTypes = @($ProjectType_App, $ProjectType_Library, $ProjectType_Test, $ProjectType_E2E) },
	@{Name = "test"; Value = "dotnet test"; ApplicableTypes = @($ProjectType_Test) },
	@{Name = "e2e"; Value = "dotnet test"; ApplicableTypes = @($ProjectType_E2E) }
)

# Determine the repository root (assumes the script is in .pipelines/scripts)
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path

# Use the provided path or default to the repository root
if ($PathToCheck) {
	$pathToProcess = Resolve-Path $PathToCheck
}
else {
	$pathToProcess = $repoRoot
}

$topPackageJsonPath = Join-Path $repoRoot "package.json"

if (-not (Test-Path $topPackageJsonPath)) {
	Write-Error "Top-level package.json not found at $topPackageJsonPath"
	exit 1
}

# Read and parse the top-level package.json
try {
	$topPackageContent = Get-Content $topPackageJsonPath -Raw | ConvertFrom-Json
}
catch {
	Write-Error "Failed to parse top-level package.json: $_"
	exit 1
}

if (-not $topPackageContent.workspaces) {
	Write-Error "No 'workspaces' property found in top-level package.json."
	exit 1
}

$workspacePatterns = $topPackageContent.workspaces
Write-Verbose "Found workspace patterns:"
$workspacePatterns | ForEach-Object { Write-Verbose " - $_" }

# If a specific path is provided, ignore workspace patterns and process only that directory
if ($PathToCheck) {
	Write-Verbose "Processing provided path: $pathToProcess"
	$csprojFiles = Get-ChildItem -Path $pathToProcess -Recurse -Filter *.csproj -ErrorAction SilentlyContinue
	foreach ($csproj in $csprojFiles) {
		Update-PackageJsonForCsproj -CsprojPath $csproj.FullName
	}
	exit 0
}

# Formats JSON in a nicer format than the built-in ConvertTo-Json does.
function Format-Json([Parameter(Mandatory, ValueFromPipeline)][String] $json) {
	$indent = 0;
    ($json -Split "`r`n" | ForEach-Object {
		if ($_ -match '[\}\]]\s*,?\s*$') {
			# This line ends with ] or }, decrement the indentation level
			$indent--
		}
		$line = ('  ' * $indent) + $($_.TrimStart() -replace '":  (["{[])', '": $1' -replace ':  ', ': ')
		if ($_ -match '[\{\[]\s*$') {
			# This line ends with [ or {, increment the indentation level
			$indent++
		}
		$line
	}) -Join "`r`n"
}

# Formats a project name according to npm package naming convention
function Format-ProjectName {
	param (
		[Parameter(Mandatory)]
		[string]$ProjectName
	)
	# Convert to lowercase
	$name = $ProjectName.ToLower()
    
	# Split by dots and get the first part as namespace, rest as package name
	$parts = $name -split '\.'
	if ($parts.Count -gt 1) {
		$namespace = $parts[0]
		$packageName = $parts[1..($parts.Count - 1)] -join '-'
		return "@$namespace/$packageName"
	}
 else {
		# If no dots, just prefix with @
		return "@$name"
	}
}

# Function to determine the type of a .csproj file (App, Library, Test, or E2E)
function Get-ProjectType {
	param (
		[Parameter(Mandatory)]
		[System.Xml.XmlDocument]$CsprojXml,
		[Parameter(Mandatory)]
		[string]$ProjectName
	)
    
	# Check if it's a test project based on naming convention
	if ($ProjectName -match '\.Tests?$' -or $ProjectName -match '\.UnitTests?$') {
		return $ProjectType_Test
	}
    
	# Check if it's an E2E project based on naming convention
	if ($ProjectName -match '\.E2E$' -or $ProjectName -match '\.IntegrationTests?$') {
		return $ProjectType_E2E
	}
    
	# Check if this is a Web SDK project
	if ($CsprojXml.Project.Sdk -and $CsprojXml.Project.Sdk.Contains("Microsoft.NET.Sdk.Web")) {
		return $ProjectType_App
	}
    
	# Check for console apps (OutputType = Exe) or Azure Functions
	if ($CsprojXml.Project.PropertyGroup) {
		foreach ($propertyGroup in $CsprojXml.Project.PropertyGroup) {
			# Check for console apps (OutputType = Exe)
			if ($propertyGroup.OutputType -and $propertyGroup.OutputType -eq 'Exe') {
				return $ProjectType_App
			}
			# Check for Azure Functions
			if ($propertyGroup.AzureFunctionsVersion) {
				return $ProjectType_App
			}
		}
	}

	# Look for test frameworks in package references
	if ($CsprojXml.Project.ItemGroup) {
		$hasE2EPackages = $false
		$hasTestPackages = $false
		foreach ($itemGroup in $CsprojXml.Project.ItemGroup) {
			if ($itemGroup.PackageReference) {
				foreach ($package in $itemGroup.PackageReference) {
					$packageId = $package.Include
					if ($packageId -match 'xunit|nunit|mstest|fluentassertions|shouldly') {
						$hasTestPackages = $true
					}
					if ($packageId -match 'playwright|selenium|cypress|webdriver') {
						$hasE2EPackages = $true
					}
				}
			}
		}

		if ($hasE2EPackages) {
			return $ProjectType_E2E
		}

		if ($hasTestPackages) {
			return $ProjectType_Test
		}
	}
    
	# Default to Library if no other type identified
	return $ProjectType_Library
}

# Creates a new package.json object with default values
function New-PackageJsonObject {
	param (
		[string]$ProjectName
	)
    
	return [PSCustomObject]@{
		name         = Format-ProjectName -ProjectName $ProjectName
		version      = "0.0.1"
		private      = $true
		scripts      = [ordered]@{}
		dependencies = [ordered]@{}
	}
}

# Adds a script to a package.json object if it doesn't exist
function Add-ScriptToPackageJson {
	param (
		[Parameter(Mandatory)]
		[PSCustomObject]$PackageJson,
		[Parameter(Mandatory)]
		[string]$ScriptName,
		[Parameter(Mandatory)]
		[string]$ScriptValue
	)
    
	if (-not $PackageJson.scripts.Contains($ScriptName)) {
		$PackageJson.scripts[$ScriptName] = $ScriptValue
	}
}

# Adds a dependency to a package.json object
function Add-DependencyToPackageJson {
	param (
		[Parameter(Mandatory)]
		[PSCustomObject]$PackageJson,
		[Parameter(Mandatory)]
		[string]$DependencyName,
		[Parameter(Mandatory)]
		[string]$Version
	)
    
	$PackageJson.dependencies[$DependencyName] = $Version
}

# Compare two package.json objects and return true if they are different
function Compare-PackageJsonObjects {
	param (
		[Parameter(Mandatory)]
		[PSCustomObject]$First,
		[Parameter(Mandatory)]
		[PSCustomObject]$Second
	)
    
	# Compare basic properties
	if ($First.name -ne $Second.name) { 
		Write-Verbose "Package name different: '$($First.name)' vs '$($Second.name)'"
		return $true 
	}
	if ($First.version -ne $Second.version) { 
		Write-Verbose "Version different: '$($First.version)' vs '$($Second.version)'"
		return $true 
	}
	#if ($First.private -ne $Second.private) { return $true }
    
	# Compare scripts
	if ($First.scripts.Count -ne $Second.scripts.Count) { 
		Write-Verbose "Script count different: $($First.scripts.Count) vs $($Second.scripts.Count)"
		return $true 
	}
	foreach ($key in $First.scripts.Keys) {
		if (-not $Second.scripts.Contains($key)) { 
			Write-Verbose "Script missing: '$key'"
			return $true 
		}
		if ($First.scripts[$key] -ne $Second.scripts[$key]) { 
			Write-Verbose "Script '$key' different: '$($First.scripts[$key])' vs '$($Second.scripts[$key])'"
			return $true 
		}
	}
    
	# Compare dependencies
	if ($First.dependencies.Count -ne $Second.dependencies.Count) { 
		Write-Verbose "Dependencies count different: $($First.dependencies.Count) vs $($Second.dependencies.Count)"
		return $true 
	}
	foreach ($key in $First.dependencies.Keys) {
		if (-not $Second.dependencies.Contains($key)) { 
			Write-Verbose "Dependency missing: '$key'"
			return $true 
		}
		if ($First.dependencies[$key] -ne $Second.dependencies[$key]) { 
			Write-Verbose "Dependency '$key' version different: '$($First.dependencies[$key])' vs '$($Second.dependencies[$key])'"
			return $true 
		}
	}
    
	return $false
}

# Function to update or create package.json for a given .csproj file
function Update-PackageJsonForCsproj {
	param (
		[Parameter(Mandatory)]
		[string]$CsprojPath
	)
	Write-Verbose "Processing: $CsprojPath"

	$projectDir = Split-Path $CsprojPath -Parent
	$projectName = [System.IO.Path]::GetFileNameWithoutExtension($CsprojPath)
	$packageJsonPath = Join-Path $projectDir "package.json"

	# Create a new package.json object
	$packageJson = New-PackageJsonObject -ProjectName $projectName
    
	# Load existing package.json if it exists
	if (Test-Path $packageJsonPath) {
		try {
			$existingJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
			if ($existingJson) {
				# Preserve existing values but ensure object structure
				$packageJson = [PSCustomObject]@{
					name         = $existingJson.name
					version      = $existingJson.version
					private      = $existingJson.private
					scripts      = [ordered]@{}
					dependencies = [ordered]@{}
				}
                
				# Copy existing scripts
				if ($existingJson.scripts) {
					foreach ($prop in $existingJson.scripts.PSObject.Properties) {
						$packageJson.scripts[$prop.Name] = $prop.Value
					}
				}
			}
		}
		catch {
			Write-Error "Error parsing existing package.json at $packageJsonPath - $_"
			return
		}
	}

	# Parse the .csproj XML to determine the project type
	try {
		[xml]$csprojXml = Get-Content $CsprojPath -Raw
	}
	catch {
		Write-Error "Error parsing XML from $CsprojPath - $_"
		return
	}

	# Determine the project type
	$projectType = Get-ProjectType -CsprojXml $csprojXml -ProjectName $projectName

	# Add default scripts without overwriting user-defined ones
	foreach ($script in $defaultScripts) {
		# Skip scripts not applicable to this project type
		if (-not ($script.ApplicableTypes -contains $projectType)) {
			continue
		}
        
		Add-ScriptToPackageJson -PackageJson $packageJson -ScriptName $script.Name -ScriptValue $script.Value
	}

	# Clear dependencies (we will rebuild them)
	$packageJson.dependencies = [ordered]@{}

	# Loop through each ItemGroup to collect ProjectReference includes.
	if ($csprojXml.Project.ItemGroup) {
		foreach ($itemGroup in $csprojXml.Project.ItemGroup) {
			if ($itemGroup.ProjectReference) {
				foreach ($projRef in $itemGroup.ProjectReference) {
					if ($projRef.Include) {
						# Resolve the referenced csproj's full path relative to the current projectDir
						$refPath = $projRef.Include
						$refFullPath = Join-Path $projectDir $refPath
						$resolvedRef = Resolve-Path $refFullPath -ErrorAction SilentlyContinue
						if (-not $resolvedRef) {
							Write-Warning "Could not resolve reference '$refPath' in $CsprojPath"
							continue
						}

						$refProjectName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedRef.Path)
						$formattedRefName = Format-ProjectName -ProjectName $refProjectName
                        
						$refPackageJsonPath = Join-Path (Split-Path $resolvedRef.Path -Parent) "package.json"
						if (Test-Path $refPackageJsonPath) {
							$refPackageJson = Get-Content $refPackageJsonPath -Raw | ConvertFrom-Json
							$formattedRefName = $refPackageJson.name
							Write-Verbose "Found reference: $formattedRefName"
						}

						Add-DependencyToPackageJson -PackageJson $packageJson -DependencyName $formattedRefName -Version "*"
					}
				}
			}
		}
	}

	# Check for changes by comparing with existing package.json
	$hasChanges = $true
	if (Test-Path $packageJsonPath) {
		try {
			Write-Verbose "Comparing with existing package.json at $packageJsonPath"
			$existingJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
			$existingPackageJson = [PSCustomObject]@{
				name         = $existingJson.name
				version      = $existingJson.version
				private      = $existingJson.private
				scripts      = [ordered]@{}
				dependencies = [ordered]@{}
			}
            
			if ($existingJson.scripts) {
				foreach ($prop in $existingJson.scripts.PSObject.Properties) {
					$existingPackageJson.scripts[$prop.Name] = $prop.Value
				}
			}
            
			if ($existingJson.dependencies) {
				foreach ($prop in $existingJson.dependencies.PSObject.Properties) {
					$existingPackageJson.dependencies[$prop.Name] = $prop.Value
				}
			}
            
			$hasChanges = Compare-PackageJsonObjects -First $packageJson -Second $existingPackageJson
		}
		catch {
			Write-Verbose "Error comparing with existing package.json: $_"
			$hasChanges = $true
		}
	}
    
	# Only write the file if changes were detected
	if ($hasChanges) {
		$jsonOutput = $packageJson | ConvertTo-Json -Depth 10 | Format-Json
		Set-Content -Path $packageJsonPath -Value $jsonOutput -Encoding UTF8
		Write-Host "Updated package.json for project '$projectName' at $packageJsonPath" -ForegroundColor Green
	}
 else {
		Write-Host "No changes detected for $projectName ($packageJsonPath)."
	}
}

# Loop through each workspace glob pattern from the top-level package.json
foreach ($pattern in $workspacePatterns) {
	if ($pattern.StartsWith("!")) {
		continue;
	}
	$fullPattern = Join-Path $repoRoot $pattern
	Write-Verbose "Processing workspace pattern: $fullPattern"

	# Get matching directories (assumes that the pattern expands to directories)
	try {
		if (-not $fullPattern.Contains("*")) {
			Write-Verbose "Scanning directory: $fullPattern"
            
			# Check if the path exists
			if (Test-Path -Path $fullPattern -PathType Container) {
				# Recursively find all .csproj files in this workspace directory.
				$csprojFiles = Get-ChildItem -Path "$fullPattern\*" -Filter *.csproj -ErrorAction SilentlyContinue

				if ($csprojFiles.Count -gt 0) {
					$foundcsProj = $false
					foreach ($csproj in $csprojFiles) {
						$foundcsProj = $true
						Update-PackageJsonForCsproj -CsprojPath $csproj.FullName
					}

					if ($foundcsProj -eq $true) {
						Write-Verbose "Processed .csproj at top level of $fullPattern"
						continue
					}
				}
                
				# If no csproj files found at top level, get subdirectories
				$dirs = Get-ChildItem -Path $fullPattern -Directory -ErrorAction SilentlyContinue | 
				Where-Object { $_.Name -ne "node_modules" -and $_.Name -ne "obj" -and $_.Name -ne "bin" -and 
					$_.Name -ne "dist" -and -not $_.Name.StartsWith(".") }
			}
			else {
				Write-Warning "Directory not found: $fullPattern"
				continue
			}
		}
		else {
			# Handle glob patterns
			$dirs = Get-ChildItem -Path $fullPattern -Directory -ErrorAction SilentlyContinue | 
			Where-Object { $_.Name -ne "node_modules" -and $_.Name -ne "obj" -and $_.Name -ne "bin" -and 
				$_.Name -ne "dist" -and -not $_.Name.StartsWith(".") }
		}
        
		if ($dirs -and $dirs.Count -gt 0) {
			foreach ($dir in $dirs) {
				Write-Verbose "Scanning directory: $($dir.FullName)"
				# Recursively find all .csproj files in this workspace directory.
				$csprojFiles = Get-ChildItem -Path $dir.FullName -Recurse -Filter *.csproj -ErrorAction SilentlyContinue
				foreach ($csproj in $csprojFiles) {
					Update-PackageJsonForCsproj -CsprojPath $csproj.FullName
				}
			}
		}
		else {
			Write-Verbose "No valid directories found matching pattern: $pattern"
		}
	}
	catch {
		Write-Host "Error processing pattern '$pattern': $_" -ForegroundColor Red
	}
}