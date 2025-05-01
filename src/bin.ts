#!/usr/bin/env node

import debug from 'debug';
import { program } from 'commander';
import { turboSync } from './index.js';

const log = debug('turbo-sync');

log('Starting turbo-sync');

// Check if DEBUG environment variable is set
if (process.env.DEBUG) {
	log('Debug environment variable is set:', process.env.DEBUG);
}

// Process debug flags from command line
const debugFlagIndex = process.argv.indexOf('--debug');
if (debugFlagIndex !== -1) {
	debug.enable('turbo-sync:*');
	log('Debug mode enabled via command line flag');
}

program
	.name('turbo-sync')
	.description('CLI tool to update package.json files for non-JS projects in a turborepo repository')
	.option('--debug', 'Enable debug logging')
	.action(async (options: { debug?: boolean }) => {
		if (options.debug) {
			debug.enable('turbo-sync:*');
			log('Debug logging enabled');
		}

		const cwd = process.cwd();

		await turboSync({ cwd });
	});

program.parse(process.argv);

log('turbo-sync execution completed');
