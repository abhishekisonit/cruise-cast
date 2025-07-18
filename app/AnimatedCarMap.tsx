"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Polyline, Marker } from "@react-google-maps/api";

const center = { lat: 48.7758, lng: 9.1829 }; // Stuttgart

const containerStyle = {
  width: "100%",
  height: "400px",
};

const stuttgartRoute = [
  { lat: 48.7837, lng: 9.1829 }, // Stuttgart Hauptbahnhof
  { lat: 48.7832, lng: 9.1815 }, // Arnulf-Klett-Platz
  { lat: 48.7825, lng: 9.1800 }, // Heilbronner Straße (start)
  { lat: 48.7815, lng: 9.1790 }, // Heilbronner Straße (mid)
  { lat: 48.7805, lng: 9.1780 }, // Heilbronner Straße (end)
  { lat: 48.7795, lng: 9.1770 }, // Wolframstraße intersection
  { lat: 48.7785, lng: 9.1760 }, // Further down Heilbronner Straße
];


function interpolatePosition(start: { lat: number; lng: number }, end: { lat: number; lng: number }, t: number) {
  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t,
  };
}

type VehicleDataPoint = {
  vehicleId: string;
  timestamp: number;
  lat: number;
  lng: number;
  speed: number;
};

type SegmentProfile = {
  segmentIndex: number;
  avgSpeed: number;
  count: number;
  lat: number;
  lng: number;
};

/**
 * Finds the optimal (average) cruise control speed per route segment.
 * @param data Array of all vehicle data points, ordered by segment.
 * @param route The array of route points (segments).
 * @returns Array of segment profiles with average speed.
 */
function getOptimalSpeedProfilePerSegment(
  data: VehicleDataPoint[],
  route: { lat: number; lng: number }[]
): SegmentProfile[] {
  // Map segment index to array of speeds
  const segmentSpeeds: { [segment: number]: number[] } = {};

  // For each data point, find the closest segment index
  data.forEach((point) => {
    let minDist = Infinity;
    let segIdx = 0;
    for (let i = 0; i < route.length; i++) {
      const dLat = point.lat - route[i].lat;
      const dLng = point.lng - route[i].lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < minDist) {
        minDist = dist;
        segIdx = i;
      }
    }
    if (!segmentSpeeds[segIdx]) segmentSpeeds[segIdx] = [];
    segmentSpeeds[segIdx].push(point.speed);
  });

  // Aggregate average speed per segment
  const profiles: SegmentProfile[] = [];
  for (let i = 0; i < route.length; i++) {
    const speeds = segmentSpeeds[i] || [];
    const avgSpeed =
      speeds.length > 0
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length
        : 0;
    profiles.push({
      segmentIndex: i,
      avgSpeed: Math.round(avgSpeed * 100) / 100,
      count: speeds.length,
      lat: route[i].lat,
      lng: route[i].lng,
    });
  }
  return profiles;
}

// --- VEHICLE BEHAVIOR TYPES ---
const behaviorTypes = [
  { type: "slow", baseSpeed: 40, variance: 5 },    // 0–45 km/h
  { type: "medium", baseSpeed: 55, variance: 5 },  // 45–55 km/h
  { type: "fast", baseSpeed: 70, variance: 5 },    // 55+ km/h
];

// Assign dominant behavior type to each segment: 2 slow, 3 medium, 2 fast
const segmentBehaviors = [
  behaviorTypes[0], // slow
  behaviorTypes[0], // slow
  behaviorTypes[1], // medium
  behaviorTypes[1], // medium
  behaviorTypes[1], // medium
  behaviorTypes[2], // fast
  behaviorTypes[2], // fast
];

function generateRandomVehicleData(vehicleId: string) {
  // For each segment, use the segment's dominant behavior type
  return stuttgartRoute.map((pt, i) => {
    const behavior = segmentBehaviors[i];
    return {
      vehicleId,
      timestamp: Date.now() + i * 1000,
      lat: pt.lat,
      lng: pt.lng,
      speed:
        behavior.baseSpeed + (Math.random() - 0.5) * 2 * behavior.variance,
      behavior: behavior.type,
    };
  });
}

const VEHICLE_COUNT = 1000;

