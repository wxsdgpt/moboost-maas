'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Generative Particle Flow — Three.js + GLSL
 *
 * GPU-accelerated particle system with:
 *  - Simplex-noise driven flow field (computed in vertex shader)
 *  - Cyan → magenta gradient (velocity/depth based)
 *  - Additive blending for natural bloom glow
 *  - Soft circular sprites via fragment shader
 *  - Z-axis depth fog for parallax
 *  - Mouse attraction (Hover state)
 *  - Focus state: particles converge toward a point (the form)
 *  - Loading state: vortex collapse into the screen depth
 *  - Dynamic degradation: if FPS < 30, particle count is halved
 *  - visibilitychange pause
 *
 * All particle motion is computed on the GPU. The CPU only updates
 * a handful of uniforms per frame (time, mouse, focus, loading).
 */

type Props = {
  focused?: boolean
  loading?: boolean
}

export default function ParticleFlow({ focused = false, loading = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(focused)
  const loadingRef = useRef(loading)

  useEffect(() => { focusedRef.current = focused }, [focused])
  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // --- Renderer ------------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x0a0a1a, 1)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.055)

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    )
    camera.position.set(0, 0, 22)

    // --- Particle count (with dynamic degradation) ---------------------------
    const HIGH_COUNT = 12000
    const LOW_COUNT = 5000
    let currentCount = HIGH_COUNT

    // --- Geometry ------------------------------------------------------------
    const buildGeometry = (count: number) => {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(count * 3)
      const seeds = new Float32Array(count)
      const sizes = new Float32Array(count)

      for (let i = 0; i < count; i++) {
        // distribute in a slab around the origin
        positions[i * 3 + 0] = (Math.random() - 0.5) * 60
        positions[i * 3 + 1] = (Math.random() - 0.5) * 40
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40
        seeds[i] = Math.random() * 1000
        sizes[i] = 0.5 + Math.random() * 1.5
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      return geometry
    }

    // --- Shaders -------------------------------------------------------------
    // Simplex noise (Ashima / Stefan Gustavson) — compact 3D version
    const simplex3D = `
      vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
      vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
      float snoise(vec3 v){
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
    `

    const vertexShader = `
      attribute float aSeed;
      attribute float aSize;

      uniform float uTime;
      uniform vec2  uMouse;       // -1..1 screen space
      uniform float uMouseForce;  // 0..1
      uniform float uFocus;       // 0..1 (focused state)
      uniform float uLoading;     // 0..1 (vortex collapse)
      uniform float uPixelRatio;
      uniform float uViewHeight;

      varying float vDepth;
      varying float vSpeed;
      varying float vSeed;

      ${simplex3D}

      // Curl of a noise field -> divergence free flow, looks like fluid
      vec3 curlNoise(vec3 p){
        const float e = 0.1;
        vec3 dx = vec3(e, 0.0, 0.0);
        vec3 dy = vec3(0.0, e, 0.0);
        vec3 dz = vec3(0.0, 0.0, e);

        vec3 p_x0 = vec3(snoise(p - dx), snoise(p - dx + vec3(31.1,17.3,9.7)), snoise(p - dx + vec3(3.7,11.1,47.3)));
        vec3 p_x1 = vec3(snoise(p + dx), snoise(p + dx + vec3(31.1,17.3,9.7)), snoise(p + dx + vec3(3.7,11.1,47.3)));
        vec3 p_y0 = vec3(snoise(p - dy), snoise(p - dy + vec3(31.1,17.3,9.7)), snoise(p - dy + vec3(3.7,11.1,47.3)));
        vec3 p_y1 = vec3(snoise(p + dy), snoise(p + dy + vec3(31.1,17.3,9.7)), snoise(p + dy + vec3(3.7,11.1,47.3)));
        vec3 p_z0 = vec3(snoise(p - dz), snoise(p - dz + vec3(31.1,17.3,9.7)), snoise(p - dz + vec3(3.7,11.1,47.3)));
        vec3 p_z1 = vec3(snoise(p + dz), snoise(p + dz + vec3(31.1,17.3,9.7)), snoise(p + dz + vec3(3.7,11.1,47.3)));

        float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
        float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
        float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);
        return vec3(x, y, z) / (2.0 * e);
      }

      void main() {
        vec3 pos = position;
        float seed = aSeed;
        vSeed = seed;

        // --- 1. Base procedural trajectory (deterministic, loops gently) ---
        float t = uTime * 0.03 + seed * 0.017;
        vec3 base = pos;

        // slow breathing drift along curl-noise field
        vec3 flow = curlNoise(base * 0.045 + vec3(0.0, 0.0, uTime * 0.011));
        base += flow * 4.0;

        // secondary slower swirl for richness
        vec3 flow2 = curlNoise(base * 0.018 - vec3(uTime * 0.007, 0.0, 0.0));
        base += flow2 * 2.5;

        // gentle sinusoidal breathing around origin
        float breath = sin(uTime * 0.13 + seed * 0.9) * 0.6;
        base.xy *= 1.0 + breath * 0.015;

        // --- 2. Mouse attraction (Hover state) ---
        // Project mouse into world space at z=0 plane (approx)
        vec3 mouseWorld = vec3(uMouse.x * 18.0, uMouse.y * 12.0, 0.0);
        vec3 toMouse = mouseWorld - base;
        float mouseDist = length(toMouse);
        float mousePull = exp(-mouseDist * 0.12) * uMouseForce;
        base += normalize(toMouse + vec3(0.0001)) * mousePull * 2.5;

        // --- 3. Focus state: converge toward the center card (behind form) ---
        vec3 focusTarget = vec3(0.0, -1.0, -4.0);
        vec3 toFocus = focusTarget - base;
        base += toFocus * uFocus * 0.25;

        // --- 4. Loading / success: vortex collapse into depth ---
        float ang = uLoading * (2.0 + sin(seed) * 0.5);
        float cs = cos(ang);
        float sn = sin(ang);
        vec2 rotated = vec2(base.x * cs - base.y * sn, base.x * sn + base.y * cs);
        base.xy = mix(base.xy, rotated * (1.0 - uLoading * 0.6), uLoading);
        base.z = mix(base.z, -25.0, uLoading * 0.8);

        // --- Output ---
        vec4 mvPosition = modelViewMatrix * vec4(base, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        vDepth = -mvPosition.z;
        vSpeed = length(flow + flow2 * 0.5);

        // Point size with perspective falloff
        float size = aSize * (120.0 / max(vDepth, 1.0)) * uPixelRatio;
        size *= (1.0 + uFocus * 0.4);
        gl_PointSize = clamp(size, 1.0, 64.0);
      }
    `

    const fragmentShader = `
      precision highp float;
      varying float vDepth;
      varying float vSpeed;
      varying float vSeed;

      uniform float uTime;
      uniform float uLoading;

      void main() {
        // Soft circular sprite
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;

        // Smooth radial falloff for glow
        float core  = smoothstep(0.5, 0.0, d);
        float halo  = smoothstep(0.5, 0.15, d);
        float alpha = pow(core, 2.0) * 0.9 + halo * 0.25;

        // Cyan (#22d3ee ~ vec3(0.13,0.83,0.93)) to Magenta (#d946ef ~ vec3(0.85,0.27,0.94))
        vec3 cyan    = vec3(0.13, 0.83, 0.93);
        vec3 magenta = vec3(0.85, 0.27, 0.94);
        vec3 indigo  = vec3(0.42, 0.33, 0.98);

        // Mix based on a combination of depth, speed and per-particle seed
        float mixT = 0.5
          + 0.35 * sin(vSeed * 0.31 + uTime * 0.2)
          + 0.15 * clamp(vSpeed * 0.4, 0.0, 1.0);
        mixT = clamp(mixT, 0.0, 1.0);

        vec3 col = mix(cyan, magenta, mixT);
        // Shift through indigo in the middle for richer gradient
        col = mix(col, indigo, smoothstep(0.3, 0.7, mixT) * 0.4);

        // Depth attenuation — farther particles fade into the fog
        float depthFade = 1.0 - smoothstep(8.0, 55.0, vDepth);
        alpha *= depthFade;

        // Subtle energy pulse during loading
        col += vec3(0.2, 0.3, 0.5) * uLoading;

        gl_FragColor = vec4(col * (1.2 + uLoading * 0.8), alpha);
      }
    `

    // --- Uniforms ------------------------------------------------------------
    const uniforms = {
      uTime:       { value: 0 },
      uMouse:      { value: new THREE.Vector2(0, 0) },
      uMouseForce: { value: 0 },
      uFocus:      { value: 0 },
      uLoading:    { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uViewHeight: { value: window.innerHeight },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    let geometry = buildGeometry(currentCount)
    let points = new THREE.Points(geometry, material)
    scene.add(points)

    // --- Resize --------------------------------------------------------------
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      uniforms.uViewHeight.value = h
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2)
    }
    resize()
    window.addEventListener('resize', resize)

    // --- Mouse ---------------------------------------------------------------
    const mouseTarget = new THREE.Vector2(0, 0)
    const onMouseMove = (e: MouseEvent) => {
      mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('mousemove', onMouseMove)

    // --- Animation loop ------------------------------------------------------
    let rafId = 0
    let paused = false
    const clock = new THREE.Clock()

    // FPS monitor for dynamic degradation
    let fpsSamples: number[] = []
    let degraded = false
    let lastCheck = performance.now()

    const animate = () => {
      if (paused) return
      const dt = clock.getDelta()
      uniforms.uTime.value += dt

      // Ease mouse
      uniforms.uMouse.value.x += (mouseTarget.x - uniforms.uMouse.value.x) * 0.06
      uniforms.uMouse.value.y += (mouseTarget.y - uniforms.uMouse.value.y) * 0.06
      uniforms.uMouseForce.value += (0.7 - uniforms.uMouseForce.value) * 0.02

      // Ease focus / loading targets
      const focusTarget = focusedRef.current ? 1 : 0
      uniforms.uFocus.value += (focusTarget - uniforms.uFocus.value) * 0.05
      const loadingTarget = loadingRef.current ? 1 : 0
      uniforms.uLoading.value += (loadingTarget - uniforms.uLoading.value) * 0.04

      // Gentle camera parallax
      camera.position.x += (uniforms.uMouse.value.x * 1.2 - camera.position.x) * 0.03
      camera.position.y += (uniforms.uMouse.value.y * 0.8 - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)

      // FPS sample
      if (dt > 0) fpsSamples.push(1 / dt)
      if (fpsSamples.length > 60) fpsSamples.shift()

      const now = performance.now()
      if (!degraded && now - lastCheck > 3000 && fpsSamples.length >= 30) {
        const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length
        if (avg < 30) {
          // Degrade: rebuild with fewer particles
          degraded = true
          currentCount = LOW_COUNT
          scene.remove(points)
          geometry.dispose()
          geometry = buildGeometry(currentCount)
          points = new THREE.Points(geometry, material)
          scene.add(points)
        }
        lastCheck = now
        fpsSamples = []
      }

      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)

    // --- Visibility pause ----------------------------------------------------
    const onVisibility = () => {
      if (document.hidden) {
        paused = true
        cancelAnimationFrame(rafId)
      } else if (paused) {
        paused = false
        clock.getDelta() // reset delta
        rafId = requestAnimationFrame(animate)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // --- Cleanup -------------------------------------------------------------
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibility)
      scene.remove(points)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0, background: '#0a0a1a' }}
      aria-hidden="true"
    />
  )
}
