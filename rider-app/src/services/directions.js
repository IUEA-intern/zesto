/**
 * services/directions.js — Zesto Rider
 *
 * Fetches a real driving route from the Google Directions API and
 * decodes it into coordinates the in-app MapView can draw, so the
 * rider can see their actual road route and live progress without
 * leaving the app. "Open in Google Maps" is still offered separately
 * for full voice-guided turn-by-turn — that part genuinely needs a
 * dedicated navigation app/SDK, which is a much bigger undertaking
 * than drawing a route on a map. This gives the "don't make me leave
 * the app just to see where I'm going" experience.
 */
import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
  null;

/** Decodes a Google encoded polyline string into [{latitude, longitude}]. */
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Strips the HTML Google puts in step instructions (e.g. "Turn <b>right</b>"). */
function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, '');
}

/**
 * @param {{latitude:number, longitude:number}} origin
 * @param {{latitude:number, longitude:number}} destination
 * @returns {Promise<{coordinates: Array, distanceText: string, durationText: string,
 *   distanceMeters: number, durationSeconds: number, nextInstruction: string} | null>}
 *   Returns null if the API key is missing, the request fails, or no route is found —
 *   callers should fall back to a straight line between the two points.
 */
export async function getDirections(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY || !origin || !destination) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.status !== 'OK' || !json.routes?.length) return null;

    const route = json.routes[0];
    const leg = route.legs?.[0];
    const coordinates = decodePolyline(route.overview_polyline.points);
    const nextInstruction = leg?.steps?.[0] ? stripHtml(leg.steps[0].html_instructions) : null;

    return {
      coordinates,
      distanceText: leg?.distance?.text || null,
      durationText: leg?.duration?.text || null,
      distanceMeters: leg?.distance?.value || null,
      durationSeconds: leg?.duration?.value || null,
      nextInstruction,
    };
  } catch (err) {
    console.warn('[directions] Failed to fetch route:', err.message);
    return null;
  }
}

/** Haversine distance in meters — used to decide whether a route needs refreshing. */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
