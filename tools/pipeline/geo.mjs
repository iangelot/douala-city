const R = 6378137;

export function originScale(lat) {
  const cos = Math.cos((lat * Math.PI) / 180);
  return { mx: (Math.PI / 180) * R * cos, mz: (Math.PI / 180) * R };
}

export function toLocal(lat, lon, origin) {
  const { mx, mz } = originScale(origin.lat);
  return {
    x: (lon - origin.lon) * mx,
    z: -(lat - origin.lat) * mz,
  };
}

export function bboxForArea(area) {
  const { mx, mz } = originScale(area.lat);
  const dLon = area.width / 2 / mx;
  const dLat = area.depth / 2 / mz;
  return {
    south: area.lat - dLat,
    north: area.lat + dLat,
    west: area.lon - dLon,
    east: area.lon + dLon,
  };
}
