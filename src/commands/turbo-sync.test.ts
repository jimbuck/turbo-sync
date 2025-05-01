import { execSync } from 'child_process';
import { join } from 'path';
import { readJson, writeJson } from '../utils/file-utils';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';

describe('turbo-sync CLI', () => {
  const rootDir = process.cwd();
  const packageJsonPath = join(rootDir, 'package.json');
  const originalPackageJson = readJson(packageJsonPath);

  beforeEach(() => {
    // Reset package.json to its original state before each test
    writeJson(packageJsonPath, originalPackageJson);
  });

  afterAll(() => {
    // Restore package.json to its original state after all tests
    writeJson(packageJsonPath, originalPackageJson);
  });

  it('should update all package.json files in the repository', () => {
    execSync('node bin/turbo-sync');

    const updatedPackageJson = readJson(packageJsonPath);
    expect(updatedPackageJson).toMatchObject({
      // Add expected changes to package.json here
    });
  });

  it('should update specific package.json files based on filter', () => {
    execSync('node bin/turbo-sync --filter workspace1');

    const updatedPackageJson = readJson(packageJsonPath);
    expect(updatedPackageJson).toMatchObject({
      // Add expected changes to package.json here
    });
  });
});
