// Shared with chat, group, status and channel modules. Kept free of imports so
// it can be loaded by any of them without an import cycle.

export const toMediaDto = (m: {
    media_id: bigint;
    kind: string;
    mime_type: string;
    original_name: string;
    size_bytes: bigint | null;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
    thumbnail_key: string | null;
}) => ({
    mediaId: m.media_id.toString(),
    kind: m.kind,
    mimeType: m.mime_type,
    fileName: m.original_name,
    size: m.size_bytes === null ? null : Number(m.size_bytes),
    width: m.width,
    height: m.height,
    durationMs: m.duration_ms,
    hasThumbnail: Boolean(m.thumbnail_key),
});

export const mediaDtoSelect = {
    media_id: true,
    kind: true,
    mime_type: true,
    original_name: true,
    size_bytes: true,
    width: true,
    height: true,
    duration_ms: true,
    thumbnail_key: true,
} as const;
