"use client";
import { GoogleMap, useJsApiLoader, Polyline } from "@react-google-maps/api";

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

export default function Map() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  });

  if (loadError) return <div>Map cannot be loaded right now.</div>;
  if (!isLoaded) return <div>Loading Map...</div>;

  return (
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
    </GoogleMap>
  );
} 