#!/usr/bin/env node
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import debug from 'debug';
import { program } from 'commander';
import { turboSync } from './index.js';

const log = debug('turborepo-sync');

log('Starting turborepo-sync');

// Check if DEBUG environment variable is set
if (process.env.DEBUG) {
	log('Debug environment variable is set:', process.env.DEBUG);
}

// Process debug flags from command line
const debugFlagIndex = process.argv.indexOf('--debug');
if (debugFlagIndex !== -1) {
	debug.enable('turborepo-sync:*');
	log('Debug mode enabled via command line flag');
}

program
	.name('turborepo-sync')
	.description('CLI tool to update package.json files for non-JS projects in a turborepo repository')
	.option('--debug', 'Enable debug logging')
	.argument('[root]', 'Root directory of the repository (defaults to current working directory)')
	.action(async (root?: string, options?: { debug?: boolean }) => {
		if (options?.debug) {
			debug.enable('turborepo-sync:*');
			log('Debug logging enabled');
		}

		const cwd = root || process.cwd();
		if (root) {
			log(`Using custom root directory: ${root}`);
		}

		const hasRootPackageJson = await stat(join(cwd, 'package.json')).then(s => s.isFile(), () => false);
		if (!hasRootPackageJson) {
			console.error(`No package.json found in the specified root directory: ${cwd}`);
			return process.exit(1);
		}

		await turboSync({ cwd });
	});

program.parse(process.argv);

log('turborepo-sync execution completed');
