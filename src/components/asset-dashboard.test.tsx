// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/lib/types";
import { AssetDashboard } from "./asset-dashboard";

const routerReplace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock("./cesium-map", () => ({
  CesiumMap: ({
    assets,
    selectedId,
    segments,
    onSelect,
    positionAssetId,
    polygonAssetId,
    polygonDraft = [],
    onPlace,
    onPolygonPoint,
    onPolygonSave,
    onCancelPlace,
    activeSite,
  }: {
    assets: Asset[];
    selectedId: string | null;
    segments: unknown[];
    onSelect: (id: string) => void;
    positionAssetId?: string;
    polygonAssetId?: string;
    polygonDraft?: Array<{ longitude: number; latitude: number }>;
    onPlace: (point: { longitude: number; latitude: number }) => void;
    onPolygonPoint?: (point: { longitude: number; latitude: number }) => void;
    onPolygonSave?: () => void;
    onCancelPlace?: () => void;
    activeSite?: { code: string; name: string; longitude: number; latitude: number; cameraHeight: number };
  }) => (
    <>
      <button
        data-testid="map-state"
        data-count={assets.length}
        data-selected={selectedId ?? ""}
        data-segments={segments.length}
        data-site={`${activeSite?.latitude ?? ""},${activeSite?.longitude ?? ""}`}
        onClick={() => assets[0] && onSelect(assets[0].id)}
      >
        Mock map
      </button>
      {positionAssetId && (
        <>
          <button onClick={() => onPlace({ longitude: 104.53234567, latitude: 0.92276543 })}>Simpan titik uji</button>
          <button onClick={onCancelPlace}>Batalkan penentuan posisi</button>
        </>
      )}
      {polygonAssetId && (
        <>
          <button
            onClick={() =>
              onPolygonPoint?.(
                [
                  { longitude: 104.53, latitude: 0.92 },
                  { longitude: 104.54, latitude: 0.92 },
                  { longitude: 104.54, latitude: 0.93 },
                ][polygonDraft.length] ?? { longitude: 104.53, latitude: 0.93 },
              )
            }
          >
            Tambah titik polygon uji
          </button>
          <button disabled={polygonDraft.length < 3} onClick={onPolygonSave}>Simpan polygon uji</button>
          <button onClick={onCancelPlace}>Batalkan gambar polygon</button>
        </>
      )}
    </>
  ),
}));

