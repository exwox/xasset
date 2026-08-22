"use client";

// 2D fallback map (Leaflet + OpenStreetMap/Esri tiles) used when WebGL is not
// available in the environment. Doesn't require any GPU/WebGL support.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface FallbackPoint {
  id: string;
  no: number;
  latitude: number;
  longitude: number;
  code: string;
  description: string;
  selected?: boolean;
  color?: string;
}

export interface FallbackLine {
  start: { latitude: number; longitude: number };
  end: { latitude: number; longitude: number };
  color: string;
  opacity: number;
}

export interface FallbackPolygon {
  id: string;
  points: Array<{ latitude: number; longitude: number }>;
  color: string;
  selected?: boolean;
}

interface Props {
  points: FallbackPoint[];
  lines?: FallbackLine[];
  polygons?: FallbackPolygon[];
  polygonDraft?: Array<{ latitude: number; longitude: number }>;
  dxfVisible?: boolean;
  onToggleDxf?: () => void;
  center?: { latitude: number; longitude: number };
  zoom?: number;
  onPointClick?: (id: string) => void;
  onMapClick?: (latlng: { longitude: number; latitude: number }) => void;
  placing?: boolean;
}

const SITE = { latitude: 0.9227, longitude: 104.5323 };
// Esri World Imagery does not have uniform high-resolution coverage. Keep the
// last reliable native tile and let Leaflet scale it at closer zoom levels.
const SATELLITE_MAX_NATIVE_ZOOM = 18;
const SATELLITE_MAX_DISPLAY_ZOOM = 22;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

export function LeafletFallbackMap({
  points,
  lines = [],
  polygons = [],
  polygonDraft = [],
  dxfVisible = false,
  onToggleDxf,
  center = SITE,
  zoom = 16,
  onPointClick,
  onMapClick,
  placing = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const dxfLayerRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [aerial, setAerial] = useState(false);
  const cbRef = useRef({ onPointClick, onMapClick });
  useEffect(() => {
    cbRef.current = { onPointClick, onMapClick };
  }, [onPointClick, onMapClick]);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      center: [center.latitude, center.longitude],
      zoom,
      zoomControl: true,
    });
    mapRef.current = map;
    tileRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.createPane("dxf-top");
    map.getPane("dxf-top")!.style.zIndex = "650";
    map.getPane("dxf-top")!.style.pointerEvents = "none";
    map.createPane("asset-number-top");
    map.getPane("asset-number-top")!.style.zIndex = "680";
    dxfLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      cbRef.current.onMapClick?.({ longitude: event.latlng.lng, latitude: event.latlng.lat });
    });
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      dxfLayerRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const resizeMap = () => {
      const applySize = () => mapRef.current?.invalidateSize({ animate: false, pan: false });
      applySize();
      window.requestAnimationFrame(applySize);
      window.setTimeout(applySize, 100);
    };
    window.addEventListener("beforeprint", resizeMap);
    window.addEventListener("afterprint", resizeMap);
    return () => {
      window.removeEventListener("beforeprint", resizeMap);
      window.removeEventListener("afterprint", resizeMap);
    };
  }, []);

  // Switch MAP <-> SAT basemap (both are already allowed by the CSP).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(
      aerial
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: aerial ? "&copy; Esri, Maxar, Earthstar Geographics" : "&copy; OpenStreetMap contributors",
        ...(aerial
          ? { maxNativeZoom: SATELLITE_MAX_NATIVE_ZOOM, maxZoom: SATELLITE_MAX_DISPLAY_ZOOM }
          : { maxZoom: 19 }),
      },
    ).addTo(map);
  }, [aerial]);

  // Render asset markers.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const polygon of polygons) {
      const shape = L.polygon(
        polygon.points.map((point) => [point.latitude, point.longitude]),
        { color: polygon.color, fillColor: polygon.color, fillOpacity: polygon.selected ? 0.38 : 0.22, weight: polygon.selected ? 2 : 1 },
      );
      shape.on("click", () => cbRef.current.onPointClick?.(polygon.id));
      shape.addTo(layer);
    }
    if (polygonDraft.length >= 2)
      L.polyline(
        [
          ...polygonDraft.map((point) => [point.latitude, point.longitude] as L.LatLngTuple),
          ...(polygonDraft.length >= 3
            ? [[polygonDraft[0].latitude, polygonDraft[0].longitude] as L.LatLngTuple]
            : []),
        ],
        { color: "#ffffff", weight: 2, dashArray: "6 4", interactive: false },
      ).addTo(layer);
    for (const point of polygonDraft)
      L.circleMarker([point.latitude, point.longitude], {
        radius: 5,
        color: "#ffffff",
        fillColor: "#0f766e",
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer);
    for (const point of points) {
      const color = point.color ?? "#34d399";
      const size = point.selected ? 34 : 28;
      const icon = L.divIcon({
        className: "leaflet-pin",
        html: `<span class="leaflet-asset-number${point.selected ? " selected" : ""}" style="--asset-status:${color}">${point.no}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([point.latitude, point.longitude], {
        icon,
        pane: "asset-number-top",
        riseOnHover: true,
      });
      if (point.description)
        marker.bindPopup(`<b>${escapeHtml(point.code)}</b><br/>${escapeHtml(point.description)}`);
      marker.on("click", () => cbRef.current.onPointClick?.(point.id));
      marker.addTo(layer);
    }
  }, [points, polygonDraft, polygons]);

  useEffect(() => {
    const map = mapRef.current;
    const selectedPoint = points.find((point) => point.selected);
    if (!map || !selectedPoint) return;
    map.flyTo(
      [selectedPoint.latitude, selectedPoint.longitude],
      Math.max(map.getZoom(), 18),
      { animate: true, duration: 0.8 },
    );
  }, [points]);

  // DXF stays above tiles, while asset-number-top (z-index 680) remains above DXF.
  useEffect(() => {
    const layer = dxfLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const line of lines) {
      L.polyline(
        [
          [line.start.latitude, line.start.longitude],
          [line.end.latitude, line.end.longitude],
        ],
        { pane: "dxf-top", color: line.color, opacity: line.opacity, weight: 1, interactive: false },
      ).addTo(layer);
    }
  }, [lines]);

  return (
    <div className={`leaflet-shell ${placing ? "placing" : ""}`}>
      <div className="leaflet-fallback" ref={container} aria-label="Peta aset (mode 2D)" role="region" />
      <div className="leaflet-map-controls">
        <button type="button" onClick={() => setAerial((value) => !value)} title="Ganti basemap">
          {aerial ? "MAP" : "SAT"}
        </button>
        <button
          type="button"
          className={dxfVisible ? "active" : ""}
          aria-pressed={dxfVisible}
          onClick={onToggleDxf}
          title={dxfVisible ? "Sembunyikan DXF" : "Tampilkan DXF"}
        >
          DXF {dxfVisible ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
