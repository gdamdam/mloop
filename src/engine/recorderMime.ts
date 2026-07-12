/**
 * Pick a MediaRecorder audio container the current browser supports.
 *
 * Chrome/Firefox record webm/opus; Safari has no webm encoder and throws
 * NotSupportedError if it is requested explicitly, but records mp4/aac.
 * Returns `undefined` when nothing known matches (or the API is missing,
 * as in the test environment) so the caller can omit `mimeType` and let
 * the browser use its native default.
 */
export function pickRecorderMimeType(
  isTypeSupported?: (type: string) => boolean,
): string | undefined {
  const check =
    isTypeSupported ??
    (typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function"
      ? (t: string) => MediaRecorder.isTypeSupported(t)
      : undefined);
  if (!check) return undefined;
  for (const type of ["audio/webm", "audio/mp4"]) {
    if (check(type)) return type;
  }
  return undefined;
}
