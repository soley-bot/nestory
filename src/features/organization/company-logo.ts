const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MIN_LOGO_DIMENSION = 128;
const MAX_LOGO_DIMENSION = 4096;

type CompanyLogoExtension = "jpg" | "png";

export async function validateCompanyLogo(
  file: File,
): Promise<
  | {
      bytes: Uint8Array;
      contentType: "image/jpeg" | "image/png";
      extension: CompanyLogoExtension;
    }
  | { error: string }
> {
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

  const verifiedFile = await validateUploadedFileContent(file, [
    "image/jpeg",
    "image/png",
  ]);
  if (
    !verifiedFile.ok
    || (
      verifiedFile.contentType !== "image/jpeg"
      && verifiedFile.contentType !== "image/png"
    )
    || verifiedFile.width === undefined
    || verifiedFile.height === undefined
  ) {
    return { error: "The file content does not match its image type." };
  }
  if (
    verifiedFile.width < MIN_LOGO_DIMENSION
    || verifiedFile.height < MIN_LOGO_DIMENSION
    || verifiedFile.width > MAX_LOGO_DIMENSION
    || verifiedFile.height > MAX_LOGO_DIMENSION
  ) {
    return { error: "Logo dimensions must be between 128 and 4096 pixels." };
  }

  return {
    bytes: verifiedFile.bytes,
    contentType: verifiedFile.contentType,
    extension,
  };
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

import { validateUploadedFileContent } from "@/lib/uploads/upload-content";
