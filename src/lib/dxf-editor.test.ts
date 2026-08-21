import { describe, expect, it } from "vitest";
import DxfParser from "dxf-parser";
import { applyEditorSnapshot, exportEditorDxf, findSnap, moveEntity, orderEditorEntitiesForExport, rotateEntity, scaleEntity, validateEditorEntities, type EditorEntity } from "./dxf-editor";

const line = (id: string, a = {x:0,y:0}, b = {x:10,y:0}): EditorEntity => ({ id,type:"LINE",layer:"TEST",points:[a,b] });

describe("DXF editor core", () => {
  it("applies additions, updates and deletes without mutating the base", () => {
    const base = [line("a"),line("b")];
    const result = applyEditorSnapshot(base,{ patches:{ a:moveEntity(base[0],2,3), b:null, c:line("c") } });
    expect(result.map((entity)=>entity.id)).toEqual(["a","c"]);
    expect(result[0].points?.[0]).toEqual({x:2,y:3});
    expect(base[0].points?.[0]).toEqual({x:0,y:0});
  });

  it("puts new entities first so they survive the normalized LOD cap",()=>{
    expect(orderEditorEntitiesForExport([line("e1:s0"),line("new:1")]).map(entity=>entity.id)).toEqual(["new:1","e1:s0"]);
  });

  it("snaps endpoint, midpoint, intersection and grid", () => {
    const entities=[line("horizontal"),line("vertical",{x:5,y:-5},{x:5,y:5})];
    expect(findSnap({x:.1,y:.1},entities,.5)?.kind).toBe("endpoint");
    expect(findSnap({x:5.1,y:.1},[entities[0]],.5)?.kind).toBe("midpoint");
    expect(findSnap({x:5.1,y:.1},entities,.5)?.kind).toBe("midpoint");
    expect(findSnap({x:3.1,y:.1},[entities[0],line("cross",{x:3,y:-2},{x:3,y:4})],.5)?.kind).toBe("intersection");
    expect(findSnap({x:2.1,y:2.1},[],.2,1)?.kind).toBe("grid");
  });

  it("moves, rotates and scales geometry", () => {
    expect(moveEntity(line("a"),1,2).points?.[0]).toEqual({x:1,y:2});
    expect(rotateEntity(line("a",{x:1,y:0},{x:2,y:0}),90).points?.[0].x).toBeCloseTo(0);
    expect(scaleEntity({id:"c",type:"CIRCLE",layer:"0",center:{x:1,y:1},radius:2},3).radius).toBe(6);
  });

  it("exports every MVP entity and parses the DXF again", () => {
    const entities:EditorEntity[]=[
      line("line"),
      {id:"poly",type:"LWPOLYLINE",layer:"P",points:[{x:0,y:0},{x:1,y:2},{x:3,y:4}]},
      {id:"circle",type:"CIRCLE",layer:"C",center:{x:2,y:2},radius:3},
      {id:"arc",type:"ARC",layer:"A",center:{x:5,y:5},radius:2,startAngle:0,endAngle:90},
      {id:"text",type:"TEXT",layer:"T",points:[{x:1,y:1}],text:"Asset 01",height:1},
    ];
    expect(validateEditorEntities(entities)).toEqual([]);
    const drawing = new DxfParser().parseSync(exportEditorDxf(entities));
    expect(drawing?.entities.map((entity)=>entity.type)).toEqual(["LINE","LWPOLYLINE","CIRCLE","ARC","TEXT"]);
  });

  it("rejects invalid geometry before export", () => {
    const invalid:EditorEntity={id:"bad",type:"CIRCLE",layer:"0",center:{x:0,y:0},radius:0};
    expect(validateEditorEntities([invalid])).toHaveLength(1);
    expect(()=>exportEditorDxf([invalid])).toThrow("radius positif");
  });
});
