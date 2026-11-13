declare module 'virtual:libredwg-wasm' {
  /** The LibreDWG wasm, gzipped, base64. */
  const b64: string;
  export default b64;
}

declare module 'libredwg-glue' {
  export interface LibreDwgModule {
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array;
      unlink(path: string): void;
    };
    dwg_write_dxf(dwg: string, dxf: string): number;
  }
  const createModule: (opts?: { wasmBinary?: ArrayBuffer; print?(s: string): void; printErr?(s: string): void }) => Promise<LibreDwgModule>;
  export default createModule;
}
