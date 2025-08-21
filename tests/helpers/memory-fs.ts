import { vi } from 'vitest';
import { dirname, join, basename } from 'node:path';

export interface MemoryFileSystemEntry {
  type: 'file' | 'directory';
  content?: string;
  children?: Map<string, MemoryFileSystemEntry>;
}

export class MemoryFileSystem {
  private root: MemoryFileSystemEntry;

  constructor() {
    this.root = {
      type: 'directory',
      children: new Map()
    };
  }

  /**
   * Write a file to the memory filesystem
   */
  writeFile(filepath: string, content: string): void {
    const normalizedPath = this.normalizePath(filepath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    // Create parent directories if they don't exist
    let current = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children!.has(part)) {
        current.children!.set(part, {
          type: 'directory',
          children: new Map()
        });
      }
      current = current.children!.get(part)!;
    }

    // Write the file
    const filename = parts[parts.length - 1];
    current.children!.set(filename, {
      type: 'file',
      content
    });
  }

  /**
   * Read a file from the memory filesystem
   */
  readFile(filepath: string): string {
    const entry = this.getEntry(filepath);
    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, open '${filepath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -4058;
      error.path = filepath;
      throw error;
    }
    
    if (entry.type !== 'file') {
      const error = new Error(`EISDIR: illegal operation on a directory, read`) as NodeJS.ErrnoException;
      error.code = 'EISDIR';
      error.errno = -4068;
      error.path = filepath;
      throw error;
    }

    return entry.content || '';
  }

  /**
   * Check if a file or directory exists
   */
  exists(filepath: string): boolean {
    return this.getEntry(filepath) !== null;
  }

  /**
   * Get directory listing
   */
  readdir(dirpath: string): string[] {
    const entry = this.getEntry(dirpath);
    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, scandir '${dirpath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -4058;
      error.path = dirpath;
      throw error;
    }

    if (entry.type !== 'directory') {
      const error = new Error(`ENOTDIR: not a directory, scandir '${dirpath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOTDIR';
      error.errno = -4052;
      error.path = dirpath;
      throw error;
    }

    return Array.from(entry.children!.keys());
  }

  /**
   * Create a directory (and parent directories if needed)
   */
  mkdir(dirpath: string): void {
    const normalizedPath = this.normalizePath(dirpath);
    const parts = normalizedPath.split('/').filter(Boolean);
    
    let current = this.root;
    for (const part of parts) {
      if (!current.children!.has(part)) {
        current.children!.set(part, {
          type: 'directory',
          children: new Map()
        });
      }
      current = current.children!.get(part)!;
    }
  }

  /**
   * Get file/directory stats
   */
  stat(filepath: string): { isFile(): boolean; isDirectory(): boolean } {
    const entry = this.getEntry(filepath);
    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, stat '${filepath}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      error.errno = -4058;
      error.path = filepath;
      throw error;
    }

    return {
      isFile: () => entry.type === 'file',
      isDirectory: () => entry.type === 'directory'
    };
  }

  private getEntry(filepath: string): MemoryFileSystemEntry | null {
    const normalizedPath = this.normalizePath(filepath);
    
    if (normalizedPath === '' || normalizedPath === '/') {
      return this.root;
    }

    const parts = normalizedPath.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children.has(part)) {
        return null;
      }
      current = current.children.get(part)!;
    }

    return current;
  }

  private normalizePath(filepath: string): string {
    // Handle Windows and Unix paths, keep leading slash for absolute paths
    let normalized = filepath.replace(/\\/g, '/');
    
    // For absolute paths starting with /, remove the leading slash for internal storage
    // but preserve the path structure
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }

  /**
   * Load files from a structure object
   */
  loadFiles(structure: Record<string, string>): void {
    for (const [filepath, content] of Object.entries(structure)) {
      this.writeFile(filepath, content);
    }
  }

  /**
   * Get all files as a flat structure for debugging
   */
  getAllFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    
    const traverse = (entry: MemoryFileSystemEntry, path: string) => {
      if (entry.type === 'file') {
        files[path] = entry.content || '';
      } else if (entry.children) {
        for (const [name, child] of entry.children) {
          const childPath = path ? `${path}/${name}` : name;
          traverse(child, childPath);
        }
      }
    };

    traverse(this.root, '');
    return files;
  }
}

export interface FileSystemHelper {
  readFile(filepath: string): string;
  writeFile(filepath: string, content: string): void;
  exists(filepath: string): boolean;
  readdir(dirpath: string): string[];
  getFileContent(filepath: string): string | null;
  getAllFiles(): Record<string, string>;
  restore(): void;
}

export function createMemFS(initialFiles: Record<string, string> = {}): FileSystemHelper {
  const memfs = new MemoryFileSystem();
  memfs.loadFiles(initialFiles);

  // Mock Node.js fs functions to use our in-memory filesystem
  vi.doMock('node:fs', () => ({
    readFileSync: (filepath: string, encoding?: string) => {
      const content = memfs.readFile(filepath);
      return encoding ? content : Buffer.from(content);
    },
    existsSync: (filepath: string) => memfs.exists(filepath),
    readdirSync: (dirpath: string, options?: any) => {
      const entries = memfs.readdir(dirpath);
      if (options?.withFileTypes) {
        return entries.map(name => ({
          name,
          isDirectory: () => {
            try {
              return memfs.stat(join(dirpath, name)).isDirectory();
            } catch {
              return false;
            }
          },
          isFile: () => {
            try {
              return memfs.stat(join(dirpath, name)).isFile();
            } catch {
              return false;
            }
          }
        }));
      }
      return entries;
    },
    statSync: (filepath: string) => memfs.stat(filepath),
    writeFileSync: (filepath: string, content: string) => {
      memfs.writeFile(filepath, content);
    }
  }));

  // Mock fast-glob to work with our in-memory filesystem
  vi.doMock('fast-glob', () => ({
    default: {
      glob: async (pattern: string, options: any = {}) => {
        const cwd = options.cwd || '';
        const files: string[] = [];
        
        // Simple glob matching for common patterns like "packages/*/*.csproj"
        const allFiles = memfs.getAllFiles();
        const normalizedCwd = cwd.replace(/\\/g, '/').replace(/^\/+/, '');
        
        for (const [filepath, content] of Object.entries(allFiles)) {
          const relativePath = normalizedCwd ? filepath.replace(new RegExp(`^${normalizedCwd}/`), '') : filepath;
          
          // Simple pattern matching - convert glob to regex
          let regex = pattern
            .replace(/\*/g, '[^/]*')
            .replace(/\*\*/g, '.*')
            .replace(/\./g, '\\.');
          
          if (new RegExp(`^${regex}$`).test(relativePath)) {
            const fullPath = options.absolute ? `/${filepath}` : relativePath;
            files.push(fullPath);
          }
        }
        
        return files;
      }
    }
  }));

  vi.doMock('node:fs/promises', () => ({
    readFile: async (filepath: string, encoding?: string) => {
      const content = memfs.readFile(filepath);
      return encoding ? content : Buffer.from(content);
    },
    writeFile: async (filepath: string, content: string) => {
      memfs.writeFile(filepath, content);
    },
    readdir: async (dirpath: string, options?: any) => {
      const entries = memfs.readdir(dirpath);
      if (options?.withFileTypes) {
        return entries.map(name => ({
          name,
          isDirectory: () => {
            try {
              return memfs.stat(join(dirpath, name)).isDirectory();
            } catch {
              return false;
            }
          },
          isFile: () => {
            try {
              return memfs.stat(join(dirpath, name)).isFile();
            } catch {
              return false;
            }
          }
        }));
      }
      return entries;
    },
    stat: async (filepath: string) => memfs.stat(filepath),
    access: async (filepath: string) => {
      if (!memfs.exists(filepath)) {
        const error = new Error(`ENOENT: no such file or directory, access '${filepath}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        error.errno = -4058;
        error.path = filepath;
        throw error;
      }
    }
  }));

  return {
    readFile: (filepath: string) => memfs.readFile(filepath),
    writeFile: (filepath: string, content: string) => {
      memfs.writeFile(filepath, content);
    },
    exists: (filepath: string) => memfs.exists(filepath),
    readdir: (dirpath: string) => memfs.readdir(dirpath),
    getFileContent: (filepath: string) => {
      try {
        return memfs.readFile(filepath);
      } catch {
        return null;
      }
    },
    getAllFiles: () => memfs.getAllFiles(),
    restore: () => {
      vi.doUnmock('node:fs');
      vi.doUnmock('node:fs/promises');
      vi.doUnmock('fast-glob');
    }
  };
}