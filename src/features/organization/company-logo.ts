const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MIN_LOGO_DIMENSION = 128;
const MAX_LOGO_DIMENSION = 4096;

type CompanyLogoExtension = "jpg" | "png";

export async function validateCompanyLogo(
  file: File,
): Promise<{ extension: CompanyLogoExtension } | { error: string }> {
  if (file.size === 0) {
    return { error: "Choose a company logo." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Company logos must be 2 MB or smaller." };
  }

  const extension = getExtension(file.name);
  const expectedType = extension === "png" ? "image/png" : "image/jpeg";
  if (!extension || file.type !== expectedType) {
    return { error: "Upload a PNG or JPEG logo." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions =
    extension === "png" ? readPngDimensions(bytes) : readJpegDimensions(bytes);
  if (!dimensions) {
    return { error: "The file content does not match its image type." };
  }
  if (
    dimensions.width < MIN_LOGO_DIMENSION
    || dimensions.height < MIN_LOGO_DIMENSION
    || dimensions.width > MAX_LOGO_DIMENSION
    || dimensions.height > MAX_LOGO_DIMENSION
  ) {
    return { error: "Logo dimensions must be between 128 and 4096 pixels." };
  }

  return { extension };
}

export function getCompanyLogoStoragePath(
  organizationId: string,
  extension: CompanyLogoExtension,
) {
  return `${organizationId}/logos/${crypto.randomUUID()}.${extension}`;
}

function getExtension(fileName: string): CompanyLogoExtension | null {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "png") return "png";
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  return null;
}

function readPngDimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24
    || signature.some((value, index) => bytes[index] !== value)
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const isStartOfFrame =
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2) return null;
    offset += segmentLength + 2;
  }

  return null;
}
