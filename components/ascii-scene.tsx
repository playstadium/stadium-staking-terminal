"use client"

import { useState, useEffect, useRef } from "react"

import { Canvas } from "@react-three/fiber"

import { EffectComposer } from "@react-three/postprocessing"

import { OrbitControls } from "@react-three/drei"

import { Vector2 } from "three"

import { AsciiEffect } from "./ascii-effect"

export function AsciiScene() {

  const containerRef = useRef<HTMLDivElement>(null)

  const [mousePos, setMousePos] = useState(new Vector2(0, 0))

  const [resolution, setResolution] = useState(new Vector2(1920, 1080))

  // Track mouse position for glow effect

  useEffect(() => {

    const handleMouseMove = (e: MouseEvent) => {

      if (containerRef.current) {

        const rect = containerRef.current.getBoundingClientRect()

        const x = e.clientX - rect.left

        // Flip Y coordinate to match shader UV space (bottom-up instead of top-down)

        const y = rect.height - (e.clientY - rect.top)

        setMousePos(new Vector2(x, y))

      }

    }

    const container = containerRef.current

    if (container) {

      container.addEventListener("mousemove", handleMouseMove)

      // Set initial resolution

      const rect = container.getBoundingClientRect()

      setResolution(new Vector2(rect.width, rect.height))

      // Update resolution on resize

      const handleResize = () => {

        const rect = container.getBoundingClientRect()

        setResolution(new Vector2(rect.width, rect.height))

      }

      window.addEventListener("resize", handleResize)

      return () => {

        container.removeEventListener("mousemove", handleMouseMove)

        window.removeEventListener("resize", handleResize)

      }

    }

  }, [])

  return (

    <div ref={containerRef} style={{ width: "100%", height: "100vh" }}>

      <Canvas

        camera={{ position: [0, 0, 5], fov: 50 }}

        style={{ background: "#000000" }}

      >

        <color attach="background" args={["#000000"]} />

        

        {/* ASCII Effect with PostFX */}

        <EffectComposer>

          <AsciiEffect

            style="minimal"

            cellSize={4}

            invert={false}

            color={true}

            resolution={resolution}

            mousePos={mousePos}

            postfx={{

              scanlineIntensity: 0.3,

              scanlineCount: 300,

              targetFPS: 1,

              jitterIntensity: 0.05,

              jitterSpeed: 2,

              mouseGlowEnabled: false,

              mouseGlowRadius: 200,

              mouseGlowIntensity: 1.5,

              vignetteIntensity: 0.4,

              vignetteRadius: 0.7,

              colorPalette: 0,

              curvature: 0.15,

              aberrationStrength: 0.0031,

              noiseIntensity: 0.1,

              noiseScale: 2,

              noiseSpeed: 1,

              waveAmplitude: 0,

              waveFrequency: 1,

              waveSpeed: 0.3,

              glitchIntensity: 0,

              glitchFrequency: 0,

              brightnessAdjust: 0.1,

              contrastAdjust: 1.2,

            }}

          />

        </EffectComposer>

      </Canvas>

    </div>

  )

}

