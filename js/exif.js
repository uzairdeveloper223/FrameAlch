export class ExifStitcher {
  static extractExif(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
      return null;
    }
    let offset = 2;
    const length = arrayBuffer.byteLength;
    while (offset < length - 4) {
      const marker = view.getUint16(offset, false);
      if (marker === 0xFFE1) {
        const segmentLength = view.getUint16(offset + 2, false);
        return arrayBuffer.slice(offset, offset + 2 + segmentLength);
      }
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFD9 || marker === 0xFFDA) {
        break;
      }
      const segmentLength = view.getUint16(offset + 2, false);
      offset += 2 + segmentLength;
    }
    return null;
  }

  static insertExif(exportedBuffer, exifSegment) {
    if (!exifSegment) {
      return exportedBuffer;
    }
    const view = new DataView(exportedBuffer);
    if (exportedBuffer.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) {
      return exportedBuffer;
    }
    
    let skipOffset = 2;
    let app1Found = false;
    let app1Length = 0;
    
    if (view.getUint16(skipOffset, false) === 0xFFE1) {
      app1Found = true;
      app1Length = view.getUint16(skipOffset + 2, false) + 2;
    }
    
    const sliceStart = app1Found ? (skipOffset + app1Length) : skipOffset;
    const remainingBytes = exportedBuffer.slice(sliceStart);
    
    const newLength = 2 + exifSegment.byteLength + remainingBytes.byteLength;
    const result = new Uint8Array(newLength);
    
    result[0] = 0xFF;
    result[1] = 0xD8;
    result.set(new Uint8Array(exifSegment), 2);
    result.set(new Uint8Array(remainingBytes), 2 + exifSegment.byteLength);
    
    return result.buffer;
  }
}
