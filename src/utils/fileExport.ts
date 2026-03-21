/**
 * File export/import using system Save As dialog when available.
 * Falls back to download link for browsers without File System Access API.
 */

/** Save data using system Save As dialog. */
export async function saveFileAs(data: Blob, suggestedName: string): Promise<void> {
  // Try File System Access API (Chrome/Edge)
  if ("showSaveFilePicker" in window) {
    try {
      const ext = suggestedName.split(".").pop() || "json";
      const types: Array<{ description: string; accept: Record<string, string[]> }> = [];
      if (ext === "json") {
        types.push({ description: "mloop Session", accept: { "application/json": [".json"] } });
      } else if (ext === "wav") {
        types.push({ description: "WAV Audio", accept: { "audio/wav": [".wav"] } });
      }
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
        .showSaveFilePicker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return;
    } catch (e) {
      // User cancelled or API failed — fall through to download
      if ((e as DOMException).name === "AbortError") return;
    }
  }

  // Fallback: create download link
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open file using system file picker. */
export async function openFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    // Handle cancel
    input.oncancel = () => resolve(null);
    input.click();
  });
}
