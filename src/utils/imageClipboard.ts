import { tauriBridge } from '../services/tauriBridge';

export interface DecodedImagePayload {
  bytes: number[];
  mimeType: string;
  width: number | null;
  height: number | null;
}

export async function blobToImagePayload(blob: Blob): Promise<DecodedImagePayload> {
  const mimeType = blob.type || 'image/png';
  const buf = await blob.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));

  let width: number | null = null;
  let height: number | null = null;
  if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const objUrl = URL.createObjectURL(blob);
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = objUrl;
      });
      URL.revokeObjectURL(objUrl);
      width = dims.w;
      height = dims.h;
    } catch {
      // Headless / jsdom tests may not decode PNG/JPG metadata; non-fatal.
    }
  }

  return { bytes, mimeType, width, height };
}

export function extractClipboardImageFile(
  clipboardData: DataTransfer | null | undefined,
): File | null {
  if (!clipboardData) return null;
  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(clipboardData.files ?? [])) {
    if (file.type.startsWith('image/')) {
      return file;
    }
  }
  return null;
}

export async function readClipboardImageBlob(): Promise<Blob | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        return await item.getType(imageType);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Triggers Windows native Snipping Tool (`ms-screenclip:` via Rust `launch_screen_snip`)
 * so mixed-DPI multi-monitor screen region capture works reliably.
 */
export async function launchWindowsScreenSnip(): Promise<void> {
  await tauriBridge.launchScreenSnip();
}
