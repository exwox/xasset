"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  CustomDataSource,
  GeometryInstance,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
} from "@cesium/engine";
import * as CesiumEngine from "@cesium/engine";
import { Viewer } from "@cesium/widgets";
import dynamic from "next/dynamic";
import type { FallbackPoint } from "./leaflet-fallback-map";
import { localToWorld } from "@/lib/coordinates";
import { ASSET_STATUS_COLORS } from "@/lib/asset-status";
import type { ActiveSite, Asset, Calibration, DxfLayerStyle, DxfSegment, DxfTransform, WorldPoint } from "@/lib/types";

const LeafletFallbackMap = dynamic(() => import("./leaflet-fallback-map").then((mod) => mod.LeafletFallbackMap), { ssr: false });

interface Props {
  assets: Asset[];
  selectedId: string | null;
  segments: DxfSegment[];
  calibration?: DxfTransform;
  dxfLayers?: DxfLayerStyle[];
  activeDxfDocumentId?: string;
  positionAssetId?: string;
  polygonAssetId?: string;
  polygonDraft?: WorldPoint[];
  activeSite?: ActiveSite;
  onSelect: (id: string) => void;
  onPlace: (point: { longitude: number; latitude: number }) => void;
  onPolygonPoint?: (point: WorldPoint) => void;
  onPolygonUndo?: () => void;
  onPolygonSave?: () => void;
  onCancelPlace?: () => void;
}
const FALLBACK_SITE: ActiveSite = { id: "", code: "TNJ", name: "Tanjung Pinang", longitude: 104.5323, latitude: 0.9227, cameraHeight: 4200 };
// Stop requesting Esri placeholder tiles beyond its reliable local imagery
// resolution. Cesium will magnify the last available level when zooming closer.
const SATELLITE_MAX_NATIVE_LEVEL = 18;

// Detect a genuinely usable WebGL context. A context can exist but be broken
// (e.g. software/remote rendering) reporting maxTextureSize = 0 or a degenerate
// aliased line-width range, which crashes Cesium's render loop.
function hasUsableWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as
      | {
          MAX_TEXTURE_SIZE: number;
          ALIASED_LINE_WIDTH_RANGE: number;
          getParameter: (p: number) => unknown;
        }
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
const fallbackCalibration: Calibration = {
  origin: { longitude: 104.5318, latitude: 0.9218 },
  localOrigin: { x: 0, y: 0 },
  metersPerUnit: 1.4,
  rotationDegrees: 8,
};

