'use client'

/**
 * LoginGlobe — Three.js sphere→globe morphing animation for auth pages.
 *
 * Stages (driven by parent via `stage` prop):
 *   0 IDLE       — wireframe icosahedron, slow rotation, particle ring
 *   1 EMAIL      — lat/lon grid lines fade in
 *   2 PASSWORD   — continent outlines + scatter particles + atmosphere
 *   3 LOADING    — connection arcs between cities, camera pushes in
 *   4 SUCCESS    — full glow, camera rush
 *
 * Design language: admoboost.com — #0a0a0a dark, #c0e463 acid green,
 * wireframe aesthetic, additive blending particle effects.
 */

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

// ─── Public stage constants ───
export const GLOBE_STAGE = {
  IDLE: 0,
  EMAIL: 1,
  PASSWORD: 2,
  LOADING: 3,
  SUCCESS: 4,
} as const

export type GlobeStage = (typeof GLOBE_STAGE)[keyof typeof GLOBE_STAGE]

interface Props {
  stage: GlobeStage
  className?: string
  style?: React.CSSProperties
}

// ─── Continent coordinate data (simplified outlines) ───
const CONTINENTS: [number, number][][] = [
  // North America
  [[-130,55],[-120,60],[-100,65],[-80,60],[-60,45],[-75,30],[-90,25],[-100,20],[-105,25],[-120,35],[-125,45],[-130,55]],
  // South America
  [[-80,10],[-65,10],[-50,0],[-40,-10],[-35,-20],[-40,-30],[-50,-35],[-60,-45],[-70,-50],[-75,-40],[-70,-25],[-75,-15],[-80,0],[-80,10]],
  // Europe
  [[-10,40],[0,48],[10,55],[20,60],[30,65],[35,60],[30,50],[25,40],[15,38],[5,44],[-10,40]],
  // Africa
  [[-15,15],[0,30],[10,35],[15,30],[30,30],[35,25],[40,15],[45,5],[40,-5],[35,-20],[30,-30],[20,-35],[15,-30],[10,-20],[5,-5],[0,5],[-10,5],[-15,15]],
  // Asia
  [[30,35],[45,40],[60,45],[70,55],[80,60],[100,65],[120,60],[130,55],[140,50],[140,40],[130,30],[120,25],[110,20],[100,15],[90,20],[80,25],[70,30],[60,30],[45,30],[30,35]],
  // Australia
  [[115,-15],[125,-15],[135,-20],[140,-25],[145,-30],[140,-35],[135,-35],[125,-30],[115,-30],[113,-25],[115,-15]],
]

const CITIES: [number, number][] = [
  [40.7, -74.0],   // New York
  [51.5, -0.1],    // London
  [35.7, 139.7],   // Tokyo
  [-33.9, 151.2],  // Sydney
  [-23.5, -46.6],  // São Paulo
  [1.3, 103.8],    // Singapore
  [55.8, 37.6],    // Moscow
  [28.6, 77.2],    // Delhi
]

const CONNECTIONS: [number, number][] = [
  [0, 1], [0, 4], [1, 6], [1, 2], [2, 5], [5, 7], [3, 5], [6, 7],
]

// ─── Helpers ───
function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  )
}

function makeRadialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,.3)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

