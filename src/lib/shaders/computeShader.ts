import { cameraPart } from './parts/camera';
import { mathUtilsPart } from './parts/mathUtils';
import { primitivesPart } from './parts/primitives';

export const computeShader = /*wgsl*/ `
@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

// at the moment these have to be imported with this specific order
${mathUtilsPart}
${cameraPart}
${primitivesPart}

const PI = 3.14159265359;
const camera = Camera(vec3f(0, 0, 0), PI * 0.25, mat3x3f());

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= canvasSize.x || gid.y >= canvasSize.y) { return; }

  // from [0...1] to [-1...+1]
  let nuv = vec2f(
    f32(gid.x) / f32(canvasSize.x) * 2 - 1,
    f32(gid.y) / f32(canvasSize.y) * 2 - 1,
  );

  let aspectRatio = f32(canvasSize.x) / f32(canvasSize.y);
  let fovTangent = tan(camera.fov * 0.5);
  let rd = normalize(vec3f(
    fovTangent * nuv.x * aspectRatio, 
    fovTangent * nuv.y, 
    1.0
  ));
  let ro = vec3f(0, 0, 0);


  let sphere = Sphere(vec3f(0, 0, 10), 1);
  let ray = Ray(ro, rd);
  let intersectionResult = intersectSphere(sphere, ray);
  let finalColor = select(vec3f(0,0,0), vec3f(1,0,0), intersectionResult.hit);


  let idx = gid.y * canvasSize.x + gid.x;
  // data[idx] = vec3f(
  //   sin(f32(gid.x) * 0.75) * 0.5 + 0.5, 
  //   cos(f32(gid.y) * 0.75) * 0.5 + 0.5, 
  //   0
  // );
  // data[idx] = rd;
  data[idx] = finalColor;
}
`;