export function CesiumMap({
  assets,
  selectedId,
  segments,
  calibration = fallbackCalibration,
  dxfLayers = [],
  activeDxfDocumentId,
  positionAssetId,
  polygonAssetId,
  polygonDraft = [],
  activeSite = FALLBACK_SITE,
  onSelect,
  onPlace,
  onPolygonPoint,
  onPolygonUndo,
  onPolygonSave,
  onCancelPlace,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    viewerRef = useRef<Viewer | null>(null),
    assetSourceRef = useRef<CustomDataSource | null>(null),
    dxfPrimitiveRef = useRef<Primitive | null>(null),
    selectRef = useRef(onSelect),
    placeRef = useRef(onPlace),
    positionRef = useRef(positionAssetId),
    polygonRef = useRef(polygonAssetId),
    polygonPointRef = useRef(onPolygonPoint);
  const [dxfVisible, setDxfVisible] = useState(false),
    [mode, setMode] = useState<"2D" | "3D">("3D"),
    [basemap, setBasemap] = useState<"street" | "aerial">("street"),
    [webglOk, setWebglOk] = useState<boolean | null>(null);
  useEffect(() => {
    // WebGL capability can only be measured after the component mounts (browser only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebglOk(hasUsableWebGL());
  }, []);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    placeRef.current = onPlace;
  }, [onPlace]);
  useEffect(() => {
    positionRef.current = positionAssetId;
  }, [positionAssetId]);
  useEffect(() => {
    polygonRef.current = polygonAssetId;
    polygonPointRef.current = onPolygonPoint;
  }, [onPolygonPoint, polygonAssetId]);
  useEffect(() => {
    if (webglOk !== true || !container.current) return;
    window.CESIUM_BASE_URL = "/cesium/";
    try {
      const viewer = new Viewer(container.current, {
        contextOptions: { webgl: { preserveDrawingBuffer: true } },
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

      // Verify the *real* WebGL context Cesium created is usable. A context can
      // exist (so new Viewer succeeds) but still be broken (maxTextureSize = 0 /
      // degenerate aliased line width), which crashes the render loop. If so,
      // tear it down and fall back to the Leaflet 2D map.
      const limits = (CesiumEngine as unknown as {
        ContextLimits: { maximumTextureSize: number; maximumAliasedLineWidth: number };
      }).ContextLimits;
      const contextHealthy =
        limits.maximumTextureSize >= 64 && limits.maximumAliasedLineWidth >= 1;
      if (!contextHealthy) {
        console.warn("Cesium 3D disabled: WebGL context unusable — using 2D map fallback.");
        viewer.destroy();
        viewerRef.current = null;
        // Switching to the 2D fallback reflects the real context we detected after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWebglOk(false);
        return () => {};
      }
      // Verify Cesium viewer initialized successfully
      
      try {
        const osmProvider = new OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" });
        viewer.imageryLayers.addImageryProvider(osmProvider);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
        console.warn("Failed to load OpenStreetMap imagery provider:", errorMsg);
      }
      viewer.scene.globe.enableLighting = true;
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(activeSite.longitude, activeSite.latitude, activeSite.cameraHeight), duration: 0 });
      const source = new CustomDataSource("assets");
      
      // Clustering with error handling for texture atlas issues
      try {
        source.clustering.enabled = true;
        source.clustering.pixelRange = 48;
        source.clustering.minimumClusterSize = 2;
        source.clustering.clusterEvent.addEventListener((entities, cluster) => {
          try {
            cluster.billboard.show = false;
            cluster.label.show = true;
            cluster.label.text = String(entities.length);
            cluster.label.font = "bold 13px sans-serif";
            cluster.label.fillColor = Color.WHITE;
            cluster.point.show = true;
            cluster.point.pixelSize = 28;
            cluster.point.color = Color.fromCssColorString("#147d69");
            cluster.point.outlineColor = Color.WHITE;
            cluster.point.outlineWidth = 2;
          } catch (error) {
            console.warn("Cluster rendering error:", error instanceof Error ? error.message : String(error));
          }
        });
      } catch (error) {
        console.warn("Clustering disabled due to WebGL issues:", error instanceof Error ? error.message : String(error));
        source.clustering.enabled = false;
      }
      void viewer.dataSources.add(source);
      assetSourceRef.current = source;
      viewer.screenSpaceEventHandler.setInputAction((event: { position: Cartesian2 }) => {
        if (positionRef.current || polygonRef.current) {
          const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
          if (cartesian) {
            const point = Cartographic.fromCartesian(cartesian);
            const worldPoint = {
              longitude: CesiumMath.toDegrees(point.longitude),
              latitude: CesiumMath.toDegrees(point.latitude),
            };
            if (polygonRef.current) polygonPointRef.current?.(worldPoint);
            else placeRef.current(worldPoint);
          }
          return;
        }
        const picked = viewer.scene.pick(event.position) as { id?: { id?: string } } | undefined;
        const id = picked?.id?.id;
        if (id?.startsWith("asset-area-")) selectRef.current(id.slice(11));
        else if (id?.startsWith("asset-")) selectRef.current(id.slice(6));
      }, ScreenSpaceEventType.LEFT_CLICK);
      viewerRef.current = viewer;
      
      return () => {
        if (viewerRef.current) {
          viewerRef.current.destroy();
          viewerRef.current = null;
        }
        assetSourceRef.current = null;
        dxfPrimitiveRef.current = null;
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
      console.error("Failed to initialize Cesium viewer:", errorMsg);
      return () => {}; // Return empty cleanup function
    }
  }, [activeSite.cameraHeight, activeSite.latitude, activeSite.longitude, webglOk]);
  useEffect(() => {
    const resizeMap = () => {
      const applySize = () => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;
        viewer.forceResize();
        viewer.resize();
        viewer.scene.requestRender();
      };
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
  useEffect(() => {
    const viewer = viewerRef.current,
      source = assetSourceRef.current;
    if (!viewer || !source) return;
    source.clustering.enabled = !polygonAssetId;
    source.entities.removeAll();
    for (const asset of assets) {
      const statusColor = Color.fromCssColorString(ASSET_STATUS_COLORS[asset.maintenance]);
      if (asset.polygon && asset.polygon.length >= 3) {
        source.entities.add({
          id: `asset-area-${asset.id}`,
          polygon: {
            hierarchy: asset.polygon.map((point) => Cartesian3.fromDegrees(point.longitude, point.latitude, 30)),
            material: statusColor.withAlpha(asset.id === selectedId ? 0.38 : 0.22),
            outline: true,
            outlineColor: statusColor,
            perPositionHeight: true,
          },
        });
      }
      const localPosition =
        asset.longitude == null &&
        asset.latitude == null &&
        asset.localX != null &&
        asset.localY != null &&
        asset.dxfDocumentId === activeDxfDocumentId
          ? localToWorld({ x: asset.localX, y: asset.localY }, calibration)
          : null;
      const longitude = asset.longitude ?? localPosition?.longitude;
      const latitude = asset.latitude ?? localPosition?.latitude;
      if (longitude == null || latitude == null) continue;
      const directoryNo = String(asset.no);
      const labelSize = directoryNo.length <= 3 ? 10 : directoryNo.length <= 5 ? 8 : 7;
      source.entities.add({
        id: `asset-${asset.id}`,
        // Keep numbered markers physically above the DXF overlay (height 25 m).
        position: Cartesian3.fromDegrees(longitude, latitude, Math.max(asset.altitude ?? asset.localZ ?? 0, 50)),
        point: {
          pixelSize: asset.id === selectedId ? 34 : 28,
          color: Color.fromCssColorString("#facc15"),
          outlineColor: statusColor,
          outlineWidth: asset.id === selectedId ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: directoryNo,
          font: `700 ${labelSize}px sans-serif`,
          fillColor: Color.fromCssColorString("#111827"),
          pixelOffset: Cartesian2.ZERO,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    if (polygonDraft.length) {
      const positions = polygonDraft.map((point) => Cartesian3.fromDegrees(point.longitude, point.latitude, 55));
      if (positions.length >= 3)
        source.entities.add({
          id: "polygon-draft",
          polygon: {
            hierarchy: positions,
            material: Color.fromCssColorString("#5eead4").withAlpha(0.28),
            outline: true,
            outlineColor: Color.WHITE,
            perPositionHeight: true,
          },
        });
      if (positions.length >= 2)
        source.entities.add({
          id: "polygon-draft-line",
          polyline: {
            positions: positions.length >= 3 ? [...positions, positions[0]] : positions,
            width: 2,
            material: Color.WHITE,
            clampToGround: false,
          },
        });
      for (const [index, position] of positions.entries())
        source.entities.add({
          id: `polygon-draft-point-${index}`,
          position,
          point: { pixelSize: 9, color: Color.WHITE, outlineColor: Color.fromCssColorString("#0f766e"), outlineWidth: 2 },
        });
    }
    viewer.dataSources.raiseToTop(source);
    if (dxfPrimitiveRef.current) {
      viewer.scene.primitives.remove(dxfPrimitiveRef.current);
      dxfPrimitiveRef.current = null;
    }
    const layerStyles = new Map(dxfLayers.map((layer) => [layer.name, layer]));
    if (dxfVisible && segments.length) {
      try {
        // Check if vertex texture fetching is supported (required for per-instance colors)
        const vtfContext = (viewer.scene as unknown as { context?: { maximumVertexTextureImageUnits?: number } }).context;
        const supportsVTF =
          typeof vtfContext?.maximumVertexTextureImageUnits === "number"
            ? vtfContext.maximumVertexTextureImageUnits > 0
            : true; // Assume supported if we can't check
        
        if (!supportsVTF) {
          console.warn("WebGL vertex texture fetching not supported - DXF rendering disabled");
          return;
        }

        const instances = segments.map((segment) => {
          const start = localToWorld(segment.start, calibration),
            end = localToWorld(segment.end, calibration);
          const style = layerStyles.get(segment.layer);
          const color = Color.fromCssColorString(style?.color ?? "#5eead4").withAlpha(style?.opacity ?? 0.9);
          return new GeometryInstance({
            geometry: new PolylineGeometry({
              positions: Cartesian3.fromDegreesArrayHeights([
                start.longitude,
                start.latitude,
                25,
                end.longitude,
                end.latitude,
                25,
              ]),
              width: 1,
              vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
            }),
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
          });
        });
        const primitive = new Primitive({
          geometryInstances: instances,
          appearance: new PolylineColorAppearance({
            translucent: true,
            renderState: { depthTest: { enabled: true } },
          }),
          asynchronous: true,
        });
        dxfPrimitiveRef.current = viewer.scene.primitives.add(primitive);
        viewer.scene.primitives.raiseToTop(primitive);
      } catch (error) {
        console.warn("Failed to render DXF primitives:", error instanceof Error ? error.message : String(error));
        // DXF rendering failed, but don't crash - map still works
      }
    }
  }, [activeDxfDocumentId, assets, calibration, dxfLayers, polygonAssetId, polygonDraft, segments, selectedId, dxfVisible]);
  useEffect(() => {
    const viewer = viewerRef.current,
      asset = assets.find((item) => item.id === selectedId);
    if (!viewer || !asset) return;
    const localPosition =
      asset.localX != null && asset.localY != null && asset.dxfDocumentId === activeDxfDocumentId
        ? localToWorld({ x: asset.localX, y: asset.localY }, calibration)
        : null;
    const longitude = asset.longitude ?? localPosition?.longitude;
    const latitude = asset.latitude ?? localPosition?.latitude;
    if (longitude != null && latitude != null)
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(longitude, latitude, 240), duration: 1.1 });
  }, [activeDxfDocumentId, assets, calibration, selectedId]);
  function switchMode() {
    const next = mode === "3D" ? "2D" : "3D";
    setMode(next);
    if (next === "2D") viewerRef.current?.scene.morphTo2D(0.8);
    else viewerRef.current?.scene.morphTo3D(0.8);
  }
  function reset() {
    viewerRef.current?.camera.flyTo({
      destination: Cartesian3.fromDegrees(activeSite.longitude, activeSite.latitude, activeSite.cameraHeight),
      duration: 1,
    });
  }
  function switchBasemap() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = basemap === "street" ? "aerial" : "street";
    viewer.imageryLayers.removeAll();
    try {
      const provider = next === "street"
        ? new OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
        : new UrlTemplateImageryProvider({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            credit: "Esri World Imagery",
            maximumLevel: SATELLITE_MAX_NATIVE_LEVEL,
          });
      viewer.imageryLayers.addImageryProvider(provider);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error || 'Unknown error');
      console.warn(`Failed to load ${next} imagery provider:`, errorMsg);
    }
    setBasemap(next);
  }
  const fallbackPoints: FallbackPoint[] = [];
    for (const asset of assets) {
      if (asset.longitude == null || asset.latitude == null) continue;
      fallbackPoints.push({
        id: asset.id,
        no: asset.no,
        code: asset.assetCode,
        description: asset.description,
        latitude: asset.latitude,
        longitude: asset.longitude,
        selected: asset.id === selectedId,
        color: ASSET_STATUS_COLORS[asset.maintenance],
      });
    }
  const fallbackLines = dxfVisible
    ? segments.map((segment) => {
        const start = localToWorld(segment.start, calibration);
        const end = localToWorld(segment.end, calibration);
        const style = dxfLayers.find((layer) => layer.name === segment.layer);
        return {
          start,
          end,
          color: style?.color ?? "#5eead4",
          opacity: style?.opacity ?? 0.9,
        };
      })
    : [];
  return (
    <>
      {webglOk === false ? (
        <LeafletFallbackMap
          points={fallbackPoints}
          lines={fallbackLines}
          polygons={assets.flatMap((asset) =>
            asset.polygon && asset.polygon.length >= 3
              ? [{ id: asset.id, points: asset.polygon, color: ASSET_STATUS_COLORS[asset.maintenance], selected: asset.id === selectedId }]
              : [],
          )}
          polygonDraft={polygonDraft}
          dxfVisible={dxfVisible}
          onToggleDxf={() => setDxfVisible((visible) => !visible)}
          onPointClick={(id) => {
            if (!positionAssetId) onSelect(id);
          }}
          onMapClick={(point) => {
            if (polygonAssetId) onPolygonPoint?.(point);
            else if (positionAssetId) onPlace(point);
          }}
          placing={Boolean(positionAssetId || polygonAssetId)}
          center={{ longitude: activeSite.longitude, latitude: activeSite.latitude }}
        />
      ) : (
        <div
          ref={container}
          className={`cesium-map ${positionAssetId || polygonAssetId ? "placing" : ""}`}
          aria-label={`Peta aset ${activeSite.name}`}
          role="region"
        />
      )}
      {webglOk && (
        <div className="map-controls">
          <button onClick={switchMode}>{mode === "3D" ? "2D" : "3D"}</button>
          <button onClick={switchBasemap}>{basemap === "street" ? "SAT" : "MAP"}</button>
          <button
            type="button"
            className={dxfVisible ? "active" : ""}
            aria-pressed={dxfVisible}
            title={dxfVisible ? "Sembunyikan DXF" : "Tampilkan DXF"}
            onClick={() => setDxfVisible((visible) => !visible)}
          >
            DXF {dxfVisible ? "ON" : "OFF"}
          </button>
          <button onClick={reset}>⌂</button>
        </div>
      )}
      {positionAssetId && (
        <div className="placement-banner" role="status">
          <span>⌖ Klik titik pada peta untuk menentukan posisi aset</span>
          <button type="button" onClick={onCancelPlace} aria-label="Batalkan penentuan posisi">
            Batal&nbsp; ×
          </button>
        </div>
      )}
      {polygonAssetId && (
        <div className="placement-banner polygon-banner" role="status">
          <span>⬡ Klik titik sudut polygon · {polygonDraft.length} titik</span>
          <button type="button" onClick={onPolygonUndo} disabled={!polygonDraft.length}>
            Undo
          </button>
          <button type="button" onClick={onPolygonSave} disabled={polygonDraft.length < 3}>
            Simpan
          </button>
          <button type="button" onClick={onCancelPlace} aria-label="Batalkan gambar polygon">
            Batal&nbsp; ×
          </button>
        </div>
      )}
    </>
  );
}
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}
