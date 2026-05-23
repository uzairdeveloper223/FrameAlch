export class CubeParser {
  static parse(text) {
    const lines = text.split('\n');
    let size = 0;
    let domainMin = [0, 0, 0];
    let domainMax = [1, 1, 1];
    const dataPoints = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      if (line.startsWith('LUT_3D_SIZE')) {
        const parts = line.split(/\s+/);
        size = parseInt(parts[1], 10);
        continue;
      }

      if (line.startsWith('DOMAIN_MIN')) {
        const parts = line.split(/\s+/);
        domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
        continue;
      }

      if (line.startsWith('DOMAIN_MAX')) {
        const parts = line.split(/\s+/);
        domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          dataPoints.push(
            Math.min(255, Math.max(0, Math.round(r * 255))),
            Math.min(255, Math.max(0, Math.round(g * 255))),
            Math.min(255, Math.max(0, Math.round(b * 255))),
            255
          );
        }
      }
    }

    if (size === 0) {
      throw new Error('LUT_3D_SIZE not found or invalid');
    }

    const expectedPointsCount = size * size * size * 4;
    if (dataPoints.length < expectedPointsCount) {
      throw new Error(`Incomplete data points in .cube file: expected ${expectedPointsCount / 4}, got ${dataPoints.length / 4}`);
    }

    return {
      size,
      domainMin,
      domainMax,
      data: new Uint8Array(dataPoints)
    };
  }
}
