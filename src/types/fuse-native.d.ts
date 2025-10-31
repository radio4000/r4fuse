declare module 'fuse-native' {
  interface Options {
    debug?: boolean;
  }

  interface Stat {
    mtime: number;
    atime: number;
    ctime: number;
    nlink: number;
    size: number;
    mode: number;
    uid: number;
    gid: number;
  }

  class Fuse {
    constructor(mountPoint: string, handlers: any, options?: Options);
    mount(callback: (err: Error | null) => void): void;
    unmount(callback: (err: Error | null) => void): void;

    // Error codes
    static EIO: number;
    static EROFS: number;
  }

  export = Fuse;
}