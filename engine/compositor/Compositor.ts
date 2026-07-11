import * as THREE from 'three';
import type { FrameContext, RenderMode } from '../types';
import { TransitionSystem } from '../transitions/TransitionSystem';

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uSource;
  uniform vec2 uSourceSize;
  uniform vec2 uOutputSize;
  uniform vec4 uTransformPath[24];
  uniform vec2 uPivotPath[24];
  uniform vec4 uVelocity;
  uniform float uSamples;
  uniform float uGlow;
  uniform float uChromatic;
  uniform float uGrain;
  uniform float uSharpen;
  uniform float uFrame;
  uniform vec3 uBridgeColor;
  uniform float uBridgeAlpha;
  varying vec2 vUv;
  const float PI = 3.14159265359;

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
  vec2 sourceUv(vec2 uv, int sampleIndex) {
    vec4 transform = uTransformPath[sampleIndex];
    vec2 pivot = uPivotPath[sampleIndex];
    vec2 p = uv - pivot;
    float c = cos(radians(transform.w)); float s = sin(radians(transform.w));
    p = mat2(c, -s, s, c) * p;
    p = p / max(transform.x, 0.001) + vec2(transform.y, transform.z);
    float sourceAspect = uSourceSize.x / uSourceSize.y;
    float outputAspect = uOutputSize.x / uOutputSize.y;
    if (sourceAspect > outputAspect) p.x *= outputAspect / sourceAspect;
    else p.y *= sourceAspect / outputAspect;
    return p + pivot;
  }
  vec3 sampleSource(vec2 uv, int sampleIndex) {
    vec2 coord = sourceUv(uv, sampleIndex);
    vec2 ca = vec2(uVelocity.x, -uVelocity.y) * uChromatic * 0.11;
    return vec3(texture2D(uSource, coord + ca).r, texture2D(uSource, coord).g, texture2D(uSource, coord - ca).b);
  }
  void main() {
    vec3 color = vec3(0.0); float weight = 0.0;
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      if (fi >= uSamples) break;
      int sampleIndex = int(fi);
      float t = uSamples <= 1.0 ? 0.0 : fi / (uSamples - 1.0) - 0.5;
      float w = 1.0 - abs(t) * 1.2;
      color += sampleSource(vUv, sampleIndex) * w;
      weight += w;
    }
    color /= max(weight, 0.0001);
    float glowMask = smoothstep(0.82, 0.98, luma(color)) * smoothstep(0.08, 0.35, max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b));
    color += color * glowMask * uGlow;
    vec2 texel = 1.0 / uOutputSize;
    int centerIndex = int(max(0.0, floor((uSamples - 1.0) * 0.5)));
    vec3 blur = (sampleSource(vUv + vec2(texel.x, 0.0), centerIndex) + sampleSource(vUv - vec2(texel.x, 0.0), centerIndex) + sampleSource(vUv + vec2(0.0, texel.y), centerIndex) + sampleSource(vUv - vec2(0.0, texel.y), centerIndex)) * 0.25;
    color += (color - blur) * uSharpen;
    color += (hash(vUv * uOutputSize) - 0.5) * uGrain;
    color = mix(color, uBridgeColor, uBridgeAlpha);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class Compositor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly textures = new Map<string, THREE.VideoTexture>();
  private readonly material: THREE.ShaderMaterial;
  private readonly transition = new TransitionSystem();

  public constructor(canvas: HTMLCanvasElement, preparedVideos: ReadonlyMap<string, HTMLVideoElement>, mode: RenderMode) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(mode.width, mode.height, false);
    canvas.width = mode.width; canvas.height = mode.height;
    for (const [shotId, video] of preparedVideos) {
      const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; this.textures.set(shotId, texture);
    }
    const firstTexture = this.textures.values().next().value as THREE.VideoTexture | undefined;
    if (!firstTexture) throw new Error('No prepared source videos are available.');
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
      uSource: { value: firstTexture }, uSourceSize: { value: new THREE.Vector2(720, 1280) }, uOutputSize: { value: new THREE.Vector2(mode.width, mode.height) },
      uTransformPath: { value: Array.from({ length: 24 }, () => new THREE.Vector4(1, 0, 0, 0)) }, uPivotPath: { value: Array.from({ length: 24 }, () => new THREE.Vector2(0.5, 0.5)) }, uVelocity: { value: new THREE.Vector4() }, uSamples: { value: mode.blurSamples },
      uGlow: { value: 0 }, uChromatic: { value: 0 }, uGrain: { value: 0 }, uSharpen: { value: 0 }, uFrame: { value: 0 },
      uBridgeColor: { value: new THREE.Color(0, 0, 0) }, uBridgeAlpha: { value: 0 },
    } });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  public render(frame: FrameContext, mode: RenderMode): void {
    const { transform, velocity, postFX } = frame;
    const texture = this.textures.get(frame.shot.id);
    if (!texture) throw new Error(`Prepared source is missing for ${frame.shot.id}.`);
    this.material.uniforms.uSource!.value = texture;
    this.material.uniforms.uSourceSize!.value.set(frame.source.width, frame.source.height);
    for (let index = 0; index < 24; index += 1) {
      const path = frame.transformPath[Math.min(index, frame.transformPath.length - 1)] ?? transform;
      this.material.uniforms.uTransformPath!.value[index].set(path.scale, path.x, path.y, path.rotation);
      this.material.uniforms.uPivotPath!.value[index].set(path.pivotX, path.pivotY);
    }
    this.material.uniforms.uVelocity!.value.set(velocity.x, velocity.y, velocity.zoom, velocity.rotation);
    const transitionBoost = this.transition.blurBoost(frame.transition);
    this.material.uniforms.uSamples!.value = transitionBoost > 0 ? Math.max(frame.blur.samples, Math.min(mode.blurSamples, Math.ceil(frame.blur.samples + transitionBoost * (mode.blurSamples - frame.blur.samples)))) : frame.blur.samples;
    this.material.uniforms.uGlow!.value = mode.postFX === 'full' ? postFX.glow : postFX.glow * 0.4;
    this.material.uniforms.uChromatic!.value = postFX.chromatic;
    this.material.uniforms.uGrain!.value = mode.postFX === 'full' ? postFX.grain : 0;
    this.material.uniforms.uSharpen!.value = postFX.sharpen;
    this.material.uniforms.uFrame!.value = frame.frameIndex;
    this.material.uniforms.uBridgeColor!.value.setRGB(...this.transition.bridgeColor(frame.transition));
    this.material.uniforms.uBridgeAlpha!.value = frame.transition.colorBridgeAlpha;
    // HyperFrames patches texImage2D/texSubImage2D so a texture upload sourced from this
    // <video> element transparently substitutes its injected, frame-exact still image during
    // capture (see HyperFramesAdapter for the verified source paths). needsUpdate must stay
    // true so THREE re-issues that upload call on every render, not just the first.
    texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void { this.textures.forEach((texture) => texture.dispose()); this.material.dispose(); this.renderer.dispose(); }
}
