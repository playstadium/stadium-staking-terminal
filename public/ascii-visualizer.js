/**
 * ASCII Visualizer - Vanilla Three.js Implementation
 * Converts the React Three Fiber components to vanilla Three.js
 * for use in the HTML-based terminal project
 */

class AsciiVisualizer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      cellSize: options.cellSize || 4,
      invert: options.invert || false,
      colorMode: options.colorMode !== undefined ? options.colorMode : true,
      asciiStyle: options.asciiStyle || 0,
      postfx: {
        scanlineIntensity: options.postfx?.scanlineIntensity || 0.3,
        scanlineCount: options.postfx?.scanlineCount || 300,
        targetFPS: options.postfx?.targetFPS || 1,
        jitterIntensity: options.postfx?.jitterIntensity || 0.05,
        jitterSpeed: options.postfx?.jitterSpeed || 2,
        mouseGlowEnabled: options.postfx?.mouseGlowEnabled || false,
        mouseGlowRadius: options.postfx?.mouseGlowRadius || 200,
        mouseGlowIntensity: options.postfx?.mouseGlowIntensity || 1.5,
        vignetteIntensity: options.postfx?.vignetteIntensity || 0.4,
        vignetteRadius: options.postfx?.vignetteRadius || 0.7,
        colorPalette: options.postfx?.colorPalette || 0,
        curvature: options.postfx?.curvature || 0.15,
        aberrationStrength: options.postfx?.aberrationStrength || 0.0031,
        noiseIntensity: options.postfx?.noiseIntensity || 0.1,
        noiseScale: options.postfx?.noiseScale || 2,
        noiseSpeed: options.postfx?.noiseSpeed || 1,
        waveAmplitude: options.postfx?.waveAmplitude || 0,
        waveFrequency: options.postfx?.waveFrequency || 1,
        waveSpeed: options.postfx?.waveSpeed || 0.3,
        glitchIntensity: options.postfx?.glitchIntensity || 0,
        glitchFrequency: options.postfx?.glitchFrequency || 0,
        brightnessAdjust: options.postfx?.brightnessAdjust || 0.1,
        contrastAdjust: options.postfx?.contrastAdjust || 1.2,
        ...options.postfx
      }
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.effect = null;
    this.time = 0;
    this.deltaAccumulator = 0;
    this.mousePos = new THREE.Vector2(0, 0);
    this.animationId = null;
    this.isInitialized = false;

    this.init();
  }

  init() {
    if (typeof THREE === 'undefined') {
      console.error('AsciiVisualizer: Three.js is not loaded. Please include Three.js before this script.');
      return;
    }

    if (!this.container) {
      console.error('AsciiVisualizer: Container element not found');
      return;
    }

    console.log('AsciiVisualizer: Initializing...');

    // Check container dimensions
    const rect = this.container.getBoundingClientRect();
    console.log('AsciiVisualizer: Container dimensions:', rect.width, 'x', rect.height);

    // Create canvas container
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.container.innerHTML = '';
    this.container.appendChild(canvas);
    
    // Store canvas reference
    this.canvas = canvas;

    // Setup Three.js scene
    this.scene = new THREE.Scene();
    
    // Get initial dimensions for camera setup
    const initialWidth = rect.width || 800;
    const initialHeight = rect.height || 600;
    const initialAspect = initialWidth / initialHeight;
    
    // Setup camera with correct aspect ratio from the start
    // OrthographicCamera bounds: left, right, top, bottom, near, far
    // For a 2x2 quad, we scale based on aspect ratio
    let left, right, top, bottom;
    if (initialAspect >= 1) {
      // Wider than tall - stretch horizontally
      left = -initialAspect;
      right = initialAspect;
      top = 1;
      bottom = -1;
    } else {
      // Taller than wide - stretch vertically
      left = -1;
      right = 1;
      top = 1 / initialAspect;
      bottom = -1 / initialAspect;
    }
    
    this.camera = new THREE.OrthographicCamera(left, right, top, bottom, 0, 1);
    // Using OrthographicCamera ensures the quad fills the entire canvas
    
    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    this.renderer.setSize(initialWidth, initialHeight, false);
    
    // Update size after a short delay to ensure container is fully rendered
    setTimeout(() => {
      this.updateSize();
    }, 100);

    // Create a fullscreen quad to apply the effect to
    // The quad must match the camera bounds exactly to fill the entire viewport
    // For OrthographicCamera, calculate quad dimensions from camera bounds
    const cameraWidth = right - left;
    const cameraHeight = top - bottom;
    const geometry = new THREE.PlaneGeometry(cameraWidth, cameraHeight);
    const material = new THREE.ShaderMaterial({
      uniforms: this.createUniforms(),
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader()
    });
    
    const quad = new THREE.Mesh(geometry, material);
    quad.position.set(0, 0, 0); // Center at origin, at camera plane
    this.scene.add(quad);
    this.quad = quad; // Store reference
    this.quadGeometry = geometry; // Store for potential updates

    // Setup post-processing with postprocessing library if available
    if (typeof postprocessing !== 'undefined' && postprocessing.EffectComposer) {
      this.setupPostProcessing();
    } else {
      // Fallback: use shader material directly
      this.material = material;
    }

    // Event listeners
    const handleResize = () => {
      // Small delay to ensure DOM has updated
      setTimeout(() => this.updateSize(), 10);
    };
    window.addEventListener('resize', handleResize);
    
    // Also listen for container size changes using ResizeObserver if available
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
    
    this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));

    this.isInitialized = true;
    console.log('AsciiVisualizer: Initialization complete, starting animation');
    this.animate();
  }

  createUniforms() {
    const rect = this.container.getBoundingClientRect();
    return {
      cellSize: { value: this.options.cellSize },
      invert: { value: this.options.invert },
      colorMode: { value: this.options.colorMode },
      asciiStyle: { value: this.options.asciiStyle },
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(rect.width, rect.height) },
      mousePos: { value: new THREE.Vector2(0, 0) },
      scanlineIntensity: { value: this.options.postfx.scanlineIntensity },
      scanlineCount: { value: this.options.postfx.scanlineCount },
      targetFPS: { value: this.options.postfx.targetFPS },
      jitterIntensity: { value: this.options.postfx.jitterIntensity },
      jitterSpeed: { value: this.options.postfx.jitterSpeed },
      mouseGlowEnabled: { value: this.options.postfx.mouseGlowEnabled },
      mouseGlowRadius: { value: this.options.postfx.mouseGlowRadius },
      mouseGlowIntensity: { value: this.options.postfx.mouseGlowIntensity },
      vignetteIntensity: { value: this.options.postfx.vignetteIntensity },
      vignetteRadius: { value: this.options.postfx.vignetteRadius },
      colorPalette: { value: this.options.postfx.colorPalette },
      curvature: { value: this.options.postfx.curvature },
      aberrationStrength: { value: this.options.postfx.aberrationStrength },
      noiseIntensity: { value: this.options.postfx.noiseIntensity },
      noiseScale: { value: this.options.postfx.noiseScale },
      noiseSpeed: { value: this.options.postfx.noiseSpeed },
      waveAmplitude: { value: this.options.postfx.waveAmplitude },
      waveFrequency: { value: this.options.postfx.waveFrequency },
      waveSpeed: { value: this.options.postfx.waveSpeed },
      glitchIntensity: { value: this.options.postfx.glitchIntensity },
      glitchFrequency: { value: this.options.postfx.glitchFrequency },
      brightnessAdjust: { value: this.options.postfx.brightnessAdjust },
      contrastAdjust: { value: this.options.postfx.contrastAdjust },
      // For rendering the stadium image
      uTexture: { value: null },
      uTextureLoaded: { value: false },
      uTextureAspect: { value: 1.0 },
      uCanvasAspect: { value: 1.0 }
    };
  }

  getVertexShader() {
    return `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
  }

  getFragmentShader() {
    return `
      uniform float cellSize;
      uniform bool invert;
      uniform bool colorMode;
      uniform int asciiStyle;
      uniform float time;
      uniform vec2 resolution;
      uniform vec2 mousePos;
      uniform float scanlineIntensity;
      uniform float scanlineCount;
      uniform float targetFPS;
      uniform float jitterIntensity;
      uniform float jitterSpeed;
      uniform bool mouseGlowEnabled;
      uniform float mouseGlowRadius;
      uniform float mouseGlowIntensity;
      uniform float vignetteIntensity;
      uniform float vignetteRadius;
      uniform int colorPalette;
      uniform float curvature;
      uniform float aberrationStrength;
      uniform float noiseIntensity;
      uniform float noiseScale;
      uniform float noiseSpeed;
      uniform float waveAmplitude;
      uniform float waveFrequency;
      uniform float waveSpeed;
      uniform float glitchIntensity;
      uniform float glitchFrequency;
      uniform float brightnessAdjust;
      uniform float contrastAdjust;
      uniform sampler2D uTexture;
      uniform bool uTextureLoaded;
      uniform float uTextureAspect;
      uniform float uCanvasAspect;

      varying vec2 vUv;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      vec3 applyColorPalette(vec3 color, int palette) {
        if (palette == 1) {
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          return vec3(0.1, lum * 0.9, 0.1);
        } else if (palette == 2) {
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          return vec3(lum * 1.0, lum * 0.6, lum * 0.2);
        } else if (palette == 3) {
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          return vec3(0.0, lum * 0.8, lum);
        } else if (palette == 4) {
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          return vec3(0.1, 0.2, lum);
        }
        return color;
      }

      float getChar(float brightness, vec2 p, int style) {
        vec2 grid = floor(p * 4.0);
        float val = 0.0;
        if (style == 0) {
          if (brightness < 0.2) val = (grid.x == 1.0 && grid.y == 1.0) ? 0.3 : 0.0;
          else if (brightness < 0.35) val = (grid.x == 1.0 || grid.x == 2.0) && (grid.y == 1.0 || grid.y == 2.0) ? 1.0 : 0.0;
          else if (brightness < 0.5) val = (grid.y == 1.0 || grid.y == 2.0) ? 1.0 : 0.0;
          else if (brightness < 0.65) val = (grid.y == 0.0 || grid.y == 3.0) ? 1.0 : (grid.y == 1.0 || grid.y == 2.0) ? 0.5 : 0.0;
          else if (brightness < 0.8) val = (grid.x == 0.0 || grid.x == 2.0 || grid.y == 0.0 || grid.y == 2.0) ? 1.0 : 0.3;
          else val = 1.0;
        }
        return val;
      }

      void main() {
        // vUv goes from 0 to 1 across the entire quad
        vec2 uv = vUv;
        
        // Adjust UV to maintain texture aspect ratio while filling the canvas
        // This prevents stretching/squishing in both portrait and landscape orientations
        vec2 workUV = uv;
        
        if (uTextureLoaded && uTextureAspect > 0.0 && uCanvasAspect > 0.0) {
          // Fit texture to canvas while maintaining aspect ratio
          // Use "cover" mode: fill canvas, crop excess to maintain aspect
          
          float canvasAspect = uCanvasAspect;
          float textureAspect = uTextureAspect;
          float ratio = canvasAspect / textureAspect;
          
          if (ratio > 1.0) {
            // Canvas is wider - fill width, crop height (letterbox)
            // Sample more of texture horizontally, less vertically
            workUV.x = uv.x; // Use full width
            workUV.y = (uv.y - 0.5) / ratio + 0.5; // Crop vertically (zoom in)
            workUV.y = clamp(workUV.y, 0.0, 1.0);
          } else {
            // Canvas is taller - fill height, crop width (pillarbox)
            // Sample more of texture vertically, less horizontally  
            workUV.x = (uv.x - 0.5) * ratio + 0.5; // Crop horizontally (zoom in)
            workUV.x = clamp(workUV.x, 0.0, 1.0);
            workUV.y = uv.y; // Use full height
          }
        }

        // Screen curvature
        if (curvature > 0.0) {
          vec2 centered = workUV * 2.0 - 1.0;
          centered *= 1.0 + curvature * dot(centered, centered);
          workUV = centered * 0.5 + 0.5;
          if (workUV.x < 0.0 || workUV.x > 1.0 || workUV.y < 0.0 || workUV.y > 1.0) {
            gl_FragColor = vec4(0.0);
            return;
          }
        }

        // Wave distortion
        if (waveAmplitude > 0.0) {
          workUV.x += sin(workUV.y * waveFrequency + time * waveSpeed) * waveAmplitude;
          workUV.y += cos(workUV.x * waveFrequency + time * waveSpeed) * waveAmplitude;
        }

        // Sample texture
        vec4 sampledColor;
        if (uTextureLoaded && aberrationStrength > 0.0) {
          float offset = aberrationStrength;
          vec2 uvR = workUV + vec2(offset, 0.0);
          vec2 uvG = workUV;
          vec2 uvB = workUV - vec2(offset, 0.0);
          float r = texture2D(uTexture, uvR).r;
          float g = texture2D(uTexture, uvG).g;
          float b = texture2D(uTexture, uvB).b;
          sampledColor = vec4(r, g, b, 1.0);
        } else if (uTextureLoaded) {
          sampledColor = texture2D(uTexture, workUV);
        } else {
          // Fallback: render a gradient pattern
          float pattern = sin(workUV.x * 10.0) * sin(workUV.y * 10.0) * 0.5 + 0.5;
          sampledColor = vec4(pattern * 0.3, pattern * 0.3, pattern * 0.3, 1.0);
        }

        // Contrast and brightness
        sampledColor.rgb = (sampledColor.rgb - 0.5) * contrastAdjust + 0.5 + brightnessAdjust;

        // Time-based noise
        if (noiseIntensity > 0.0) {
          float noiseVal = noise(workUV * noiseScale + time * noiseSpeed);
          sampledColor.rgb += (noiseVal - 0.5) * noiseIntensity;
        }

        // Jitter
        vec2 cellCount = resolution / cellSize;
        vec2 cellCoord = floor(uv * cellCount);
        if (jitterIntensity > 0.0) {
          float jitterTime = time * jitterSpeed;
          float jitterX = (random(vec2(cellCoord.y, floor(jitterTime))) - 0.5) * jitterIntensity * 2.0;
          float jitterY = (random(vec2(cellCoord.x, floor(jitterTime + 1000.0))) - 0.5) * jitterIntensity * 2.0;
          cellCoord += vec2(jitterX, jitterY);
        }

        // RGB Glitch
        if (glitchIntensity > 0.0 && glitchFrequency > 0.0) {
          float glitchTime = floor(time * glitchFrequency);
          float glitchRand = random(vec2(glitchTime, cellCoord.y));
          if (glitchRand < glitchIntensity) {
            float shift = (random(vec2(glitchTime + 1.0, cellCoord.y)) - 0.5) * 20.0;
            cellCoord.x += shift;
          }
        }

        vec2 cellUV = (cellCoord + 0.5) / cellCount;
        vec4 cellColor;
        if (uTextureLoaded) {
          cellColor = texture2D(uTexture, cellUV);
        } else {
          float pattern = sin(cellUV.x * 10.0) * sin(cellUV.y * 10.0) * 0.5 + 0.5;
          cellColor = vec4(pattern * 0.3, pattern * 0.3, pattern * 0.3, 1.0);
        }
        float brightness = dot(cellColor.rgb, vec3(0.299, 0.587, 0.114));
        if (invert) brightness = 1.0 - brightness;

        vec2 localUV = fract(uv * cellCount);
        float charValue = getChar(brightness, localUV, asciiStyle);

        vec3 finalColor;
        if (colorMode) {
          finalColor = cellColor.rgb * charValue;
        } else {
          finalColor = vec3(brightness * charValue);
        }

        // Post-processing
        finalColor = applyColorPalette(finalColor, colorPalette);

        // Mouse glow
        if (mouseGlowEnabled) {
          vec2 pixelPos = uv * resolution;
          float dist = length(pixelPos - mousePos);
          float glow = exp(-dist / mouseGlowRadius) * mouseGlowIntensity;
          finalColor += glow;
        }

        // Scanlines
        if (scanlineIntensity > 0.0) {
          float scanline = sin(uv.y * scanlineCount * 3.14159) * 0.5 + 0.5;
          finalColor *= 1.0 - (scanline * scanlineIntensity);
        }

        // Vignette
        if (vignetteIntensity > 0.0) {
          vec2 centered = uv * 2.0 - 1.0;
          float vignette = 1.0 - dot(centered, centered) / vignetteRadius;
          finalColor *= mix(1.0, vignette, vignetteIntensity);
        }

        gl_FragColor = vec4(finalColor, cellColor.a);
      }
    `;
  }

  setupPostProcessing() {
    // If postprocessing library is available, use it
    // Otherwise, the shader material handles everything
  }

  updateSize() {
    if (!this.renderer || !this.container) return;
    
    // Check if we're in visualizer-only mode (mobile fullscreen) or on mobile
    const isVisualizerOnly = document.body.classList.contains('visualizer-only');
    const isMobile = window.innerWidth <= 768;
    
    let width, height;
    
    if (isVisualizerOnly || (isMobile && this.container.closest('.iso-container')?.classList.contains('visible'))) {
      // Use full viewport dimensions when in visualizer-only mode or mobile
      // Force viewport dimensions to ensure full screen
      width = window.innerWidth;
      height = window.innerHeight;
      
      // Force container to viewport size via inline styles
      if (this.container && this.container.style) {
        this.container.style.width = width + 'px';
        this.container.style.height = height + 'px';
        this.container.style.maxWidth = width + 'px';
        this.container.style.maxHeight = height + 'px';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.right = '0';
        this.container.style.bottom = '0';
      }
      
      // Also force parent iso-container if it exists
      const isoContainer = this.container?.closest('.iso-container');
      if (isoContainer && isoContainer.style) {
        isoContainer.style.width = width + 'px';
        isoContainer.style.height = height + 'px';
        isoContainer.style.maxWidth = width + 'px';
        isoContainer.style.maxHeight = height + 'px';
      }
      
      // Double-check container is actually viewport size
      const containerRect = this.container.getBoundingClientRect();
      if (containerRect.width < width * 0.9 || containerRect.height < height * 0.9) {
        console.warn('AsciiVisualizer: Container size mismatch after forcing. Container:', containerRect.width, 'x', containerRect.height, 'Viewport:', width, 'x', height);
        // Force again after a brief delay
        setTimeout(() => {
          if (this.container && this.container.style) {
            this.container.style.width = window.innerWidth + 'px';
            this.container.style.height = window.innerHeight + 'px';
          }
        }, 10);
      }
      
      console.log('AsciiVisualizer: Using viewport dimensions for mobile/visualizer-only:', width, 'x', height);
    } else {
      // Get container size in CSS pixels
      const rect = this.container.getBoundingClientRect();
      const cssWidth = rect.width || this.container.offsetWidth || 0;
      const cssHeight = rect.height || this.container.offsetHeight || 0;

      // If container has no size, try parent
      width = cssWidth;
      height = cssHeight;
      if (width === 0 || height === 0) {
        const parent = this.container.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          width = parentRect.width || parent.offsetWidth || width;
          height = parentRect.height || parent.offsetHeight || height;
        }
      }

      // Final fallback
      if (width === 0 || width < 100) {
        width = window.innerWidth * 0.6 || 800;
      }
      if (height === 0 || height < 100) {
        height = window.innerHeight || 600;
      }
    }

    // Ensure reasonable minimum
    if (width < 200) width = 200;
    if (height < 200) height = 200;

    // Get device pixel ratio (capped for performance)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    
    // Calculate actual render size (what the canvas will be)
    const renderWidth = Math.round(width * pixelRatio);
    const renderHeight = Math.round(height * pixelRatio);
    
    // Calculate aspect ratio from CSS size (what we see)
    const aspect = width / height;

    console.log('AsciiVisualizer: CSS size:', Math.round(width), 'x', Math.round(height));
    console.log('AsciiVisualizer: Render size:', renderWidth, 'x', renderHeight, '(pixelRatio:', pixelRatio + ')');

    // Update orthographic camera to match CSS aspect ratio
    // The quad is 2x2 units, so we scale the camera bounds to match the aspect
    if (aspect >= 1) {
      // Wider than tall - stretch horizontally
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
    } else {
      // Taller than wide - stretch vertically
      this.camera.left = -1;
      this.camera.right = 1;
      this.camera.top = 1 / aspect;
      this.camera.bottom = -1 / aspect;
    }
    
    this.camera.updateProjectionMatrix();
    
    // Set renderer size to actual pixel dimensions
    this.renderer.setSize(renderWidth, renderHeight, false); // false = don't update CSS
    
    // Update quad geometry to match camera bounds exactly
    // This is critical - the quad must match the camera bounds to fill the entire viewport
    // For OrthographicCamera, the quad should match the camera's left/right and top/bottom bounds
    if (this.quadGeometry && this.quad) {
      // Calculate quad dimensions to match camera bounds
      // Camera bounds: left to right (horizontal), bottom to top (vertical)
      const cameraWidth = this.camera.right - this.camera.left;
      const cameraHeight = this.camera.top - this.camera.bottom;
      
      const newQuadWidth = cameraWidth;  // Match camera horizontal span
      const newQuadHeight = cameraHeight; // Match camera vertical span
      
      // Only update if dimensions have changed significantly (avoid unnecessary updates)
      const currentQuadWidth = this.quadGeometry.parameters?.width || 0;
      const currentQuadHeight = this.quadGeometry.parameters?.height || 0;
      const widthChanged = Math.abs(currentQuadWidth - newQuadWidth) > 0.01;
      const heightChanged = Math.abs(currentQuadHeight - newQuadHeight) > 0.01;
      
      if (widthChanged || heightChanged || !this.quadGeometry.parameters) {
        // Dispose old geometry
        this.quadGeometry.dispose();
        // Create new geometry matching camera bounds exactly
        this.quadGeometry = new THREE.PlaneGeometry(newQuadWidth, newQuadHeight);
        this.quad.geometry = this.quadGeometry;
        
        // Ensure quad is centered at origin (camera is at origin looking down -Z)
        this.quad.position.set(0, 0, 0);
        
        console.log('AsciiVisualizer: Quad geometry updated - width:', newQuadWidth.toFixed(3), 'height:', newQuadHeight.toFixed(3), '(matches camera bounds)');
      }
    } else if (!this.quadGeometry || !this.quad) {
      // Recreate quad if it doesn't exist (shouldn't happen, but safety check)
      console.warn('AsciiVisualizer: Quad or geometry missing, recreating...');
      const cameraWidth = this.camera.right - this.camera.left;
      const cameraHeight = this.camera.top - this.camera.bottom;
      this.quadGeometry = new THREE.PlaneGeometry(cameraWidth, cameraHeight);
      if (this.material) {
        this.quad = new THREE.Mesh(this.quadGeometry, this.material);
        this.quad.position.set(0, 0, 0);
        this.scene.add(this.quad);
      }
    }
    
    const quadWidth = this.quadGeometry?.parameters?.width || (this.camera.right - this.camera.left);
    const quadHeight = this.quadGeometry?.parameters?.height || (this.camera.top - this.camera.bottom);
    console.log('AsciiVisualizer: Camera bounds - left:', this.camera.left.toFixed(3), 'right:', this.camera.right.toFixed(3), 'top:', this.camera.top.toFixed(3), 'bottom:', this.camera.bottom.toFixed(3));
    console.log('AsciiVisualizer: Quad size - width:', quadWidth.toFixed(3), 'height:', quadHeight.toFixed(3), '(aspect:', aspect.toFixed(3) + ')');

    if (this.material && this.material.uniforms) {
      // Use CSS dimensions for resolution uniform (for shader calculations)
      this.material.uniforms.resolution.value.set(width, height);
      // Update canvas aspect ratio
      this.material.uniforms.uCanvasAspect.value = aspect;
    }
  }

  handleMouseMove(event) {
    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = rect.height - (event.clientY - rect.top);
    this.mousePos.set(x, y);

    if (this.material && this.material.uniforms) {
      this.material.uniforms.mousePos.value.set(x, y);
    }
  }

  loadTexture(url) {
    if (!url) {
      console.warn('AsciiVisualizer: No texture URL provided');
      return;
    }
    
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        console.log('AsciiVisualizer: Texture loaded successfully');
        console.log('AsciiVisualizer: Texture dimensions:', texture.image.width, 'x', texture.image.height);
        
        // Use ClampToEdge to prevent tiling, we'll handle aspect ratio in shader
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Calculate aspect ratios for shader
        const textureAspect = texture.image.width / texture.image.height;
        const size = new THREE.Vector2();
        const canvasAspect = this.renderer ? 
          (this.renderer.getSize(size).x / this.renderer.getSize(size).y) : 
          textureAspect;
        
        console.log('AsciiVisualizer: Texture aspect:', textureAspect, 'Canvas aspect:', canvasAspect);
        
        if (this.material && this.material.uniforms) {
          this.material.uniforms.uTexture.value = texture;
          this.material.uniforms.uTextureLoaded.value = true;
          this.material.uniforms.uTextureAspect.value = textureAspect;
          this.material.uniforms.uCanvasAspect.value = canvasAspect;
        }
      },
      undefined,
      (error) => {
        console.error('AsciiVisualizer: Error loading texture:', error);
      }
    );
  }

  animate() {
    if (!this.isInitialized) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    const targetFPS = this.options.postfx.targetFPS;
    const deltaTime = 0.016; // Approximate 60fps

    if (targetFPS > 0) {
      const frameDuration = 1 / targetFPS;
      this.deltaAccumulator += deltaTime;
      if (this.deltaAccumulator >= frameDuration) {
        this.time += frameDuration;
        this.deltaAccumulator = this.deltaAccumulator % frameDuration;
      }
    } else {
      this.time += deltaTime;
    }

    if (this.material && this.material.uniforms) {
      this.material.uniforms.time.value = this.time;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    window.removeEventListener('resize', this.updateSize);
  }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
  window.AsciiVisualizer = AsciiVisualizer;
}

