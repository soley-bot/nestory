export type JpegDimensions = {
  height: number;
  width: number;
};

export function readContainedJpegDimensions(bytes: Uint8Array): JpegDimensions | null {
  if (
    bytes.length < 23
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let hasScan = false;
  let width = 0;
  let height = 0;
  let frameComponents: number | null = null;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      return hasScan && width > 0 && height > 0 && offset === bytes.length
        ? { height, width }
        : null;
    }

    if (marker === 0x00 || marker === 0xd8 || isStandaloneJpegMarker(marker)) {
      return null;
    }
    if (offset + 2 > bytes.length) return null;

    const segmentLength = view.getUint16(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) return null;

    if (isJpegStartOfFrame(marker)) {
      const precision = bytes[offset + 2];
      const components = bytes[offset + 7];
      if (
        frameComponents !== null
        || precision < 2
        || precision > 16
        || components < 1
        || components > 4
        || segmentLength !== 8 + (3 * components)
      ) {
        return null;
      }
      height = view.getUint16(offset + 3);
      width = view.getUint16(offset + 5);
      if (width === 0 || height === 0) return null;
      frameComponents = components;
    }

    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    const scanComponents = bytes[offset + 2];
    if (
      width === 0
      || height === 0
      || frameComponents === null
      || scanComponents < 1
      || scanComponents > frameComponents
      || segmentLength !== 6 + (2 * scanComponents)
    ) {
      return null;
    }
    hasScan = true;
    offset = segmentEnd;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const markerStart = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return null;

      const scanMarker = bytes[offset];
      if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
        offset += 1;
        continue;
      }
      if (scanMarker === 0xd9) {
        return offset + 1 === bytes.length ? { height, width } : null;
      }

      offset = markerStart;
      break;
    }
  }

  return null;
}

function isJpegStartOfFrame(marker: number) {
  return marker >= 0xc0
    && marker <= 0xcf
    && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function isStandaloneJpegMarker(marker: number) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}
