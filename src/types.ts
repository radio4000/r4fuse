/**
 * Type definitions for the r4fuse project
 */

export interface Stat {
  mtime: number;
  atime: number;
  ctime: number;
  nlink: number;
  size: number;
  mode: number;
  uid: number;
  gid: number;
}

export interface Track {
  id?: string;
  title?: string;
  url?: string;
  description?: string;
  discogs_url?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}