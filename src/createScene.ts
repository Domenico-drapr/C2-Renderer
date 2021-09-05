import { Vector2, Vector3 } from "three";
import { Materials } from "./materials/materials";
import { nrand, rand, vec3 } from "./utils";



export function createScene(): string {
  let entities = [];
  let materials = [
    {
      idx: 0,
      type: Materials.SimpleLambert,
      color: new Vector3(0.9, 0.9, 0.9),
    },
    {
      idx: 1,
      type: Materials.SimpleLambert,
      color: new Vector3(1, 0.5, 0.24),
    },
    {
      idx: 2,
      type: Materials.SimpleMirror,
      color: new Vector3(0.24, 0.5, 1.0),
    },
    {
      idx: 3,
      type: Materials.SimpleLambert,
      color: new Vector3(0.8, 0.15, 0.05),
    },
    {
      idx: 4,
      type: Materials.SimpleTransmission,
      color: new Vector3(0.85, 0.85, 0.85),
      refractionIndex: 1.5,
    },
  ];

  // for (let i = 0; i < 3000; i++) {
  //   entities.push({
  //     type: "sphere",
  //     radius: Math.random() * 2 + 0.2,
  //     material: Math.floor(rand() * 4.99),
  //     center: new Vector3(nrand(20), nrand(20), nrand(20) + 40)
  //   })
  // }

  for(let i = 0; i < 1400; i++) {
    let r = 2;
    let v0 = new Vector3(nrand(r), nrand(r), nrand(r) + 10);
    let v1 = new Vector3(nrand(r), nrand(r), nrand(r) + 10);
    let v2 = new Vector3(nrand(r), nrand(r), nrand(r) + 10);

    let t = 7;
    let translation = new Vector3(nrand(t), nrand(t), nrand(t));

    v0.add(translation);
    v1.add(translation);
    v2.add(translation);

    entities.push({
      type: "triangle",
      v0, v1, v2,
      material: Math.floor(rand() * 3.99),
    });
  }


  // entities.push(
  //   {
  //     type: "triangle",
  //     v0: vec3(-5 * 2, -5 * 2, 10), 
  //     v1: vec3(+5 * 2, -5 * 2, 10), 
  //     v2: vec3(+0 * 2, +5 * 2, 10), 
  //     material: 1,
  //   },
  //   {
  //     type: "triangle",
  //     v0: vec3(0,   -1, 12), 
  //     v1: vec3(1,   -1, 8),

  //     v2: vec3(0.5, +2, 10), 
  //     material: 2,
  //   }
  // );


  return JSON.stringify({
    entities,
    materials,
    camera: {
      center: new Vector3(0, 0, 0),
      target: new Vector3(0, 0, 1),
      fov: (25 / 180) * Math.PI,
    },
  });
}

// export function createScene() : string {
//   return JSON.stringify({ 
//     entities: [
//     
//     ],
//     materials: [
//       {
//         idx: 0,
//         type: Materials.SimpleLambert,
//         color: new Vector3(0.7,0.7,0.7),
//       },
//       {
//         idx: 1,
//         type: Materials.SimpleLambert,
//         color: new Vector3(1, 0.5, 0.24),
//       },
//       {
//         idx: 2,
//         type: Materials.SimpleMirror,
//         color: new Vector3(0.24, 0.5, 1.0),
//       },
//       {
//         idx: 3,
//         type: Materials.SimpleLambert,
//         color: new Vector3(0.8, 0.15, 0.05),
//       },
//       {
//         idx: 4,
//         type: Materials.SimpleGlossy,
//         color: new Vector3(1,1,1),
//         glossiness: 0.15,
//       },
//       {
//         idx: 5,
//         type: Materials.SimpleLambert,
//         color: new Vector3(1,1,1),
//       },
//       {
//         idx: 6,
//         type: Materials.SimpleMirror,
//         color: new Vector3(0.4,0.4,0.4),
//       },
//       {
//         idx: 7,
//         type: Materials.SimpleTransmission,
//         color: new Vector3(0.85, 0.85, 0.85),
//         refractionIndex: 1.5,
//       },
//     ],
//     camera: {
//       center: new Vector3(0,0,0),
//       target: new Vector3(0,0,1),
//       fov: (25 / 180) * Math.PI,
//     },
//   });
// }