// US ZIP code centroid lookup (representative major metro areas)
// In production, this would use a full USPS centroid database.

const ZIP_CENTROIDS: Record<string, { lat: number; lng: number; city: string; state: string }> = {
  // Ohio
  "43215": { lat: 39.9612, lng: -82.9988, city: "Columbus", state: "OH" },
  "43201": { lat: 39.9789, lng: -82.9953, city: "Columbus", state: "OH" },
  "44101": { lat: 41.4993, lng: -81.6944, city: "Cleveland", state: "OH" },
  "45202": { lat: 39.1031, lng: -84.5120, city: "Cincinnati", state: "OH" },
  // New York
  "10001": { lat: 40.7484, lng: -73.9967, city: "New York", state: "NY" },
  "10003": { lat: 40.7310, lng: -73.9890, city: "New York", state: "NY" },
  "11201": { lat: 40.6944, lng: -73.9904, city: "Brooklyn", state: "NY" },
  "11101": { lat: 40.7446, lng: -73.9485, city: "Long Island City", state: "NY" },
  // California
  "90001": { lat: 33.9731, lng: -118.2479, city: "Los Angeles", state: "CA" },
  "90210": { lat: 34.0901, lng: -118.4065, city: "Beverly Hills", state: "CA" },
  "94102": { lat: 37.7793, lng: -122.4192, city: "San Francisco", state: "CA" },
  "92101": { lat: 32.7157, lng: -117.1611, city: "San Diego", state: "CA" },
  "95814": { lat: 38.5767, lng: -121.4938, city: "Sacramento", state: "CA" },
  // Texas
  "77001": { lat: 29.7538, lng: -95.3677, city: "Houston", state: "TX" },
  "75201": { lat: 32.7767, lng: -96.7970, city: "Dallas", state: "TX" },
  "78201": { lat: 29.4241, lng: -98.4936, city: "San Antonio", state: "TX" },
  "73301": { lat: 30.2672, lng: -97.7431, city: "Austin", state: "TX" },
  // Illinois
  "60601": { lat: 41.8827, lng: -87.6233, city: "Chicago", state: "IL" },
  "60614": { lat: 41.9244, lng: -87.6478, city: "Chicago", state: "IL" },
  // Florida
  "33101": { lat: 25.7617, lng: -80.1918, city: "Miami", state: "FL" },
  "32801": { lat: 28.5383, lng: -81.3792, city: "Orlando", state: "FL" },
  "33601": { lat: 27.9506, lng: -82.4572, city: "Tampa", state: "FL" },
  // Georgia
  "30301": { lat: 33.7490, lng: -84.3880, city: "Atlanta", state: "GA" },
  // Washington
  "98101": { lat: 47.6062, lng: -122.3321, city: "Seattle", state: "WA" },
  // Colorado
  "80201": { lat: 39.7392, lng: -104.9903, city: "Denver", state: "CO" },
  // Arizona
  "85001": { lat: 33.4484, lng: -112.0740, city: "Phoenix", state: "AZ" },
  // Pennsylvania
  "19101": { lat: 39.9526, lng: -75.1652, city: "Philadelphia", state: "PA" },
  "15201": { lat: 40.4406, lng: -79.9959, city: "Pittsburgh", state: "PA" },
  // Massachusetts
  "02101": { lat: 42.3601, lng: -71.0589, city: "Boston", state: "MA" },
  // Michigan
  "48201": { lat: 42.3314, lng: -83.0458, city: "Detroit", state: "MI" },
  // Minnesota
  "55401": { lat: 44.9778, lng: -93.2650, city: "Minneapolis", state: "MN" },
  // Missouri
  "63101": { lat: 38.6270, lng: -90.1994, city: "St. Louis", state: "MO" },
  "64101": { lat: 39.0997, lng: -94.5786, city: "Kansas City", state: "MO" },
  // North Carolina
  "27601": { lat: 35.7796, lng: -78.6382, city: "Raleigh", state: "NC" },
  "28201": { lat: 35.2271, lng: -80.8431, city: "Charlotte", state: "NC" },
  // Indiana
  "46201": { lat: 39.7684, lng: -86.1581, city: "Indianapolis", state: "IN" },
  // Tennessee
  "37201": { lat: 36.1627, lng: -86.7816, city: "Nashville", state: "TN" },
  // Maryland
  "21201": { lat: 39.2904, lng: -76.6122, city: "Baltimore", state: "MD" },
  // Oregon
  "97201": { lat: 45.5051, lng: -122.6750, city: "Portland", state: "OR" },
  // Nevada
  "89101": { lat: 36.1699, lng: -115.1398, city: "Las Vegas", state: "NV" },
  // Wisconsin
  "53201": { lat: 43.0389, lng: -87.9065, city: "Milwaukee", state: "WI" },
  // Kentucky
  "40201": { lat: 38.2527, lng: -85.7585, city: "Louisville", state: "KY" },
  // Virginia
  "23219": { lat: 37.5407, lng: -77.4360, city: "Richmond", state: "VA" },
  "22201": { lat: 38.8816, lng: -77.0910, city: "Arlington", state: "VA" },
  // New Jersey
  "07101": { lat: 40.7357, lng: -74.1724, city: "Newark", state: "NJ" },
  // Connecticut
  "06101": { lat: 41.7637, lng: -72.6851, city: "Hartford", state: "CT" },
};

export function lookupZip(zip: string): { lat: number; lng: number; city: string; state: string } | null {
  return ZIP_CENTROIDS[zip.trim()] ?? null;
}

export function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function isZipKnown(zip: string): boolean {
  return zip.trim() in ZIP_CENTROIDS;
}
