import { BVH } from '$lib/bvh/bvh';
import type { Material } from '$lib/materials/material';
import type { Triangle } from '$lib/primitives/triangle';
import { getComputeShader } from '$lib/shaders/computeShader';
import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Matrix4, Vector2, Vector3 } from 'three';
import { samplesInfo } from '../../routes/stores/main';
import { ResetSegment } from './resetSegment';
import { HaltonSampler } from '$lib/samplers/Halton';
import type { TileSequence, Tile } from '$lib/tile';
import { ComputePassPerformance } from '$lib/webgpu-utils/passPerformance';
import { configManager } from '$lib/config';

export class ComputeSegment {
  public passPerformance: ComputePassPerformance;

  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline | null = null;
  #bindGroupLayouts: GPUBindGroupLayout[];
  #layout: GPUPipelineLayout;
  #configManager = configManager;

  #bindGroup0: GPUBindGroup | null = null;
  #bindGroup1: GPUBindGroup | null = null;
  #bindGroup2: GPUBindGroup | null = null;
  #bindGroup3: GPUBindGroup | null = null;

  #canvasSize: Vector2 | null = null;
  #canvasSizeUniformBuffer: GPUBuffer;
  #cameraUniformBuffer: GPUBuffer;

  #cameraSampleUniformBuffer: GPUBuffer;

  #configUniformBuffer: GPUBuffer;
  #tileUniformBuffer: GPUBuffer;

  #debugBuffer: GPUBuffer;
  #debugPixelTargetBuffer: GPUBuffer;
  #debugReadBuffer: GPUBuffer;

  #trianglesBuffer: GPUBuffer | null = null;
  #materialsBuffer: GPUBuffer | null = null;
  #bvhBuffer: GPUBuffer | null = null;
  #lightsCDFBuffer: GPUBuffer | null = null;

  #resetSegment: ResetSegment;

  #haltonSampler: HaltonSampler = new HaltonSampler();

  #tileSequence: TileSequence;

  #requestShaderCompilation = false;

