"use strict";
// Optional optical glass layer. Lite never starts this renderer.
window.GlassRenderer = (() => {
  let dispose = null;
  function stop() { const cleanup = dispose; dispose = null; if (cleanup) cleanup(); }
  function start() {

    if (dispose || !document.body.classList.contains("theme-glass")) return;
    const app = document.getElementById("app");
    const video = document.getElementById("camera");
    const reduced = matchMedia("(prefers-reduced-transparency: reduce)");
    if (reduced.matches) return;
    const selector = ".panel, .sentence-card, .option-card";
    const gpu = document.createElement("canvas");
    const gl = gpu.getContext("webgl", { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) return;

    const vertex = `attribute vec2 position; varying vec2 uv;
      void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;
    const fragment = `precision highp float;
      varying vec2 uv;
      uniform sampler2D scene;
      uniform vec2 sceneSize;
      uniform vec4 panel;
      uniform float radius;
      uniform vec3 feedback;
      vec3 sampleScene(vec2 point) {
        return texture2D(scene, clamp(point / sceneSize, vec2(.001), vec2(.999))).rgb;
      }
      void main() {
        // Work in CSS pixels, with a top-left origin matching DOM rectangles.
        vec2 local = vec2(uv.x, 1. - uv.y) * panel.zw;
        vec2 p = local - panel.zw * .5;
        vec2 q = abs(p) - (panel.zw * .5 - radius);
        float distance = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
        if (distance > 0.) { gl_FragColor = vec4(0.); return; }
        vec2 normal;
        if (max(q.x, q.y) > 0.) normal = normalize(max(q, .0001)) * sign(p);
        else normal = q.x > q.y ? vec2(sign(p.x), 0.) : vec2(0., sign(p.y));
        // The linked CodePen's sixth-power rounded lens is fitted to each card.
        vec2 lensCoord = p / max(panel.zw * .5 - vec2(radius * .28), vec2(1.));
        float roundedBox = pow(abs(lensCoord.x), 6.) + pow(abs(lensCoord.y), 6.);
        float lensBody = clamp(1. - roundedBox * .72, 0., 1.);
        float edgeWidth = min(28., min(panel.z, panel.w) * .22);
        float edge = 1. - smoothstep(0., edgeWidth, -distance);
        // A broad central magnification and a stronger curved bevel produce
        // the CodePen lens movement while keeping text on top of the canvas.
        vec2 bend = -p * (.045 * lensBody) + normal * edge * 13.;
        vec2 point = panel.xy + local + bend;
        vec3 colour = sampleScene(point) * .32;
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            colour += sampleScene(point + vec2(float(x), float(y)) * 1.7) * (.68 / 9.);
          }
        }
        float innerBand = exp(-pow((-distance - 5.) / 3.5, 2.));
        float outerBand = exp(-pow((-distance - 1.) / 1.6, 2.));
        float gradient = .08 + .17 * clamp(.5 - p.y / max(panel.w, 1.), 0., 1.);
        float light = .25 + .75 * pow(max(0., dot(normal, normalize(vec2(-.65, -.76)))), 3.);
        colour = mix(colour, vec3(.035, .085, .14), .12) + feedback;
        colour += outerBand * light * .34 + innerBand * gradient;
        gl_FragColor = vec4(colour, 1.);
      }`;
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (error) {
      console.warn("Glass optics unavailable; using translucent material.", error);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const uniforms = Object.fromEntries(["scene", "sceneSize", "panel", "radius", "feedback"].map(key => [key, gl.getUniformLocation(program, key)]));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.scene, 0);

    const scene = document.createElement("canvas");
    scene.className = "glass-scene";
    scene.setAttribute("aria-hidden", "true");
    app.prepend(scene);
    const ctx = scene.getContext("2d", { alpha: false });
    const surfaces = new Map();
    let pending = false, stopped = false, lastFrame = 0, renderFrame = null;
    let videoFrame = null, videoTimer = null;

    function glow(width, height, x, y, rx, ry, colour) {
      ctx.save();
      ctx.translate(width * x, height * y);
      ctx.scale(width * rx, height * ry);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, colour);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
    function drawScene(width, height, cameraLive) {
      ctx.fillStyle = "#102e49";
      ctx.fillRect(0, 0, width, height);
      if (cameraLive) {
        const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
        const vw = video.videoWidth * scale, vh = video.videoHeight * scale;
        ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, (width - vw) / 2, (height - vh) / 2, vw, vh);
        ctx.restore();
        const veil = ctx.createLinearGradient(0, 0, 0, height);
        veil.addColorStop(0, "rgba(4,14,28,.42)");
        veil.addColorStop(.35, "rgba(4,14,28,.12)");
        veil.addColorStop(1, "rgba(4,14,28,.5)");
        ctx.fillStyle = veil; ctx.fillRect(0, 0, width, height);
        return;
      }
      glow(width, height, .14, .8, .64, .85, "#248e9a");
      glow(width, height, .88, .16, .65, .85, "#787ab3");
      glow(width, height, .62, 1, .75, .8, "#32567d");
      // Wallpaper contours pass continuously behind the panels, making the
      // change in direction and magnification through the bevel visible.
      ctx.save();
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(width * (.14 + i * .05), height * .37, width * (.59 + i * .075), height * .81, -.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(207,249,255,${.23 - i * .055})`;
        ctx.stroke();
      }
      ctx.restore();
      const veil = ctx.createLinearGradient(0, 0, width, height);
      veil.addColorStop(0, "rgba(7,20,40,.12)"); veil.addColorStop(1, "rgba(4,18,34,.26)");
      ctx.fillStyle = veil; ctx.fillRect(0, 0, width, height);
    }

    function fallback() { if (!stopped) stop(); }
    const onContextLost = event => { event.preventDefault(); fallback(); };
    const onReducedChange = event => { if (event.matches) fallback(); };
    gpu.addEventListener("webglcontextlost", onContextLost);
    reduced.addEventListener("change", onReducedChange);

    function render() {
      pending = false;
      renderFrame = null;
      if (stopped || document.hidden || !document.body.classList.contains("theme-glass")) return;
      try {
        const bounds = app.getBoundingClientRect();
        const width = bounds.width, height = bounds.height;
        if (!width || !height) return;
        const scale = Math.min(1, 1600 / Math.max(width, height));
        const sw = Math.round(width * scale), sh = Math.round(height * scale);
        if (scene.width !== sw || scene.height !== sh) { scene.width = sw; scene.height = sh; }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const cameraLive = document.body.classList.contains("camera-on") && video.readyState >= 2 && video.videoWidth > 0;
        drawScene(width, height, cameraLive);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        gl.uniform2f(uniforms.sceneSize, width, height);
        document.querySelectorAll(selector).forEach(host => {
          const rect = host.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
          let surface = surfaces.get(host);
          if (!surface) {
            const canvas = document.createElement("canvas");
            canvas.className = "glass-surface";
            canvas.setAttribute("aria-hidden", "true");
            surface = { canvas, ctx: canvas.getContext("2d") };
            surfaces.set(host, surface);
            host.prepend(canvas);
            host.classList.add("has-refraction");
          }
          const w = Math.round(rect.width * scale), h = Math.round(rect.height * scale);
          if (gpu.width !== w || gpu.height !== h) { gpu.width = w; gpu.height = h; }
          gl.viewport(0, 0, w, h);
          gl.uniform4f(uniforms.panel, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
          const radius = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 28;
          gl.uniform1f(uniforms.radius, Math.min(radius, rect.width / 2, rect.height / 2));
          const good = host.classList.contains("good"), bad = host.classList.contains("bad");
          gl.uniform3f(uniforms.feedback, bad ? .22 : 0, good ? .18 : 0, 0);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (surface.canvas.width !== w || surface.canvas.height !== h) { surface.canvas.width = w; surface.canvas.height = h; }
          surface.ctx.clearRect(0, 0, w, h);
          surface.ctx.drawImage(gpu, 0, 0);
        });
      } catch (error) {
        console.warn("Glass optics stopped; using translucent material.", error);
        fallback();
      }
    }
    function schedule() {
      if (!pending && !stopped) { pending = true; renderFrame = requestAnimationFrame(render); }
    }
    // Static scenes have no running frame loop. Only live camera refraction paints
    // repeatedly; switching to Lite cancels callbacks and releases the GPU context.
    function cameraLive() {
      return !document.hidden && document.body.classList.contains("camera-on")
        && video.readyState >= 2 && video.videoWidth > 0;
    }
    function cancelCameraFrame() {
      if (videoFrame !== null) video.cancelVideoFrameCallback(videoFrame);
      if (videoTimer !== null) clearTimeout(videoTimer);
      videoFrame = videoTimer = null;
    }
    function queueCameraFrame() {
      if (stopped || !cameraLive()) return;
      if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(cameraFrame);
      else videoTimer = setTimeout(() => cameraFrame(performance.now()), 1000 / 24);
    }
    function cameraFrame(now) {
      videoFrame = videoTimer = null;
      if (stopped || !cameraLive()) return;
      if (now - lastFrame >= 1000 / 24) { lastFrame = now; schedule(); }
      queueCameraFrame();
    }
    function syncCamera() { cancelCameraFrame(); schedule(); queueCameraFrame(); }
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(app);
    const contentObserver = new MutationObserver(records => {
      if (records.some(record => record.type === "childList" && !record.target.closest(".glass-surface")
        || record.type === "attributes" && record.oldValue !== record.target.getAttribute("class")
        && record.target.matches(`${selector}, .screen, .overlay, body`))) schedule();
    });
    contentObserver.observe(app, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    const bodyObserver = new MutationObserver(syncCamera);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    addEventListener("resize", schedule);
    addEventListener("scroll", schedule, { passive: true, capture: true });
    app.addEventListener("transitionend", schedule);
    app.addEventListener("animationend", schedule);
    document.addEventListener("visibilitychange", syncCamera);
    dispose = () => {
      stopped = true;
      if (renderFrame !== null) cancelAnimationFrame(renderFrame);
      cancelCameraFrame();
      resizeObserver.disconnect(); contentObserver.disconnect(); bodyObserver.disconnect();
      removeEventListener("resize", schedule);
      removeEventListener("scroll", schedule, true);
      app.removeEventListener("transitionend", schedule);
      app.removeEventListener("animationend", schedule);
      document.removeEventListener("visibilitychange", syncCamera);
      gpu.removeEventListener("webglcontextlost", onContextLost);
      reduced.removeEventListener("change", onReducedChange);
      scene.remove();
      surfaces.forEach(({ canvas }, host) => { canvas.remove(); host.classList.remove("has-refraction"); });
      surfaces.clear();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gpu.width = gpu.height = 1;
    };
    syncCamera();

  }
  return { start, stop, active: () => dispose !== null };
})();