export default function AnimatedCarMap() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  // --- FIX: Generate vehicle data on client only ---
  const [vehicles, setVehicles] = useState<VehicleDataPoint[][] | null>(null);

  useEffect(() => {
    // Generate data for 1000 vehicles
    const allVehicles = [];
    for (let i = 1; i <= VEHICLE_COUNT; i++) {
      allVehicles.push(generateRandomVehicleData(`car-${i}`));
    }
    setVehicles(allVehicles);
    console.log("Generated vehicles:", allVehicles.length, allVehicles[0]);
  }, []);

  const allData = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.flat();
  }, [vehicles]);

  useEffect(() => {
    if (allData.length > 0) {
      console.log("allData sample:", allData.slice(0, 5));
    }
  }, [allData]);

  const cruiseProfile = useMemo(
    () => getOptimalSpeedProfilePerSegment(allData, stuttgartRoute),
    [allData]
  );

  useEffect(() => {
    if (cruiseProfile.length > 0) {
      console.log("cruiseProfile sample:", cruiseProfile);
    }
  }, [cruiseProfile]);

  // Only animate the first car (car-1)
  const animatedCarData = vehicles ? vehicles[0] : null;

  // Log segment average speeds only when vehicles and cruiseProfile are ready
  useEffect(() => {
    if (vehicles && cruiseProfile.some(p => p.avgSpeed !== 0)) {
      console.log("Segment average speeds:", cruiseProfile.map(p => p.avgSpeed));
    }
  }, [vehicles, cruiseProfile]);

  // --- ANIMATION STATE ---
  const [carIndex, setCarIndex] = useState(0);
  const [carPosition, setCarPosition] = useState(stuttgartRoute[0]);
  const [carSpeed, setCarSpeed] = useState(cruiseProfile[0]?.avgSpeed || 50);
  const [nextSpeed, setNextSpeed] = useState(cruiseProfile[1]?.avgSpeed || 50);
  const [speedT, setSpeedT] = useState(0); // For smooth speed transition
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const speedMultiplierRef = useRef(1);
  useEffect(() => { speedMultiplierRef.current = speedMultiplier; }, [speedMultiplier]);

  const segmentRef = useRef(0);
  const tRef = useRef(0);
  const justEnteredSegmentRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !vehicles) return;
    const baseStep = 0.02;
    const interval = setInterval(() => {
      let segment = segmentRef.current;
      let t = tRef.current;
      if (segment >= stuttgartRoute.length - 1) return;
      const currentProfile = cruiseProfile[segment];
      const nextProfile = cruiseProfile[segment + 1] || currentProfile;
      let smoothSpeed = currentProfile.avgSpeed;
      // Smoothing logic:
      // If next segment is faster, hold speed at previous segment until t=0 in new segment, then interpolate up
      if (nextProfile.avgSpeed > currentProfile.avgSpeed) {
        if (t === 0 && segment > 0 && currentProfile.avgSpeed > cruiseProfile[segment - 1].avgSpeed) {
          // Just entered a faster segment: start at previous segment's speed
          smoothSpeed = cruiseProfile[segment - 1].avgSpeed;
        } else if (t > 0) {
          // Interpolate up from previous segment's speed to current segment's speed
          const startSpeed = cruiseProfile[segment - 1]?.avgSpeed ?? currentProfile.avgSpeed;
          smoothSpeed = startSpeed + (currentProfile.avgSpeed - startSpeed) * t;
        }
      } else if (nextProfile.avgSpeed < currentProfile.avgSpeed) {
        // If next segment is slower, start decreasing speed within the current segment
        smoothSpeed = currentProfile.avgSpeed + (nextProfile.avgSpeed - currentProfile.avgSpeed) * t;
      }
      setCarSpeed(smoothSpeed);
      setNextSpeed(nextProfile.avgSpeed);
      setSpeedT(t);
      const dLat = stuttgartRoute[segment + 1].lat - stuttgartRoute[segment].lat;
      const dLng = stuttgartRoute[segment + 1].lng - stuttgartRoute[segment].lng;
      const speedScale = 0.05;
      const step = baseStep * (smoothSpeed / 50) * speedScale * speedMultiplierRef.current;
      t += step;
      if (t > 1) {
        t = 0;
        segment++;
        justEnteredSegmentRef.current = false;
        if (segment >= stuttgartRoute.length - 1) {
          setCarPosition(stuttgartRoute[stuttgartRoute.length - 1]);
          setCarIndex(stuttgartRoute.length - 1);
          setCarSpeed(cruiseProfile[cruiseProfile.length - 1]?.avgSpeed || 50);
          segmentRef.current = segment;
          tRef.current = t;
          return;
        }
        // Mark that we've just entered a new segment
        if (cruiseProfile[segment]?.avgSpeed > cruiseProfile[segment - 1]?.avgSpeed) {
          justEnteredSegmentRef.current = true;
        }
      } else {
        if (justEnteredSegmentRef.current && t > 0) {
          justEnteredSegmentRef.current = false;
        }
      }
      setCarPosition(interpolatePosition(stuttgartRoute[segment], stuttgartRoute[segment + 1], t));
      setCarIndex(segment);
      segmentRef.current = segment;
      tRef.current = t;
    }, 100);
    return () => clearInterval(interval);
  }, [isLoaded, vehicles, cruiseProfile]);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .car-speed-label {
        background: rgba(0,0,0,0.7);
        padding: 2px 6px;
        border-radius: 6px;
        margin-bottom: 4px;
        display: inline-block;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (loadError) return <div>Map cannot be loaded right now.</div>;
  if (!isLoaded || !vehicles) return <div>Loading Map...</div>;

  // Helper to get color based on speed
  function getSpeedColor(speed: number) {
    if (speed < 55) return "#00c853"; // Green for slow
    if (speed < 60) return "#ffd600"; // Yellow for medium
    return "#d50000"; // Red for fast
  }

  // Helper to download all logs as JSON
  function downloadLogs() {
    const logs = {
      vehicles, // array of arrays (each vehicle's data points)
      cruiseProfile, // array of segment profiles
      segmentAverageSpeeds: cruiseProfile.map(p => p.avgSpeed), // array of avg speeds
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "all_segment_logs.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  return (
    <>
      {/* Download Logs Button */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000 }}>
        <button onClick={downloadLogs} style={{ padding: "8px 16px", borderRadius: 8, background: "#222", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer" }}>
          Download Segment Logs
        </button>
      </div>
      {/* Overlays: info and cruise profile, now at the bottom half, side by side */}
      <div style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        gap: 32,
        pointerEvents: "none",
        padding: 24,
      }}>
        <div style={{
          background: "rgba(30,30,30,0.95)",
          color: "#fff",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          padding: "18px 28px",
          minWidth: 220,
          fontFamily: "sans-serif",
          fontSize: 16,
          lineHeight: 1.7,
          pointerEvents: "auto",
        }}>
          <div><b>Current Speed:</b> {carSpeed.toFixed(1)} km/h</div>
          <div><b>Segment ID:</b> {carIndex}</div>
          <div><b>Upcoming Speed:</b> {nextSpeed.toFixed(1)} km/h</div>
          <div style={{ marginTop: 18 }}>
            <label htmlFor="speed-slider"><b>Animation Speed:</b></label>
            <input
              id="speed-slider"
              type="range"
              min={0.2}
              max={20}
              step={0.05}
              value={speedMultiplier}
              onChange={e => setSpeedMultiplier(Number(e.target.value))}
              style={{ width: "100%", marginTop: 6 }}
            />
            <div style={{ textAlign: "center", fontSize: 14, marginTop: 2 }}>
              {speedMultiplier.toFixed(2)}x
            </div>
          </div>
        </div>
        <div style={{
          background: "rgba(30,30,30,0.95)",
          color: "#fff",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          padding: "18px 28px",
          minWidth: 220,
          maxHeight: 320,
          overflowY: "auto",
          fontFamily: "sans-serif",
          fontSize: 15,
          lineHeight: 1.7,
          pointerEvents: "auto",
        }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>Segment → Cruise Speed</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {cruiseProfile.map((profile) => {
                // console.log("Table row:", profile);
                return (
                  <tr key={profile.segmentIndex} style={{ background: carIndex === profile.segmentIndex ? "#333" : "none" }}>
                    <td style={{ padding: "2px 8px 2px 0", textAlign: "right", fontWeight: carIndex === profile.segmentIndex ? "bold" : undefined }}>
                      {profile.segmentIndex}
                    </td>
                    <td style={{ padding: "2px 0 2px 8px", color: getSpeedColor(profile.avgSpeed), fontWeight: carIndex === profile.segmentIndex ? "bold" : undefined }}>
                      {profile.avgSpeed.toFixed(1)} km/h
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={12}
      >
        <Polyline
          path={stuttgartRoute}
          options={{
            strokeColor: "#FF0000",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            clickable: false,
            geodesic: true,
          }}
        />
        {/* Draw colored segments for each route segment based on cruiseProfile */}
        {cruiseProfile.map((profile, i) => {
          if (i === cruiseProfile.length - 1) return null;
          const next = cruiseProfile[i + 1];
          return (
            <Polyline
              key={i}
              path={[
                { lat: profile.lat, lng: profile.lng },
                { lat: next.lat, lng: next.lng },
              ]}
              options={{
                strokeColor: getSpeedColor(profile.avgSpeed),
                strokeOpacity: 0.9,
                strokeWeight: 6,
                clickable: false,
                geodesic: true,
              }}
            />
          );
        })}
        <Marker
          position={carPosition}
          icon={{
            url: "https://maps.google.com/mapfiles/kml/shapes/cabs.png",
            scaledSize: new window.google.maps.Size(40, 40),
            labelOrigin: new window.google.maps.Point(20, -10), // Move label above the marker
          }}
          label={{
            text: `${carSpeed.toFixed(1)} km/h`,
            color: "#fff",
            fontWeight: "bold",
            fontSize: "14px",
            className: "car-speed-label",
          }}
        />
      </GoogleMap>
    </>
  );
} 