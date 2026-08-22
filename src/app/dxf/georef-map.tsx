"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { localToWorld } from "@/lib/coordinates";
import type { Calibration, DxfSegment } from "@/lib/types";

interface Props {
  mode: "manual" | "control-points";
  segments: DxfSegment[];
  transform: Calibration;
  onTransformChange: (transform: Calibration) => void;
  onPick: (point: { longitude: number; latitude: number }) => void;
}

export function GeorefMap({ mode, segments, transform, onTransformChange, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onPick);
  const transformCallback = useRef(onTransformChange);
  const transformRef = useRef(transform);
  const modeRef = useRef(mode);
  const dragRef = useRef<{
    start: L.LatLng;
    origin: { longitude: number; latitude: number };
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    callback.current = onPick;
    transformCallback.current = onTransformChange;
    transformRef.current = transform;
    modeRef.current = mode;
  }, [mode, onPick, onTransformChange, transform]);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      center: [transformRef.current.origin.latitude, transformRef.current.origin.longitude],
      zoom: 18,
      zoomControl: true,
      preferCanvas: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 22,
      maxNativeZoom: 19,
    }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      if (modeRef.current !== "manual") return;
      dragRef.current = { start: event.latlng, origin: { ...transformRef.current.origin }, moved: false };
    });
    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      const drag = dragRef.current;
      if (!drag || modeRef.current !== "manual") return;
      drag.moved = drag.moved || event.latlng.distanceTo(drag.start) > 0.05;
      const next = {
        ...transformRef.current,
        origin: {
          longitude: drag.origin.longitude + event.latlng.lng - drag.start.lng,
          latitude: drag.origin.latitude + event.latlng.lat - drag.start.lat,
        },
      };
      transformRef.current = next;
      transformCallback.current(next);
    });
    map.on("mouseup", (event: L.LeafletMouseEvent) => {
      const drag = dragRef.current;
      if (drag && !drag.moved && modeRef.current === "manual") {
        const next = {
          ...transformRef.current,
          origin: { longitude: event.latlng.lng, latitude: event.latlng.lat },
        };
        transformRef.current = next;
        transformCallback.current(next);
      }
      dragRef.current = null;
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (modeRef.current === "control-points")
        callback.current({ longitude: event.latlng.lng, latitude: event.latlng.lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      dragRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "manual") map.dragging.disable();
    else map.dragging.enable();
  }, [mode]);

  useEffect(() => {
    const layer = overlayRef.current;
    if (!layer) return;
    layer.clearLayers();
    const stride = Math.max(1, Math.ceil(segments.length / 10_000));
    for (let index = 0; index < segments.length; index += stride) {
      const segment = segments[index];
      const start = localToWorld(segment.start, transform);
      const end = localToWorld(segment.end, transform);
      L.polyline(
        [
          [start.latitude, start.longitude],
          [end.latitude, end.longitude],
        ],
        { color: "#22d3ee", opacity: 0.82, weight: 2, interactive: false },
      ).addTo(layer);
    }
  }, [segments, transform]);

  return (
    <div
      ref={container}
      className={`georef-map ${mode === "manual" ? "manual" : "control-points"}`}
      aria-label={mode === "manual" ? "Geser dan sesuaikan DXF pada peta" : "Pilih control point pada peta"}
    />
  );
}