beforeEach(() => {
  routerReplace.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sample: Asset[] = [
  {
    id: "mapped",
    no: 1,
    assetNumber: "1001",
    capitalizedOn: "2025-01-01",
    assetCode: "PUMP-01",
    assetClass: "Pump",
    description: "Pompa utama",
    acquisitionValue: 100,
    bookValue: 80,
    quantity: 1,
    unit: "UNIT",
    location: "Terminal 1",
    subAsset: "—",
    documentationCount: 0,
    photoDocumentId: "photo-1",
    layout: "Area A",
    maintenance: "Active",
    usageFrequency: "Harian",
    longitude: 104.5323,
    latitude: 0.9227,
    altitude: 0,
    version: 1,
  },
  {
    id: "unmapped",
    no: 2,
    assetNumber: "1002",
    capitalizedOn: "2025-01-02",
    assetCode: "PANEL-02",
    assetClass: "Electrical",
    description: "Panel distribusi",
    acquisitionValue: 100,
    bookValue: 70,
    quantity: 1,
    unit: "SET",
    location: "Terminal 2",
    subAsset: "—",
    documentationCount: 0,
    layout: "Belum dipetakan",
    maintenance: "Commissioning",
    usageFrequency: "Kontinu",
    longitude: null,
    latitude: null,
    altitude: null,
    version: 1,
  },
];

describe("AssetDashboard list-to-map synchronization", () => {
  it("applies search, status, and mapping filters to both list and map", () => {
    render(<AssetDashboard initialAssets={sample} />);

    expect(screen.getByText("2 aset terlihat")).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-count")).toBe("2");

    expect(screen.getByText("No. 1")).toBeTruthy();
    expect(screen.getByAltText("Foto Pompa utama").getAttribute("src")).toBe(
      "/api/assets/mapped/photo?v=photo-1",
    );
    expect(
      screen.getByText((_, element) => element?.tagName === "SMALL" && element.textContent?.includes("No Asset 1001") === true),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Cari No, No Asset/i), { target: { value: "panel" } });
    expect(screen.getByText("1 aset terlihat")).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-count")).toBe("1");

    fireEvent.change(screen.getByDisplayValue("Semua posisi"), { target: { value: "Sudah dipetakan" } });
    expect(screen.getByText("0 aset terlihat")).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-count")).toBe("0");
  });

  it("propagates a map selection to the selected asset detail", () => {
    render(<AssetDashboard initialAssets={sample} initialSelectedId="unmapped" />);
    expect(screen.getByRole("heading", { name: "Panel distribusi" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("map-state"));

    expect(screen.getByRole("heading", { name: "Pompa utama" })).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-selected")).toBe("mapped");
  });

  it("uses the active site and only exposes management menus to authorized roles", () => {
    const activeSite = { id: "site-bth", code: "BTH", name: "Bandar Udara Hang Nadim", longitude: 104.1188, latitude: 1.121, cameraHeight: 5200 };
    const { rerender } = render(<AssetDashboard initialAssets={sample} activeSite={activeSite} userName="Viewer Satu" />);
    expect(screen.getAllByText("Bandar Udara Hang Nadim · BTH")).toHaveLength(2);
    expect(screen.getByTestId("map-state").getAttribute("data-site")).toBe("1.121,104.1188");
    expect(screen.queryByRole("link", { name: "DATA ASET" })).toBeNull();
    expect(screen.queryByRole("link", { name: "ADMIN" })).toBeNull();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();

    rerender(<AssetDashboard initialAssets={sample} activeSite={activeSite} canManageData canAdmin />);
    expect(screen.getByRole("link", { name: "DATA ASET" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "DXF" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ADMIN" })).toBeTruthy();
  });

  it("edits the selected asset in a dashboard popup without an Upload DXF action", async () => {
    const updated = { ...sample[0], description: "Pompa utama diperbarui", version: 2 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/assets/mapped" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ data: updated }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={sample} initialSelectedId="mapped" canWrite />);

    expect(screen.queryByRole("button", { name: /Upload DXF/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Asset" }));
    const dialog = screen.getByRole("dialog", { name: "Pompa utama" });
    fireEvent.change(dialog.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!, {
      target: { value: "Pompa utama diperbarui" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Simpan aset" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/mapped",
      expect.objectContaining({ method: "PATCH" }),
    ));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pompa utama diperbarui" })).toBeTruthy());
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("filters the asset directory and map markers by asset class", () => {
    const { container } = render(<AssetDashboard initialAssets={sample} />);

    fireEvent.change(screen.getByLabelText("Filter class aset"), { target: { value: "Electrical" } });

    expect(screen.getByText("1 aset terlihat")).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-count")).toBe("1");
    expect(screen.getByRole("button", { name: /PANEL-02/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /PUMP-01/ })).toBeNull();
    const printReport = container.querySelector(".print-asset-report");
    expect(printReport?.textContent).toContain("Class: Electrical");
    expect(printReport?.textContent).toContain("Panel distribusi");
    expect(printReport?.textContent).not.toContain("Pompa utama");
  });

  it("offers a processed upload as a selectable top DXF layer", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const url = String(input);
      if (url === "/api/dxf-documents") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "dxf-ready",
                name: "Layout upload",
                status: "draft",
                mapVersionId: "version-ready",
                mapVersionNumber: 2,
                mapVersionStatus: "ready",
                mapTransform: {
                  origin: { longitude: 104.5, latitude: 0.9 },
                  localOrigin: { x: 0, y: 0 },
                  metersPerUnit: 1,
                  rotationDegrees: 0,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/versions/version-ready/render")) {
        return new Response(
          JSON.stringify({
            schemaVersion: 2,
            segmentFormat: "id-layer-x1-y1-x2-y2",
            segmentLayers: ["WALL"],
            segments: [["e0:s0", 0, 0, 0, 10, 0]],
            transform: {
              origin: { longitude: 104.5, latitude: 0.9 },
              localOrigin: { x: 0, y: 0 },
              metersPerUnit: 1,
              rotationDegrees: 0,
            },
            layers: [{ name: "WALL", color: "#ffffff", opacity: "1", sortOrder: 0 }],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={sample} />);

    const menu = screen.getByLabelText("Layer DXF pada peta");
    await waitFor(() => expect((menu as HTMLSelectElement).value).toBe("dxf-ready"));
    expect(screen.getByRole("option", { name: /Layout upload · v2 · Upload siap/i })).toBeTruthy();
    expect(screen.getByTestId("map-state").getAttribute("data-segments")).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith("/api/dxf-documents/dxf-ready/versions/version-ready/render");
  });

  it("opens the browser print dialog for the current map view", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { container } = render(<AssetDashboard initialAssets={sample} />);

    fireEvent.click(screen.getByRole("button", { name: /Print \/ PDF/i }));

    expect(print).toHaveBeenCalledOnce();
    const locationLinks = container.querySelectorAll<HTMLAnchorElement>(".print-asset-report .print-map-link");
    expect(locationLinks).toHaveLength(1);
    expect(locationLinks[0].textContent).toBe("Terminal 1");
    expect(locationLinks[0].href).toBe(
      "https://www.google.com/maps/search/?api=1&query=0.9227%2C104.5323",
    );
  });

  it("focuses the map and can cancel position placement", () => {
    const { container } = render(<AssetDashboard initialAssets={sample} positionAssetId="mapped" />);

    expect(container.querySelector(".app-shell")?.classList.contains("placement-focus")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Batalkan penentuan posisi" }));
    expect(routerReplace).toHaveBeenCalledWith("/?asset=mapped");
  });

  it("stores a selected map position in the coordinate dataset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/assets/unmapped") {
        return new Response(JSON.stringify({ data: { version: 2 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={sample} positionAssetId="unmapped" />);
    fireEvent.click(screen.getByRole("button", { name: "Simpan titik uji" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/unmapped",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          longitude: 104.53234567,
          latitude: 0.92276543,
          coordinateText: "0.9227654, 104.5323457",
          altitude: 0,
          version: 1,
        }),
      }),
    ));
    expect(routerReplace).toHaveBeenCalledWith("/?asset=unmapped");
  });

  it("draws and stores an asset polygon with its center position", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(input) === "/api/assets/unmapped")
        return new Response(JSON.stringify({ data: { version: 2 } }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={sample} polygonAssetId="unmapped" canWrite />);
    const addPoint = screen.getByRole("button", { name: "Tambah titik polygon uji" });
    fireEvent.click(addPoint);
    fireEvent.click(addPoint);
    fireEvent.click(addPoint);
    fireEvent.click(screen.getByRole("button", { name: "Simpan polygon uji" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/unmapped",
      expect.objectContaining({ method: "PATCH" }),
    ));
    const request = fetchMock.mock.calls.find(([input]) => String(input) === "/api/assets/unmapped")?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      polygon: [
        { longitude: 104.53, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.93 },
      ],
      version: 1,
    });
    expect(routerReplace).toHaveBeenCalledWith("/?asset=unmapped");
  });

  it("removes a recorded asset position without removing its polygon", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const withPolygon: Asset[] = [{
      ...sample[0],
      polygon: [
        { longitude: 104.53, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.93 },
      ],
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(input) === "/api/assets/mapped")
        return new Response(JSON.stringify({ data: { version: 2 } }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={withPolygon} initialSelectedId="mapped" canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Hapus posisi" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Hapus posisi" })).toBeNull());
    expect(screen.getByRole("button", { name: "Hapus polygon" })).toBeTruthy();
    const request = fetchMock.mock.calls.find(([input]) => String(input) === "/api/assets/mapped")?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      longitude: null,
      latitude: null,
      localX: null,
      localY: null,
      localZ: null,
      version: 1,
    });
  });

  it("removes a recorded polygon without removing its position", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const withPolygon: Asset[] = [{
      ...sample[0],
      polygon: [
        { longitude: 104.53, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.92 },
        { longitude: 104.54, latitude: 0.93 },
      ],
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(input) === "/api/assets/mapped")
        return new Response(JSON.stringify({ data: { version: 2 } }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssetDashboard initialAssets={withPolygon} initialSelectedId="mapped" canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Hapus polygon" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Hapus polygon" })).toBeNull());
    expect(screen.getByRole("button", { name: "Hapus posisi" })).toBeTruthy();
    const request = fetchMock.mock.calls.find(([input]) => String(input) === "/api/assets/mapped")?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({ polygon: null, version: 1 });
  });
});
