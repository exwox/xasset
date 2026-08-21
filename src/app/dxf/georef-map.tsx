"use client";

import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventType,
} from "@cesium/engine";
import { Viewer } from "@cesium/widgets";

function hasUsableWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as
      | { MAX_TEXTURE_SIZE: number; ALIASED_LINE_WIDTH_RANGE: number; getParameter: (p: number) => unknown }
      | null;
    if (!gl) return false;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    // NB: ALIASED_LINE_WIDTH_RANGE is a Float32Array (typed array), NOT a plain array.
    const lineRange = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) as Float32Array | number[] | null;
    return maxTextureSize > 0 && !!lineRange && lineRange.length >= 2 && lineRange[1] >= 1;
  } catch {
    return false;
  }
}

export function GeorefMap({ onPick }: { onPick: (point: { longitude: number; latitude: number }) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onPick);
  useEffect(() => {
    callback.current = onPick;
  }, [onPick]);
  useEffect(() => {
    if (!container.current) return;
    window.CESIUM_BASE_URL = "/cesium/";
    if (!hasUsableWebGL()) {
      container.current.replaceChildren();
      const fallback = document.createElement("div");
      fallback.className = "map-fallback";
      fallback.textContent =
        "Peta 3D tidak dapat ditampilkan: WebGL tidak tersedia di browser/lingkungan ini. " +
        "Aktifkan hardware acceleration, atau akses dari browser dengan GPU (bukan remote/headless).";
      container.current.appendChild(fallback);
      return () => {};
    }
    const viewer = new Viewer(container.current, {
      baseLayer: false,
      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
    );
    viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(104.5323, 0.9227, 5000), duration: 0 });
    viewer.screenSpaceEventHandler.setInputAction((event: { position: Cartesian2 }) => {
      const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const point = Cartographic.fromCartesian(cartesian);
      callback.current({
        longitude: CesiumMath.toDegrees(point.longitude),
        latitude: CesiumMath.toDegrees(point.latitude),
      });
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => viewer.destroy();
  }, []);
  return <div ref={container} className="georef-map" aria-label="Pilih control point pada peta" />;
}
