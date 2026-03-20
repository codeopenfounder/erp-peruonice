/**
 * Extracts the storage path from a Supabase public URL.
 * Handles cache-bust suffixes like `?t=123456`.
 */
export function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.substring(idx + marker.length).split("?")[0]);
}
