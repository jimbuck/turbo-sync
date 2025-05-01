import { turboSyncCommand } from './commands/turbo-sync';
import debug from 'debug';

const log = debug('turbo-sync');

export function main() {
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

  turboSyncCommand();
  log('turbo-sync execution completed');
}

if (require.main === module) {
  main();
}
