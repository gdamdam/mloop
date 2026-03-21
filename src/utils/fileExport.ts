/**
 * File export/import using the File System Access API when available.
 *
 * Prefers showSaveFilePicker (Chrome/Edge) for a native Save As dialog,
 * falling back to the classic "create a hidden link and click it" approach
 * for browsers that don't support the API (Firefox, Safari).
 */

/**
 * Save data using the system Save As dialog.
 * Falls back to a download link if the File System Access API isn't available.
 */
export async function saveFileAs(data: Blob, suggestedName: string): Promise<void> {
  // Try File System Access API (Chrome/Edge) for native Save As
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
      // User cancelled the dialog — don't fall through to download
      if ((e as DOMException).name === "AbortError") return;
    }
  }

  // Fallback: create a temporary download link and click it
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a file using the system file picker.
 * Creates a hidden <input type="file"> element and triggers the picker.
 * @param accept MIME type or extension filter (e.g., ".json", "audio/*").
 * @returns The selected File, or null if the user cancelled.
 */
export async function openFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