  constructor(device: GPUDevice, tileSequence: TileSequence) {
    this.#device = device;
    this.#tileSequence = tileSequence;

    this.#resetSegment = new ResetSegment(device);

    this.passPerformance = new ComputePassPerformance(device);

    this.#bindGroupLayouts = [
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' }
      ])
    ];
    this.#layout = device.createPipelineLayout({
      bindGroupLayouts: this.#bindGroupLayouts
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.#canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#cameraUniformBuffer = device.createBuffer({
      size: 4 * 16 /* determined with offset computer */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#cameraSampleUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#configUniformBuffer = device.createBuffer({
      size: configManager.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#tileUniformBuffer = device.createBuffer({
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // these buffers will be assigned by setDebugPixelTarget
    this.#debugBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugPixelTargetBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugReadBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.setDebugPixelTarget(0, 0);

    configManager.e.addEventListener('config-update', () => {
      this.updateConfig();
    });
    this.updateConfig();

    this.#requestShaderCompilation = true;
  }

  setDebugPixelTarget(x: number, y: number) {
    const size = 100;

    this.#debugBuffer = this.#device.createBuffer({
      size: 4 * size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.#device.queue.writeBuffer(
      this.#debugBuffer,
      0,
      new Float32Array(Array.from({ length: size }, (_, i) => 0))
    );

    this.#debugPixelTargetBuffer = this.#device.createBuffer({
      size: 4 * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.#device.queue.writeBuffer(this.#debugPixelTargetBuffer, 0, new Uint32Array([x, y]));

    this.#debugReadBuffer = this.#device.createBuffer({
      size: 4 * size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.#bindGroup2 = this.#device.createBindGroup({
      label: 'compute bindgroup - debug buffer',
      layout: this.#bindGroupLayouts[2],
      entries: [
        { binding: 0, resource: { buffer: this.#debugBuffer } },
        { binding: 1, resource: { buffer: this.#debugPixelTargetBuffer } }
      ]
    });
  }

  async logDebugResult() {
    /* 
      ****** caution ******
      ****** caution ******
      
      if you use this function in a loop of this type:
      function render() {
        computeSegment.compute();
        computeSegment.logDebugResult();
      }

      since this function is async, it's possible that a mapping will be already pending
      when executing the next render call. In that case webGPU errors out
      For now, I'm only using logDebugResult on demand, when e.g. pressing a key
    */
    await this.#debugReadBuffer.mapAsync(GPUMapMode.READ);
    const f32 = new Float32Array(this.#debugReadBuffer.getMappedRange());
    console.log(f32);
    this.#debugReadBuffer.unmap();
  }

  updateCamera(position: Vector3, fov: number, rotationMatrix: Matrix4) {
    this.resetSamplesAndTile();

    this.#device.queue.writeBuffer(
      this.#cameraUniformBuffer,
      0,
      new Float32Array([
        position.x,
        position.y,
        position.z,
        fov,
        rotationMatrix.elements[0],
        rotationMatrix.elements[1],
        rotationMatrix.elements[2],
        0,
        rotationMatrix.elements[4],
        rotationMatrix.elements[5],
        rotationMatrix.elements[6],
        0,
        rotationMatrix.elements[8],
        rotationMatrix.elements[9],
        rotationMatrix.elements[10],
        0
      ])
    );

    // we need to re-create the bindgroup since cameraUniformBuffer
    // is a new buffer
    this.#bindGroup1 = this.#device.createBindGroup({
      label: 'compute bindgroup - camera struct',
      layout: this.#bindGroupLayouts[1],
      entries: [
        { binding: 0, resource: { buffer: this.#cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.#cameraSampleUniformBuffer } },
        { binding: 2, resource: { buffer: this.#configUniformBuffer } },
        { binding: 3, resource: { buffer: this.#tileUniformBuffer } }
      ]
    });
  }

  updateConfig() {
    this.resetSamplesAndTile();

    this.#device.queue.writeBuffer(
      this.#configUniformBuffer,
      0,
      this.#configManager.getOptionsBuffer()
    );
  }

  updateTile(tile: Tile) {
    this.#device.queue.writeBuffer(
      this.#tileUniformBuffer,
      0,
      new Uint32Array([tile.x, tile.y, tile.w, tile.h])
    );
  }

  updateScene(triangles: Triangle[], materials: Material[]) {
    this.resetSamplesAndTile();
    // if we have a new envmap, we might have to require a shader re-compilation
    this.#requestShaderCompilation = true;

    const bvh = new BVH(triangles, materials);
    let { trianglesBufferData, trianglesBufferDataByteSize, BVHBufferData, BVHBufferDataByteSize } =
      bvh.getBufferData();

    let { LightsCDFBufferData, LightsCDFBufferDataByteSize } = bvh.getLightsCDFBufferData();

    let materialsData = new Float32Array(materials.map((mat) => mat.getFloatsArray()).flat());

    this.#trianglesBuffer = this.#device.createBuffer({
      size: trianglesBufferDataByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#materialsBuffer = this.#device.createBuffer({
      size: materialsData.byteLength /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#bvhBuffer = this.#device.createBuffer({
      size: BVHBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#lightsCDFBuffer = this.#device.createBuffer({
      size: LightsCDFBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#device.queue.writeBuffer(this.#trianglesBuffer, 0, trianglesBufferData);
    this.#device.queue.writeBuffer(this.#materialsBuffer, 0, materialsData);
    this.#device.queue.writeBuffer(this.#bvhBuffer, 0, BVHBufferData);
    this.#device.queue.writeBuffer(this.#lightsCDFBuffer, 0, LightsCDFBufferData);

    // we need to re-create the bindgroup
    this.#bindGroup3 = this.#device.createBindGroup({
      label: 'compute bindgroup - scene data',
      layout: this.#bindGroupLayouts[3],
      entries: [
        { binding: 0, resource: { buffer: this.#trianglesBuffer } },
        { binding: 1, resource: { buffer: this.#materialsBuffer } },
        { binding: 2, resource: { buffer: this.#bvhBuffer } },
        { binding: 3, resource: { buffer: this.#lightsCDFBuffer } }
      ]
    });
  }

  updateCameraSample() {
    let sample = this.#haltonSampler.get2DSample();
    this.#device.queue.writeBuffer(
      this.#cameraSampleUniformBuffer,
      0,
      new Float32Array([sample.x, sample.y])
    );
  }

  resize(canvasSize: Vector2, workBuffer: GPUBuffer, samplesCountBuffer: GPUBuffer) {
    this.#resetSegment.resize(canvasSize, workBuffer, samplesCountBuffer);
    this.#tileSequence.setCanvasSize(canvasSize);

    this.resetSamplesAndTile();

    this.#canvasSize = canvasSize;

    this.#device.queue.writeBuffer(
      this.#canvasSizeUniformBuffer,
      0,
      new Uint32Array([canvasSize.x, canvasSize.y])
    );

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.#bindGroup0 = this.#device.createBindGroup({
      label: 'compute bindgroup',
      layout: this.#bindGroupLayouts[0],
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: samplesCountBuffer } },
        { binding: 2, resource: { buffer: this.#canvasSizeUniformBuffer } }
      ]
    });
  }

  resetSamplesAndTile() {
    this.#tileSequence.resetTile();
    samplesInfo.reset();
  }

  increaseTileSize() {
    if (this.#tileSequence.canTileSizeBeIncreased()) {
      this.#tileSequence.increaseTileSize();
      // when we increase the tile size, the position doesn't change,
      // thus we'll re-draw a portion of the pixels that were part of the previous tile,
      // those pixels will need a new camera sample to properly accumulate new radiance values
      // otherwise they would count twice the results of the same camera sample
      this.updateCameraSample();
    }
  }

  decreaseTileSize() {
    if (this.#tileSequence.canTileSizeBeDecreased()) {
      this.#tileSequence.decreaseTileSize();
      // when we decrease the tile size, the position doesn't change,
      // thus we'll re-draw a portion of the pixels that were part of the previous tile,
      // those pixels will need a new camera sample to properly accumulate new radiance values
      // otherwise they would count twice the results of the same camera sample
      this.updateCameraSample();
    }
  }

  createPipeline() {
    const computeModule = this.#device.createShaderModule({
      label: 'compute module',
      code: getComputeShader()
    });

    this.#pipeline = this.#device.createComputePipeline({
      label: 'compute pipeline',
      layout: this.#layout,
      compute: {
        module: computeModule,
        entryPoint: 'computeSomething'
      }
    });
  }

  compute() {
    if (this.#requestShaderCompilation) {
      this.createPipeline();
      this.#requestShaderCompilation = false;
    }

    if (
      !this.#pipeline ||
      !this.#bindGroup0 ||
      !this.#bindGroup1 ||
      !this.#bindGroup2 ||
      !this.#bindGroup3 ||
      !this.#canvasSize
    ) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    if (this.#canvasSize.x === 0 || this.#canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    if (samplesInfo.count === 0) {
      this.#tileSequence.resetTile();
      this.#resetSegment.reset();
      this.#haltonSampler.reset();
    }

    let tile = this.#tileSequence.getNextTile(
      /* on new sample / tile start */ () => {
        this.updateCameraSample();
        samplesInfo.increment();
      }
    );
    this.updateTile(tile);

    // work group size in the shader is set to 8,8
    const workGroupsCount = this.#tileSequence.getWorkGroupCount();

    // Encode commands to do the computation
    const encoder = this.#device.createCommandEncoder({
      label: 'compute encoder'
    });
    const passDescriptor = {
      label: 'compute pass'
    };
    this.passPerformance.updateComputePassDescriptor(passDescriptor);
    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.setBindGroup(1, this.#bindGroup1);
    pass.setBindGroup(2, this.#bindGroup2);
    pass.setBindGroup(3, this.#bindGroup3);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    if (this.#tileSequence.isTilePerformanceMeasureable()) {
      this.passPerformance.resolve(encoder);
    }

    encoder.copyBufferToBuffer(
      this.#debugBuffer,
      0,
      this.#debugReadBuffer,
      0,
      this.#debugBuffer.size
    );

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.#device.queue.submit([computeCommandBuffer]);
  }
}
