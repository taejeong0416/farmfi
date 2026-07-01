import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface UploadResult {
  url: string;
  /** true when Supabase env is absent and a base64 data: URL fallback was used. */
  stub?: boolean;
}

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cachedClient) {
    cachedClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}

/**
 * Upload an image buffer to Supabase Storage (service-role).
 * If Supabase env is empty, gracefully falls back to a base64 `data:` URL
 * so the demo works without Supabase configured.
 */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const client = getClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!client || !bucket) {
    const base64 = buffer.toString("base64");
    return { url: `data:${contentType};base64,${base64}`, stub: true };
  }

  // Namespaced, collision-resistant object path.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const { error } = await client.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return { url: data.publicUrl };
}
