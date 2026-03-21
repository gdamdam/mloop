import { useState, useCallback } from "react";

interface FileImportProps {
  onFileLoaded: (buffer: Float32Array) => void;
  disabled?: boolean;
}

export function FileImport({ onFileLoaded, disabled }: FileImportProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    // Use OfflineAudioContext for decoding (doesn't need a running context)
    const arrayBuffer = await file.arrayBuffer();
    const offlineCtx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

    // Mono downmix
    const numCh = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const mono = new Float32Array(len);
    for (let ch = 0; ch < numCh; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        mono[i] += data[i];
      }
    }
    if (numCh > 1) {
      for (let i = 0; i < len; i++) {
        mono[i] /= numCh;
      }
    }

    onFileLoaded(mono);
  }, [onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
      handleFile(file);
    }
  }, [disabled, handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // reset for re-upload
  }, [handleFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        marginTop: 6,
        padding: "8px 0",
        textAlign: "center",
        border: `1px dashed ${dragOver ? "var(--preview)" : "var(--border)"}`,
        borderRadius: 4,
        fontSize: 10,
        color: "var(--text-dim)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "border-color 0.15s",
      }}
    >
      <label style={{ cursor: disabled ? "default" : "pointer" }}>
        Drop audio or{" "}
        <span style={{ color: "var(--preview)", textDecoration: "underline" }}>browse</span>
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          disabled={disabled}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