// ─── Component ───
export default function LoginGlobe({ stage, className, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<GlobeStage>(stage)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Keep stage ref current
  useEffect(() => { stageRef.current = stage }, [stage])

  const initScene = useCallback((container: HTMLDivElement) => {
    const ACCENT = new THREE.Color(0xc0e463)
    const VIOLET = new THREE.Color(0xdc8ffb)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    camera.position.set(0, 0, 12)

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.6)
    keyLight.position.set(5, 6, 8)
    scene.add(keyLight)
    const rimLight = new THREE.PointLight(ACCENT, 1.2, 25)
    rimLight.position.set(-5, 2, 4)
    scene.add(rimLight)
    const fillLight = new THREE.PointLight(VIOLET, 0.3, 20)
    fillLight.position.set(4, -3, -3)
    scene.add(fillLight)

    const world = new THREE.Group()
    scene.add(world)

    // ── Layer 1: Wireframe icosahedron ──
    const wireframe = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.9, 1)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7 }),
    )
    world.add(wireframe)

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x0c0c0b, metalness: 0.3, roughness: 0.3,
        clearcoat: 1, transmission: 0.15, thickness: 0.5,
      }),
    )
    world.add(core)

    // ── Layer 2: Lat/lon grid ──
    const gridGroup = new THREE.Group()
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = []
      for (let lon = -180; lon <= 180; lon += 5) pts.push(latLonToVec3(lat, lon, 2.55))
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      gridGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0,
      })))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = []
      for (let lat = -90; lat <= 90; lat += 5) pts.push(latLonToVec3(lat, lon, 2.55))
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      gridGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0,
      })))
    }
    world.add(gridGroup)

    // ── Layer 3: Continent outlines ──
    const continentGroup = new THREE.Group()
    CONTINENTS.forEach(coords => {
      const pts = coords.map(c => latLonToVec3(c[1], c[0], 2.58))
      pts.push(pts[0])
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      continentGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
      })))
    })
    world.add(continentGroup)

    // Continent scatter particles
    const scatterPts: THREE.Vector3[] = []
    CONTINENTS.forEach(coords => {
      for (let i = 0; i < 80; i++) {
        const idx = Math.floor(Math.random() * coords.length)
        const idx2 = (idx + 1) % coords.length
        const t = Math.random()
        const lon = coords[idx][0] + (coords[idx2][0] - coords[idx][0]) * t + (Math.random() - 0.5) * 8
        const lat = coords[idx][1] + (coords[idx2][1] - coords[idx][1]) * t + (Math.random() - 0.5) * 8
        scatterPts.push(latLonToVec3(lat, lon, 2.56 + Math.random() * 0.04))
      }
    })
    const continentDots = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(scatterPts),
      new THREE.PointsMaterial({
        color: ACCENT, size: 0.03, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    world.add(continentDots)

    // ── Layer 4: Atmosphere ──
    const atmosMat = new THREE.MeshPhysicalMaterial({
      color: 0x4488ff, metalness: 0, roughness: 1,
      transparent: true, opacity: 0, side: THREE.FrontSide,
    })
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.7, 32, 32), atmosMat)
    world.add(atmosphere)

    // ── Layer 5: Connection arcs ──
    const arcGroup = new THREE.Group()
    CONNECTIONS.forEach(([ci, cj]) => {
      const start = latLonToVec3(CITIES[ci][0], CITIES[ci][1], 2.58)
      const end = latLonToVec3(CITIES[cj][0], CITIES[cj][1], 2.58)
      const mid = start.clone().add(end).multiplyScalar(0.5)
      mid.normalize().multiplyScalar(3.5)
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
      const pts = curve.getPoints(30)
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      arcGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending,
      })))
    })
    CITIES.forEach(c => {
      const pos = latLonToVec3(c[0], c[1], 2.62)
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 }),
      )
      dot.position.copy(pos)
      arcGroup.add(dot)
    })
    world.add(arcGroup)

    // ── Layer 6: Particle ring ──
    const RING_N = 600
    const ringPos = new Float32Array(RING_N * 3)
    for (let i = 0; i < RING_N; i++) {
      const t = Math.random() * Math.PI * 2
      const r = 3.8 + Math.random() * 0.8
      ringPos[i * 3] = Math.cos(t) * r
      ringPos[i * 3 + 1] = (Math.random() - 0.5) * 0.3
      ringPos[i * 3 + 2] = Math.sin(t) * r
    }
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3))
    const ring = new THREE.Points(ringGeo, new THREE.PointsMaterial({
      color: ACCENT, size: 0.035, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    ring.rotation.x = Math.PI / 4
    world.add(ring)

    // Halo
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTexture(), color: ACCENT, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3,
    }))
    halo.scale.set(9, 9, 1)
    world.add(halo)

    // ── Pointer parallax ──
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    let cameraZTarget = 12
    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / innerWidth - 0.5) * 2
      pointer.ty = (e.clientY / innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointerMove)

    // ── Resize ──
    const onResize = () => {
      const rect = container.getBoundingClientRect()
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
      renderer.setSize(rect.width, rect.height)
    }
    onResize()
    window.addEventListener('resize', onResize)

    // ── Lerp helper ──
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // ── Animation loop ──
    const clock = new THREE.Clock()
    let frameId = 0

    function animate() {
      frameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const s = stageRef.current

      // Pointer
      pointer.x = lerp(pointer.x, pointer.tx, 0.04)
      pointer.y = lerp(pointer.y, pointer.ty, 0.04)

      // Camera Z
      cameraZTarget = s >= 4 ? 5 : s >= 3 ? 8 : 12
      camera.position.z = lerp(camera.position.z, cameraZTarget, 0.025)
      camera.position.x = pointer.x * 0.8
      camera.position.y = -pointer.y * 0.5
      camera.lookAt(0, 0, 0)

      // World rotation
      world.rotation.y += 0.002
      world.rotation.x = pointer.y * 0.1

      // ── Visibility by stage ──
      // Wireframe
      wireframe.rotation.y = t * 0.25
      wireframe.rotation.x = t * 0.15
      const wOp = s === 0 ? 0.7 : s === 1 ? 0.4 : s === 2 ? 0.2 : 0.08
      wireframe.material.opacity = lerp(wireframe.material.opacity, wOp, 0.04)

      // Core
      core.rotation.y = t * 0.2
      core.rotation.x = t * 0.12

      // Grid
      const gridOp = s >= 1 ? 0.25 : 0
      gridGroup.children.forEach(c => {
        if ((c as THREE.Line).material) {
          const mat = (c as THREE.Line).material as THREE.LineBasicMaterial
          mat.opacity = lerp(mat.opacity, gridOp, 0.03)
        }
      })
      gridGroup.rotation.y = t * 0.15

      // Continents
      const contOp = s >= 2 ? 0.7 : 0
      continentGroup.children.forEach(c => {
        const mat = (c as THREE.Line).material as THREE.LineBasicMaterial
        mat.opacity = lerp(mat.opacity, contOp, 0.03)
      })
      continentGroup.rotation.y = t * 0.15

      // Continent dots
      const dotOp = s >= 2 ? 0.6 : 0;
      (continentDots.material as THREE.PointsMaterial).opacity =
        lerp((continentDots.material as THREE.PointsMaterial).opacity, dotOp, 0.03)
      continentDots.rotation.y = t * 0.15

      // Atmosphere
      atmosMat.opacity = lerp(atmosMat.opacity, s >= 2 ? 0.06 : 0, 0.02)
      atmosphere.rotation.y = t * 0.1

      // Arcs
      const arcOp = s >= 3 ? 0.6 : 0
      arcGroup.children.forEach(c => {
        if ((c as any).material) {
          (c as any).material.opacity = lerp((c as any).material.opacity, arcOp, 0.03)
        }
      })
      arcGroup.rotation.y = t * 0.15

      // Ring
      const ringOp = s >= 3 ? 0.8 : 0.35;
      (ring.material as THREE.PointsMaterial).opacity =
        lerp((ring.material as THREE.PointsMaterial).opacity, ringOp, 0.03)
      ring.rotation.y = t * 0.25
      ring.rotation.z = Math.sin(t * 0.2) * 0.3

      // Halo
      const haloBase = s >= 3 ? 0.55 : s >= 2 ? 0.4 : 0.25
      halo.material.opacity = haloBase * (0.8 + 0.2 * Math.sin(t * 1.8))

      // Rim light
      rimLight.intensity = s >= 3 ? 2.0 : s >= 2 ? 1.5 : 1.0

      renderer.render(scene, camera)
    }
    animate()

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    cleanupRef.current = initScene(el)
    return () => { cleanupRef.current?.() }
  }, [initScene])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  )
}
