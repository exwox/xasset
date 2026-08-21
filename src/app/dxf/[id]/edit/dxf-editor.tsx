"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEditorSnapshot,
  findSnap,
  moveEntity,
  rotateEntity,
  scaleEntity,
  segmentsToEditorEntities,
  type EditorEntity,
  type EditorSnapshot,
  type SnapResult,
} from "@/lib/dxf-editor";
import { decodeDxfSegments, DXF_OVERVIEW_SEGMENT_LIMIT } from "@/lib/dxf-processing";
import type { DxfSegment, LocalPoint } from "@/lib/types";

type Tool = "select" | "pan" | "line" | "polyline" | "circle" | "arc" | "text" | "asset";
interface RenderData {
  unit: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  segments: DxfSegment[];
  layers: Array<{ name: string; color: string | null }>;
}
interface Session {
  id: string;
  baseVersionId: string;
  baseVersionNumber: number;
  version: number;
  status: string;
  snapshot: EditorSnapshot;
  changeNote: string | null;
}
interface Camera {
  x: number;
  y: number;
  scale: number;
}
const EMPTY: EditorSnapshot = { patches: {} };
const clone = (snapshot: EditorSnapshot): EditorSnapshot => structuredClone(snapshot);

export function DxfEditor({
  documentId,
  documentName,
  initialVersionId,
  initialSessionId,
}: {
  documentId: string;
  documentName: string;
  initialVersionId: string | null;
  initialSessionId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [render, setRender] = useState<RenderData | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(EMPTY);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor] = useState<LocalPoint>({ x: 0, y: 0 });
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [draftPoints, setDraftPoints] = useState<LocalPoint[]>([]);
  const [drag, setDrag] = useState<{ screen: LocalPoint; world: LocalPoint; mode: "pan" | "move" | "box" } | null>(
    null,
  );
  const [boxEnd, setBoxEnd] = useState<LocalPoint | null>(null);
  const [status, setStatus] = useState("Memuat editor...");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "conflict">("saved");
  const [changeNote, setChangeNote] = useState("");
  const [assetId, setAssetId] = useState("");
  const [compare, setCompare] = useState(false);
  const undoRef = useRef<EditorSnapshot[]>([]),
    redoRef = useRef<EditorSnapshot[]>([]);
  const entities = useMemo(
    () => (render ? applyEditorSnapshot(segmentsToEditorEntities(render.segments), snapshot) : []),
    [render, snapshot],
  );
  const entityMap = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities]);
  const layers = useMemo(() => [...new Set(entities.map((entity) => entity.layer))].sort(), [entities]);

  useEffect(() => {
    void (async () => {
      let current: Session;
      if (initialSessionId) {
        const response = await fetch(`/api/dxf-documents/${documentId}/edit-sessions/${initialSessionId}`);
        if (!response.ok) {
          setStatus("Draft tidak ditemukan.");
          return;
        }
        current = (await response.json()).data;
      } else {
        if (!initialVersionId) {
          setStatus("Versi dasar belum dipilih.");
          return;
        }
        const response = await fetch(`/api/dxf-documents/${documentId}/edit-sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseVersionId: initialVersionId, changeNote: "Draft editor" }),
        });
        if (!response.ok) {
          setStatus((await response.json()).error);
          return;
        }
        current = (await response.json()).data;
        window.history.replaceState(null, "", `/dxf/${documentId}/edit?session=${current.id}`);
      }
      setSession(current);
      setSnapshot(current.snapshot);
      setChangeNote(current.changeNote ?? "");
      const response = await fetch(`/api/dxf-documents/${documentId}/versions/${current.baseVersionId}/render`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setStatus("LOD editor tidak tersedia.");
        return;
      }
      const compactData = await response.json();
      const data: RenderData = { ...compactData, segments: decodeDxfSegments(compactData) };
      setRender(data);
      const width = Math.max(1, data.bounds.maxX - data.bounds.minX),
        height = Math.max(1, data.bounds.maxY - data.bounds.minY);
      setCamera({
        x: (data.bounds.minX + data.bounds.maxX) / 2,
        y: (data.bounds.minY + data.bounds.maxY) / 2,
        scale: Math.min(900 / width, 600 / height) * 0.9,
      });
      setStatus(
        data.segments.length >= DXF_OVERVIEW_SEGMENT_LIMIT
          ? `Mode overview: maksimal ${DXF_OVERVIEW_SEGMENT_LIMIT.toLocaleString("id-ID")} segmen terlihat; ekspor menerapkan patch ke artefak normalized.`
          : "Draft siap diedit.",
      );
    })();
  }, [documentId, initialSessionId, initialVersionId]);

  useEffect(() => {
    if (!session || saveState !== "dirty") return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      const response = await fetch(`/api/dxf-documents/${documentId}/edit-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: session.version, snapshot, changeNote: changeNote || null }),
      });
      const body = await response.json();
      if (response.status === 409) {
        setSaveState("conflict");
        setStatus("Konflik: draft telah berubah di editor lain. Muat ulang sebelum melanjutkan.");
        return;
      }
      if (!response.ok) {
        setSaveState("dirty");
        setStatus(body.error ?? "Autosave gagal");
        return;
      }
      setSession((current) => (current ? { ...current, version: body.data.version } : current));
      setSaveState("saved");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [changeNote, documentId, saveState, session, snapshot]);

  const commit = useCallback(
    (next: EditorSnapshot) => {
      undoRef.current.push(clone(snapshot));
      if (undoRef.current.length > 100) undoRef.current.shift();
      redoRef.current = [];
      setSnapshot(next);
      setSaveState("dirty");
    },
    [snapshot],
  );
  const patchEntities = useCallback(
    (updates: EditorEntity[]) =>
      commit({ patches: { ...snapshot.patches, ...Object.fromEntries(updates.map((entity) => [entity.id, entity])) } }),
    [commit, snapshot],
  );
  const removeSelected = useCallback(() => {
    if (!selected.size) return;
    commit({ patches: { ...snapshot.patches, ...Object.fromEntries([...selected].map((id) => [id, null])) } });
    setSelected(new Set());
  }, [commit, selected, snapshot]);
  function undo() {
    const prior = undoRef.current.pop();
    if (!prior) return;
    redoRef.current.push(clone(snapshot));
    setSnapshot(prior);
    setSaveState("dirty");
  }
  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(clone(snapshot));
    setSnapshot(next);
    setSaveState("dirty");
  }

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): LocalPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toWorld = useCallback(
    (point: LocalPoint): LocalPoint => {
      const canvas = canvasRef.current!;
      return {
        x: camera.x + (point.x - canvas.clientWidth / 2) / camera.scale,
        y: camera.y - (point.y - canvas.clientHeight / 2) / camera.scale,
      };
    },
    [camera],
  );
  const toScreen = useCallback(
    (point: LocalPoint): LocalPoint => {
      const canvas = canvasRef.current!;
      return {
        x: canvas.clientWidth / 2 + (point.x - camera.x) * camera.scale,
        y: canvas.clientHeight / 2 - (point.y - camera.y) * camera.scale,
      };
    },
    [camera],
  );
  function snapped(point: LocalPoint) {
    const tolerance = 10 / camera.scale;
    const nearby = entities
      .filter((entity) => {
        const pts = entity.points ?? (entity.center ? [entity.center] : []);
        return pts.some(
          (item) => Math.abs(item.x - point.x) < tolerance * 5 && Math.abs(item.y - point.y) < tolerance * 5,
        );
      })
      .slice(0, 60);
    const result = findSnap(point, nearby, tolerance, Math.max(1, 10 ** Math.floor(Math.log10(40 / camera.scale))));
    setSnap(result);
    return result?.point ?? point;
  }
  function nearest(point: LocalPoint) {
    let bestId: string | null = null,
      bestDistance = Infinity;
    const consider = (id: string, d: number) => {
      if (d < 10 / camera.scale && d < bestDistance) {
        bestId = id;
        bestDistance = d;
      }
    };
    for (const entity of entities) {
      const points = entity.points ?? [];
      for (const p of entity.center ? [...points, entity.center] : points)
        consider(entity.id, Math.hypot(p.x - point.x, p.y - point.y));
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          dx = b.x - a.x,
          dy = b.y - a.y,
          t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        consider(entity.id, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)));
      }
    }
    return bestId;
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = canvasPoint(event),
      world = toWorld(screen),
      point = snapped(world);
    setCursor(point);
    if (tool === "pan" || event.button === 1) {
      setDrag({ screen, world, mode: "pan" });
      return;
    }
    if (tool === "select") {
      const hit = nearest(world);
      if (hit) {
        setSelected((current) => {
          const next = new Set(event.shiftKey ? current : []);
          if (next.has(hit)) next.delete(hit);
          else next.add(hit);
          return next;
        });
        setDrag({ screen, world, mode: "move" });
      } else {
        if (!event.shiftKey) setSelected(new Set());
        setDrag({ screen, world, mode: "box" });
        setBoxEnd(screen);
      }
      return;
    }
    if (tool === "asset") {
      void placeAsset(point);
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Isi teks");
      if (text)
        patchEntities([
          {
            id: `new:${crypto.randomUUID()}`,
            type: "TEXT",
            layer: "TEXT",
            points: [point],
            text,
            height: Math.max(1, 12 / camera.scale),
          },
        ]);
      return;
    }
    if (tool === "line") {
      if (!draftPoints.length) setDraftPoints([point]);
      else {
        patchEntities([
          { id: `new:${crypto.randomUUID()}`, type: "LINE", layer: "EDITOR", points: [draftPoints[0], point] },
        ]);
        setDraftPoints([]);
      }
      return;
    }
    if (tool === "circle") {
      if (!draftPoints.length) setDraftPoints([point]);
      else {
        patchEntities([
          {
            id: `new:${crypto.randomUUID()}`,
            type: "CIRCLE",
            layer: "EDITOR",
            center: draftPoints[0],
            radius: Math.hypot(point.x - draftPoints[0].x, point.y - draftPoints[0].y),
          },
        ]);
        setDraftPoints([]);
      }
      return;
    }
    if (tool === "polyline") {
      setDraftPoints((current) => [...current, point]);
      return;
    }
    if (tool === "arc") {
      if (draftPoints.length < 2) setDraftPoints((current) => [...current, point]);
      else {
        const [center, start] = draftPoints;
        patchEntities([
          {
            id: `new:${crypto.randomUUID()}`,
            type: "ARC",
            layer: "EDITOR",
            center,
            radius: Math.hypot(start.x - center.x, start.y - center.y),
            startAngle: (Math.atan2(start.y - center.y, start.x - center.x) * 180) / Math.PI,
            endAngle: (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI,
          },
        ]);
        setDraftPoints([]);
      }
    }
  }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const screen = canvasPoint(event),
      world = toWorld(screen),
      point = snapped(world);
    setCursor(point);
    if (!drag) return;
    if (drag.mode === "pan")
      setCamera((current) => ({
        ...current,
        x: current.x - (screen.x - drag.screen.x) / current.scale,
        y: current.y + (screen.y - drag.screen.y) / current.scale,
      }));
    if (drag.mode === "box") setBoxEnd(screen);
  }
  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const screen = canvasPoint(event),
      world = toWorld(screen);
    if (drag.mode === "move" && selected.size) {
      const dx = world.x - drag.world.x,
        dy = world.y - drag.world.y;
      if (Math.hypot(dx, dy) > 2 / camera.scale)
        patchEntities(
          [...selected].flatMap((id) => {
            const entity = entityMap.get(id);
            return entity ? [moveEntity(entity, dx, dy)] : [];
          }),
        );
    }
    if (drag.mode === "box" && boxEnd) {
      const a = toWorld(drag.screen),
        b = toWorld(boxEnd),
        minX = Math.min(a.x, b.x),
        maxX = Math.max(a.x, b.x),
        minY = Math.min(a.y, b.y),
        maxY = Math.max(a.y, b.y);
      setSelected(
        new Set(
          entities
            .filter((entity) =>
              (entity.points ?? []).some(
                (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY,
              ),
            )
            .map((entity) => entity.id),
        ),
      );
    }
    setDrag(null);
    setBoxEnd(null);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setCamera((current) => ({ ...current, scale: Math.max(1e-7, Math.min(1e5, current.scale * factor)) }));
  }
  function finishPolyline() {
    if (draftPoints.length >= 2)
      patchEntities([{ id: `new:${crypto.randomUUID()}`, type: "LWPOLYLINE", layer: "EDITOR", points: draftPoints }]);
    setDraftPoints([]);
  }
  function transformSelected(kind: "rotate" | "scale" | "copy") {
    const raw = window.prompt(
      kind === "rotate" ? "Sudut rotasi (derajat)" : "Faktor skala",
      kind === "rotate" ? "90" : "1.1",
    );
    if (raw == null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || (kind === "scale" && value <= 0)) return;
    const origin = { x: cursor.x, y: cursor.y };
    const updates = [...selected].flatMap((id) => {
      const entity = entityMap.get(id);
      if (!entity) return [];
      const changed =
        kind === "rotate"
          ? rotateEntity(entity, value, origin)
          : kind === "scale"
            ? scaleEntity(entity, value, origin)
            : { ...moveEntity(entity, 10 / camera.scale, 10 / camera.scale), id: `new:${crypto.randomUUID()}` };
      return [changed];
    });
    patchEntities(updates);
    if (kind === "copy") setSelected(new Set(updates.map((entity) => entity.id)));
  }
  async function placeAsset(point: LocalPoint) {
    if (!assetId.trim()) {
      setStatus("Isi UUID aset sebelum menempatkan titik.");
      return;
    }
    const current = await fetch(`/api/assets/${assetId.trim()}`);
    if (!current.ok) {
      setStatus("Aset tidak ditemukan.");
      return;
    }
    const asset = (await current.json()).data;
    const response = await fetch(`/api/assets/${assetId.trim()}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: asset.version, dxfDocumentId: documentId, localX: point.x, localY: point.y }),
    });
    setStatus(
      response.ok
        ? `Aset ${asset.assetNumber} ditempatkan pada ${point.x.toFixed(3)}, ${point.y.toFixed(3)}.`
        : (await response.json()).error,
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !render) return;
    const context = canvas.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#06100e";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1;
    for (const entity of entities) {
      const active = selected.has(entity.id);
      context.strokeStyle = active
        ? "#facc15"
        : compare && snapshot.patches[entity.id]
          ? "#fb7185"
          : (entity.color ?? "#5eead4");
      context.fillStyle = context.strokeStyle;
      context.beginPath();
      if (entity.type === "LINE" || entity.type === "LWPOLYLINE") {
        entity.points?.forEach((point, index) => {
          const p = toScreen(point);
          if (index) context.lineTo(p.x, p.y);
          else context.moveTo(p.x, p.y);
        });
      }
      if (entity.type === "CIRCLE" || entity.type === "ARC") {
        const c = toScreen(entity.center!);
        const start = entity.type === "ARC" ? (-(entity.endAngle ?? 360) * Math.PI) / 180 : 0,
          end = entity.type === "ARC" ? (-(entity.startAngle ?? 0) * Math.PI) / 180 : Math.PI * 2;
        context.arc(c.x, c.y, (entity.radius ?? 0) * camera.scale, start, end);
      }
      if (entity.type === "TEXT") {
        const p = toScreen(entity.points![0]);
        context.font = `${Math.max(8, (entity.height ?? 1) * camera.scale)}px sans-serif`;
        context.fillText(entity.text ?? "", p.x, p.y);
      }
      context.stroke();
    }
    if (draftPoints.length) {
      context.strokeStyle = "#fb923c";
      context.beginPath();
      draftPoints.forEach((point, index) => {
        const p = toScreen(point);
        if (index) context.lineTo(p.x, p.y);
        else context.moveTo(p.x, p.y);
      });
      const p = toScreen(cursor);
      context.lineTo(p.x, p.y);
      context.stroke();
    }
    if (snap) {
      const p = toScreen(snap.point);
      context.strokeStyle = "#f97316";
      context.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }
    if (drag?.mode === "box" && boxEnd) {
      context.strokeStyle = "#38bdf8";
      context.setLineDash([5, 4]);
      context.strokeRect(drag.screen.x, drag.screen.y, boxEnd.x - drag.screen.x, boxEnd.y - drag.screen.y);
      context.setLineDash([]);
    }
  }, [
    camera,
    compare,
    cursor,
    drag,
    entities,
    render,
    selected,
    snap,
    snapshot.patches,
    toScreen,
    draftPoints,
    boxEnd,
    ]);

  // Native wheel listener with passive:false so preventDefault works (React 19
  // registers onWheel as passive, which silently ignores preventDefault).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);

  function changeSelectedProperty(field: "layer" | "color" | "lineType", value: string) {
    patchEntities(
      [...selected].flatMap((id) => {
        const entity = entityMap.get(id);
        return entity ? [{ ...entity, [field]: value }] : [];
      }),
    );
  }
  async function exportVersion() {
    if (!session || saveState !== "saved") {
      setStatus("Tunggu autosave selesai sebelum ekspor.");
      return;
    }
    if (!changeNote.trim()) {
      setStatus("Change note wajib diisi sebelum ekspor.");
      return;
    }
    setStatus("Mengekspor versi DXF immutable...");
    const response = await fetch(`/api/dxf-documents/${documentId}/edit-sessions/${session.id}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ changeNote }),
    });
    const body = await response.json();
    setStatus(
      response.ok
        ? `Versi v${body.data.versionNumber} dibuat dan masuk antrean parser${body.data.sourceTruncated ? " (berbasis normalized cap)" : ""}.`
        : body.error,
    );
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <small>XASSET · PHASE 5</small>
          <h1>{documentName} · DXF Editor</h1>
        </div>
        <nav>
          <Link href="/dxf">Kembali ke versi</Link>
          <span className={`save-state ${saveState}`}>{saveState}</span>
          <LogoutButton />
        </nav>
      </header>
      <section className="editor-toolbar">
        {(["select", "pan", "line", "polyline", "circle", "arc", "text", "asset"] as Tool[]).map((item) => (
          <button
            key={item}
            className={tool === item ? "active" : ""}
            onClick={() => {
              setTool(item);
              setDraftPoints([]);
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
        <i />
        <button onClick={undo}>UNDO</button>
        <button onClick={redo}>REDO</button>
        <button onClick={() => transformSelected("copy")} disabled={!selected.size}>
          COPY
        </button>
        <button onClick={() => transformSelected("rotate")} disabled={!selected.size}>
          ROTATE
        </button>
        <button onClick={() => transformSelected("scale")} disabled={!selected.size}>
          SCALE
        </button>
        <button onClick={removeSelected} disabled={!selected.size}>
          DELETE
        </button>
        {tool === "polyline" && (
          <button className="accent" onClick={finishPolyline}>
            FINISH POLYLINE
          </button>
        )}
        <label>
          <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /> Compare
          changes
        </label>
      </section>
      <section className="editor-workspace">
        <aside className="editor-panel">
          <h2>Layer</h2>
          <div className="editor-layer-list">
            {layers.map((layer) => (
              <button key={layer} onClick={() => changeSelectedProperty("layer", layer)}>
                <span>{layer}</span>
                <small>{entities.filter((entity) => entity.layer === layer).length.toLocaleString("id-ID")}</small>
              </button>
            ))}
          </div>
          <h2>Properties</h2>
          <label>
            Layer
            <input
              value={selected.size === 1 ? (entityMap.get([...selected][0])?.layer ?? "") : ""}
              disabled={!selected.size}
              onChange={(event) => changeSelectedProperty("layer", event.target.value)}
            />
          </label>
          <label>
            Color
            <input
              type="color"
              disabled={!selected.size}
              value={selected.size === 1 ? (entityMap.get([...selected][0])?.color ?? "#5eead4") : "#5eead4"}
              onChange={(event) => changeSelectedProperty("color", event.target.value)}
            />
          </label>
          <label>
            Line type
            <select
              disabled={!selected.size}
              onChange={(event) => changeSelectedProperty("lineType", event.target.value)}
            >
              <option>CONTINUOUS</option>
              <option>DASHED</option>
              <option>DOTTED</option>
            </select>
          </label>
          <p>{selected.size} entitas dipilih</p>
          <h2>Posisi aset</h2>
          <label>
            UUID aset
            <input
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              placeholder="Pilih tool ASSET lalu klik layout"
            />
          </label>
        </aside>
        <div className="editor-canvas-wrap">
          <canvas
            ref={canvasRef}
            role="application"
            aria-label="Canvas editor DXF; gunakan toolbar untuk memilih operasi"
            tabIndex={0}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
          />
          <div className="editor-coordinate">
            X {cursor.x.toFixed(3)} · Y {cursor.y.toFixed(3)} · {render?.unit ?? "unit"} · Snap {snap?.kind ?? "off"} ·
            Zoom {camera.scale.toExponential(2)}
          </div>
        </div>
        <aside className="editor-panel editor-version">
          <h2>Draft</h2>
          <dl>
            <dt>Base</dt>
            <dd>v{session?.baseVersionNumber ?? "—"}</dd>
            <dt>Visible</dt>
            <dd>{render?.segments.length.toLocaleString("id-ID") ?? "—"}</dd>
            <dt>Changes</dt>
            <dd>{Object.keys(snapshot.patches).length.toLocaleString("id-ID")}</dd>
            <dt>Session</dt>
            <dd>{session?.id.slice(0, 8) ?? "—"}</dd>
          </dl>
          <label>
            Change note
            <textarea
              value={changeNote}
              onChange={(event) => {
                setChangeNote(event.target.value);
                setSaveState("dirty");
              }}
              maxLength={500}
            />
          </label>
          <button
            className="editor-export"
            disabled={saveState !== "saved" || session?.status !== "draft"}
            onClick={() => void exportVersion()}
          >
            Ekspor versi DXF baru
          </button>
          <p>File sumber tidak ditimpa. Edit lama tetap tersedia melalui version history dan rollback.</p>
        </aside>
      </section>
      <footer className="editor-status">{status}</footer>
    </main>
  );
}
