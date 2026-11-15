/**
 * Project folder handles kept in the browser (IndexedDB), by project name, so a loaded
 * project file can open its folder again without the folder picker (Chrome / Edge).
 */
const DB = "maha-chart";
const STORE = "folders";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function rememberHandle(
  name: string,
  h: FileSystemDirectoryHandle,
) {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(h, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* not remembered: the folder picker is still there */
  }
}

export async function recallHandle(
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const r = d.transaction(STORE).objectStore(STORE).get(name);
      r.onsuccess = () =>
        resolve((r.result as FileSystemDirectoryHandle) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

type Perm = {
  queryPermission?(o: object): Promise<string>;
  requestPermission?(o: object): Promise<string>;
};

/** True when the folder can be read now; `ask` may show the browser's permission prompt. */
export async function canRead(h: FileSystemDirectoryHandle, ask: boolean) {
  const x = h as unknown as Perm;
  try {
    if ((await x.queryPermission?.({ mode: "readwrite" })) === "granted")
      return true;
    if (!ask) return false;
    return (await x.requestPermission?.({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}
