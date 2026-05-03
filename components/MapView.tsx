"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { EnrichedCourse, Bounds } from "@/types";
import { KATEGORIE_COLORS, DEFAULT_COLOR } from "@/types";

function createCourseIcon(color: string, isSelected: boolean, count = 1): L.DivIcon {
  const size = isSelected ? 32 : 26;
  const shadow = isSelected
    ? "drop-shadow(0 2px 6px rgba(0,0,0,0.55))"
    : "drop-shadow(0 1px 3px rgba(0,0,0,0.4))";
  const strokeColor = isSelected ? "#1d4ed8" : "#fff";
  const strokeWidth = isSelected ? 2 : 1.5;
  const innerDot =
    count > 1
      ? `<circle cx="12" cy="10" r="4" fill="white" fill-opacity="0.9"/>
         <text x="12" y="10.5" text-anchor="middle" dominant-baseline="middle"
           font-size="5" font-weight="bold" fill="${color}"
           font-family="system-ui,sans-serif">${count > 9 ? "9+" : count}</text>`
      : `<circle cx="12" cy="10" r="4" fill="white" fill-opacity="0.5"/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="${size}" height="${Math.round((size * 32) / 24)}" style="filter:${shadow}">
      <path d="M12 1C7.03 1 3 5.03 3 10c0 7.25 9 21 9 21s9-13.75 9-21c0-4.97-4.03-9-9-9z"
        fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
      ${innerDot}
    </svg>`.trim();
  const anchorH = Math.round((size * 32) / 24);
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, anchorH],
    iconAnchor: [size / 2, anchorH],
    popupAnchor: [0, -anchorH],
  });
}

const SWISSTOPO_URL =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg";

const ZURICH_CENTER: [number, number] = [47.3769, 8.5417];

export interface MapViewHandle {
  flyTo: (lat: number, lng: number, paddingBottom?: number) => void;
}

function BoundsTracker({
  onBoundsChange,
  onPositionChange,
}: {
  onBoundsChange: (b: Bounds) => void;
  onPositionChange: (lat: number, lng: number, zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend() {
      const b = map.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
      const c = map.getCenter();
      onPositionChange(c.lat, c.lng, map.getZoom());
    },
  });
  return null;
}

function MapReadyHandler({
  onReady,
  firedRef,
}: {
  onReady: (b: Bounds) => void;
  firedRef: React.MutableRefObject<boolean>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      const b = map.getBounds();
      onReady({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FlyController({ handle }: { handle: React.MutableRefObject<MapViewHandle | null> }) {
  const map = useMap();
  useImperativeHandle(handle, () => ({
    flyTo(lat, lng, paddingBottom = 0) {
      const zoom = Math.max(map.getZoom(), 15);
      if (paddingBottom > 0) {
        // Shift the flyTo center so the pin lands at the vertical center of the
        // visible map strip above the bottom sheet (offsetPx = sheetHeight/2).
        const offsetPx = paddingBottom / 2;
        const pinPx = map.project([lat, lng], zoom);
        const adjusted = map.unproject(pinPx.add([0, offsetPx]), zoom);
        map.flyTo(adjusted, zoom, { duration: 0.8 });
      } else {
        map.flyTo([lat, lng], zoom, { duration: 0.8 });
      }
    },
  }));
  return null;
}

interface Props {
  courses: EnrichedCourse[];
  selectedId: number | null;
  initialCenter?: [number, number];
  initialZoom?: number;
  onBoundsChange: (bounds: Bounds) => void;
  onPositionChange: (lat: number, lng: number, zoom: number) => void;
  onReady: (bounds: Bounds) => void;
  onPinClick?: (course: EnrichedCourse) => void;
  onGroupSelect?: (courses: EnrichedCourse[]) => void;
}

const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  {
    courses,
    selectedId,
    initialCenter,
    initialZoom,
    onBoundsChange,
    onPositionChange,
    onReady,
    onPinClick,
    onGroupSelect,
  },
  ref
) {
  const readyFired = useRef(false);
  const handleRef = useRef<MapViewHandle | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, paddingBottom) {
      handleRef.current?.flyTo(lat, lng, paddingBottom);
    },
  }));

  const visible = courses.filter((c) => c.lat !== null && c.lng !== null);

  // Group courses that share the exact same coordinate into one marker
  const byCoord = visible.reduce<Record<string, EnrichedCourse[]>>((acc, c) => {
    const key = `${c.lat},${c.lng}`;
    (acc[key] ??= []).push(c);
    return acc;
  }, {});

  return (
    <MapContainer
      center={initialCenter ?? ZURICH_CENTER}
      zoom={initialZoom ?? 13}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        url={SWISSTOPO_URL}
        attribution='© <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
        maxZoom={19}
        tileSize={256}
      />

      <BoundsTracker onBoundsChange={onBoundsChange} onPositionChange={onPositionChange} />
      <MapReadyHandler onReady={onReady} firedRef={readyFired} />
      <FlyController handle={handleRef} />

      {Object.entries(byCoord).map(([key, group]) => {
        const [first] = group;
        const isSelected = group.some((c) => c.angebotId === selectedId);
        const selectedCourse = isSelected
          ? group.find((c) => c.angebotId === selectedId)
          : undefined;
        const color =
          group.length > 1 ? "#6b7280" : (KATEGORIE_COLORS[first.kategorieId] ?? DEFAULT_COLOR);

        let onClick: (() => void) | undefined;
        if (group.length === 1) {
          onClick = () => onPinClick?.(first);
        } else if (isSelected && selectedCourse) {
          onClick = () => onPinClick?.(selectedCourse);
        } else {
          onClick = () => onGroupSelect?.(group);
        }

        return (
          <Marker
            key={key}
            position={[first.lat!, first.lng!]}
            icon={createCourseIcon(color, isSelected, group.length)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{ click: onClick }}
          />
        );
      })}
    </MapContainer>
  );
});

export default MapView;
