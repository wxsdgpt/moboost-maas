'use client'

import { useEffect, useRef } from 'react'

/**
 * Generative Particle / Fluid Flow background.
 *
 * A curl-noise-ish flow field pushes thousands of tiny particles along
 * smooth, organic trajectories. Particles leave faint trails that fade
 * over time, evoking the feeling of fluid, smoke, or sand streams —
 * a metaphor for generative AI: order emerging from chaos.
 */
export default function ParticleFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Fill background once so trails can fade against it
      ctx.fillStyle = '#F8FAFB'
      ctx.fillRect(0, 0, width, height)
    }

    resize()
    window.addEventListener('resize', resize)

    // --- Particle system ---
    const PARTICLE_COUNT = Math.floor((width * height) / 2200)  // density scales with screen
    type P = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; hue: number }

    const particles: P[] = []

    const spawn = (p?: P): P => {
      const newP = p || ({} as P)
      newP.x = Math.random() * width
      newP.y = Math.random() * height
      newP.vx = 0
      newP.vy = 0
      newP.maxLife = 100 + Math.random() * 250
      newP.life = newP.maxLife
      // Hue range: emerald (150°) → teal (175°) → a hint of lime (110°)
      newP.hue = 140 + Math.random() * 40
      return newP
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(spawn())

    // --- Flow field ---
    // Smooth curl-noise-ish vector field based on layered trig functions.
    // Evolves slowly over time so the flow morphs organically.
    const fieldScale = 0.0035
    let t = 0

    const flowAngle = (x: number, y: number): number => {
      const nx = x * fieldScale
      const ny = y * fieldScale
      // Two layers of sinusoidal "noise" give turbulent-but-smooth motion
      const a =
        Math.sin(nx * 1.3 + t * 0.15) * 1.4 +
        Math.cos(ny * 1.7 - t * 0.11) * 1.4 +
        Math.sin((nx + ny) * 0.8 + t * 0.07) * 1.0 +
        Math.cos((nx - ny) * 1.1 - t * 0.09) * 0.6
      return a * Math.PI
    }

    // --- Animation loop ---
    const FORCE = 0.08
    const MAX_SPEED = 1.6
    const DAMPING = 0.96

    const tick = () => {
      t += 0.016

      // Fade previous frame to create trailing effect
      ctx.fillStyle = 'rgba(248, 250, 251, 0.055)'
      ctx.fillRect(0, 0, width, height)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        const angle = flowAngle(p.x, p.y)
        p.vx += Math.cos(angle) * FORCE
        p.vy += Math.sin(angle) * FORCE

        // Limit speed
        const sp = Math.hypot(p.vx, p.vy)
        if (sp > MAX_SPEED) {
          p.vx = (p.vx / sp) * MAX_SPEED
          p.vy = (p.vy / sp) * MAX_SPEED
        }
        p.vx *= DAMPING
        p.vy *= DAMPING

        const nx = p.x + p.vx
        const ny = p.y + p.vy

        // Alpha fades in at birth and out at death
        const lifeRatio = p.life / p.maxLife
        const alpha = Math.min(lifeRatio, 1 - lifeRatio) * 2 * 0.55

        ctx.strokeStyle = `hsla(${p.hue}, 70%, 55%, ${alpha})`
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(nx, ny)
        ctx.stroke()

        p.x = nx
        p.y = ny
        p.life--

        // Respawn when dead or drifted off-screen
        if (
          p.life <= 0 ||
          p.x < -20 || p.x > width + 20 ||
          p.y < -20 || p.y > height + 20
        ) {
          spawn(p)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  )
}
