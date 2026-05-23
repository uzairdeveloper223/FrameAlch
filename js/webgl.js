export class WebGLPipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });
    if (!this.gl) {
      throw new Error('WebGL2 not supported');
    }

    this.programs = {};
    this.quadBuffer = null;
    this.textures = [null, null];
    this.framebuffers = [null, null];
    this.originalTexture = null;
    this.lutTexture = null;
    this.lutSize = 13;
    this.imageWidth = 0;
    this.imageHeight = 0;

    this.initQuad();
    this.initShaders();
    this.initDefaultLut();
  }

  initQuad() {
    const gl = this.gl;
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
  }

  compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = this.compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = this.compileShader(fsSource, gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }
    return program;
  }

  initShaders() {
    const vs = `#version 300 es
      in vec2 position;
      out vec2 v_texCoord;
      void main() {
        v_texCoord = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }`;

    const fsColor = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 outColor;
      uniform sampler2D u_image;
      uniform vec3 u_lmsGain;
      uniform float u_shadows;
      uniform float u_highlights;
      uniform float u_saturation;
      uniform float u_vibrance;

      void main() {
        vec4 color = texture(u_image, v_texCoord);
        vec3 rgbToLms = mat3(
          0.3139902, 0.6395129, 0.0464975,
          0.1553718, 0.7578945, 0.0867017,
          0.0177520, 0.1094420, 0.8729136
        ) * color.rgb;

        rgbToLms *= u_lmsGain;

        vec3 balanced = mat3(
          5.472195, -4.641936, 0.169570,
          -1.125233, 2.293154, -0.167829,
          0.029791, -0.193105, 1.163182
        ) * rgbToLms;

        float luminance = dot(balanced, vec3(0.299, 0.587, 0.114));
        float shadowMask = clamp(1.0 - (luminance / 0.5), 0.0, 1.0);
        float highlightMask = clamp((luminance - 0.5) / 0.5, 0.0, 1.0);

        balanced += balanced * shadowMask * u_shadows * 0.5;
        balanced = balanced / (1.0 + highlightMask * u_highlights * 0.5);

        float maxVal = max(balanced.r, max(balanced.g, balanced.b));
        float minVal = min(balanced.r, min(balanced.g, balanced.b));
        float sat = maxVal - minVal;
        float finalLuma = dot(balanced, vec3(0.299, 0.587, 0.114));

        vec3 saturated = mix(vec3(finalLuma), balanced, 1.0 + u_saturation);
        float vibranceAmount = u_vibrance * (1.0 - sat) * 0.5;
        vec3 vibranced = mix(saturated, balanced, 1.0 - vibranceAmount);

        outColor = vec4(clamp(vibranced, 0.0, 1.0), color.a);
      }`;

    const fsDenoise = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 outColor;
      uniform sampler2D u_image;
      uniform vec2 u_resolution;
      uniform float u_denoise;

      void main() {
        vec4 centerColor = texture(u_image, v_texCoord);
        if (u_denoise <= 0.0) {
          outColor = centerColor;
          return;
        }

        vec3 sum = vec3(0.0);
        float factorSum = 0.0;
        float sigmaSpatial = 3.0 * u_denoise;
        float sigmaColor = 0.15 * u_denoise;
        int radius = int(ceil(2.0 * sigmaSpatial));
        if (radius > 5) radius = 5;

        for (int x = -radius; x <= radius; x++) {
          for (int y = -radius; y <= radius; y++) {
            vec2 offset = vec2(float(x), float(y)) / u_resolution;
            vec3 neighborColor = texture(u_image, v_texCoord + offset).rgb;
            float distSpatial = float(x * x + y * y);
            float spatialFactor = exp(-distSpatial / (2.0 * sigmaSpatial * sigmaSpatial));
            float distColor = dot(neighborColor - centerColor.rgb, neighborColor - centerColor.rgb);
            float colorFactor = exp(-distColor / (2.0 * sigmaColor * sigmaColor));
            float factor = spatialFactor * colorFactor;
            sum += neighborColor * factor;
            factorSum += factor;
          }
        }
        outColor = vec4(sum / factorSum, centerColor.a);
      }`;

    const fsSharpen = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 outColor;
      uniform sampler2D u_image;
      uniform vec2 u_resolution;
      uniform float u_sharpen;

      void main() {
        vec4 centerColor = texture(u_image, v_texCoord);
        if (u_sharpen <= 0.0) {
          outColor = centerColor;
          return;
        }

        vec3 blur = vec3(0.0);
        blur += texture(u_image, v_texCoord + vec2(-1.0, -1.0) / u_resolution).rgb * 0.0625;
        blur += texture(u_image, v_texCoord + vec2(0.0, -1.0) / u_resolution).rgb * 0.125;
        blur += texture(u_image, v_texCoord + vec2(1.0, -1.0) / u_resolution).rgb * 0.0625;
        blur += texture(u_image, v_texCoord + vec2(-1.0, 0.0) / u_resolution).rgb * 0.125;
        blur += texture(u_image, v_texCoord + vec2(0.0, 0.0) / u_resolution).rgb * 0.25;
        blur += texture(u_image, v_texCoord + vec2(1.0, 0.0) / u_resolution).rgb * 0.125;
        blur += texture(u_image, v_texCoord + vec2(-1.0, 1.0) / u_resolution).rgb * 0.0625;
        blur += texture(u_image, v_texCoord + vec2(0.0, 1.0) / u_resolution).rgb * 0.125;
        blur += texture(u_image, v_texCoord + vec2(1.0, 1.0) / u_resolution).rgb * 0.0625;

        vec3 highFreq = centerColor.rgb - blur;
        vec3 sharpened = centerColor.rgb + u_sharpen * highFreq;
        outColor = vec4(clamp(sharpened, 0.0, 1.0), centerColor.a);
      }`;

    const fsClarity = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 outColor;
      uniform sampler2D u_image;
      uniform vec2 u_resolution;
      uniform float u_clarity;

      void main() {
        vec4 centerColor = texture(u_image, v_texCoord);
        if (abs(u_clarity) <= 0.01) {
          outColor = centerColor;
          return;
        }

        vec3 localMean = vec3(0.0);
        float totalWeight = 0.0;
        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x) * 2.0, float(y) * 2.0) / u_resolution;
            vec3 col = texture(u_image, v_texCoord + offset).rgb;
            localMean += col;
            totalWeight += 1.0;
          }
        }
        localMean /= totalWeight;

        vec3 diff = centerColor.rgb - localMean;
        float luma = dot(centerColor.rgb, vec3(0.299, 0.587, 0.114));
        float midtoneWeight = 1.0 - 4.0 * (luma - 0.5) * (luma - 0.5);
        midtoneWeight = clamp(midtoneWeight, 0.0, 1.0);

        vec3 result = centerColor.rgb + diff * u_clarity * 0.4 * midtoneWeight;
        outColor = vec4(clamp(result, 0.0, 1.0), centerColor.a);
      }`;

    const fsFinal = `#version 300 es
      precision highp float;
      precision highp sampler3D;
      in vec2 v_texCoord;
      out vec4 outColor;
      uniform sampler2D u_image;
      uniform sampler3D u_lut;
      uniform float u_lutSize;
      uniform float u_lutIntensity;
      uniform float u_exposure;
      uniform float u_contrast;
      uniform float u_vignette;
      uniform float u_chromaticAberration;
      uniform float u_grain;
      uniform vec2 u_resolution;
      uniform float u_vintageFade;
      uniform bool u_lutLogMode;

      float hash(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      vec3 srgbToLinear(vec3 srgb) {
        return mix(
          srgb / 12.92,
          pow((srgb + 0.055) / 1.055, vec3(2.4)),
          step(vec3(0.04045), srgb)
        );
      }

      vec3 linearToCineon(vec3 lin) {
        vec3 x = max(lin, vec3(1e-10)) / 0.18;
        vec3 log10_x = log(x) / log(10.0);
        vec3 cineon = (log10_x * 300.0 + 445.0) / 1023.0;
        return clamp(cineon, 0.0, 1.0);
      }

      vec3 srgbToCineon(vec3 srgb) {
        return linearToCineon(srgbToLinear(srgb));
      }

      void main() {
        vec2 distVec = v_texCoord - vec2(0.5);
        float distSq = dot(distVec, distVec);
        vec2 caOffset = distVec * distSq * u_chromaticAberration * 0.04;

        vec4 rawColor;
        rawColor.r = texture(u_image, v_texCoord - caOffset).r;
        rawColor.g = texture(u_image, v_texCoord).g;
        rawColor.b = texture(u_image, v_texCoord + caOffset).b;
        rawColor.a = texture(u_image, v_texCoord).a;

        vec3 rgb = rawColor.rgb * exp2(u_exposure);
        rgb = (rgb - 0.5) * (1.0 + u_contrast) + 0.5;
        rgb = clamp(rgb, 0.0, 1.0);

        vec3 lutInput = u_lutLogMode ? srgbToCineon(rgb) : rgb;

        vec3 scaledCoords = (lutInput * (u_lutSize - 1.0) + 0.5) / u_lutSize;
        vec3 graded = texture(u_lut, scaledCoords).rgb;
        vec3 color = mix(rgb, graded, u_lutIntensity);

        float dist = length(distVec);
        float vignOffset = smoothstep(0.8, 0.8 - u_vignette * 0.4, dist);
        color *= vignOffset;

        if (u_vintageFade > 0.0) {
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          vec3 warmHighlight = vec3(1.06, 0.99, 0.88);
          vec3 coolShadow = vec3(0.88, 0.94, 1.04);
          vec3 splitToned = mix(coolShadow * color, warmHighlight * color, luma);
          vec3 faded = splitToned * 0.82 + 0.09;
          color = mix(color, faded, u_vintageFade);
          float finalLuma = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(color, vec3(finalLuma), u_vintageFade * 0.22);
        }

        if (u_grain > 0.0) {
          float noiseVal = hash(v_texCoord * u_resolution);
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          float grainMask = smoothstep(0.0, 0.3, luma) * (1.0 - smoothstep(0.7, 1.0, luma));
          color = clamp(color + (noiseVal - 0.5) * u_grain * grainMask * 0.18, 0.0, 1.0);
        }

        outColor = vec4(color, rawColor.a);
      }`;

    this.programs.color = this.createProgram(vs, fsColor);
    this.programs.denoise = this.createProgram(vs, fsDenoise);
    this.programs.sharpen = this.createProgram(vs, fsSharpen);
    this.programs.clarity = this.createProgram(vs, fsClarity);
    this.programs.final = this.createProgram(vs, fsFinal);
  }

  initDefaultLut() {
    const gl = this.gl;
    const size = 2;
    const data = new Uint8Array([
      0, 0, 0, 255,  255, 0, 0, 255,
      0, 255, 0, 255,  255, 255, 0, 255,
      0, 0, 255, 255,  255, 0, 255, 255,
      0, 255, 255, 255,  255, 255, 255, 255
    ]);
    this.setLutData(size, data);
  }

  setLutData(size, data) {
    const gl = this.gl;
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
    }
    this.lutSize = size;
    this.lutTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      size,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
  }

  setImage(imageElement) {
    this.imageElement = imageElement;
    this.fullWidth = imageElement.naturalWidth || imageElement.width;
    this.fullHeight = imageElement.naturalHeight || imageElement.height;
    this.setupResolution(false);
  }

  setupResolution(isFullRes) {
    const gl = this.gl;
    if (isFullRes) {
      this.imageWidth = this.fullWidth;
      this.imageHeight = this.fullHeight;
    } else {
      const maxPreviewSize = 1600;
      let w = this.fullWidth;
      let h = this.fullHeight;
      if (w > maxPreviewSize || h > maxPreviewSize) {
        if (w > h) {
          h = Math.round((h * maxPreviewSize) / w);
          w = maxPreviewSize;
        } else {
          w = Math.round((w * maxPreviewSize) / h);
          h = maxPreviewSize;
        }
      }
      this.imageWidth = w;
      this.imageHeight = h;
    }

    this.canvas.width = this.imageWidth;
    this.canvas.height = this.imageHeight;

    if (this.originalTexture) gl.deleteTexture(this.originalTexture);
    this.originalTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.imageElement);

    for (let i = 0; i < 2; i++) {
      if (this.textures[i]) gl.deleteTexture(this.textures[i]);
      if (this.framebuffers[i]) gl.deleteFramebuffer(this.framebuffers[i]);

      this.textures[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        this.imageWidth,
        this.imageHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );

      this.framebuffers[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.textures[i],
        0
      );
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(params) {
    if (!this.originalTexture) {
      return;
    }
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);

    let currentSrc = this.originalTexture;
    let currentFbIndex = 0;

    const runPass = (programName, setupUniforms) => {
      const prog = this.programs[programName];
      gl.useProgram(prog);

      gl.viewport(0, 0, this.imageWidth, this.imageHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[currentFbIndex]);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentSrc);
      const uImage = gl.getUniformLocation(prog, 'u_image');
      gl.uniform1i(uImage, 0);

      setupUniforms(prog);

      const posAttr = gl.getAttribLocation(prog, 'position');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      currentSrc = this.textures[currentFbIndex];
      currentFbIndex = 1 - currentFbIndex;
    };

    runPass('color', (prog) => {
      const t = params.temperature;
      const ti = params.tint;
      const lmsGain = [
        1.0 + t * 0.12 - ti * 0.04,
        1.0 + ti * 0.08,
        1.0 - t * 0.12 - ti * 0.04
      ];
      gl.uniform3fv(gl.getUniformLocation(prog, 'u_lmsGain'), new Float32Array(lmsGain));
      gl.uniform1f(gl.getUniformLocation(prog, 'u_shadows'), params.shadows);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_highlights'), params.highlights);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), params.saturation);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_vibrance'), params.vibrance);
    });

    runPass('denoise', (prog) => {
      gl.uniform2f(
        gl.getUniformLocation(prog, 'u_resolution'),
        this.imageWidth,
        this.imageHeight
      );
      gl.uniform1f(gl.getUniformLocation(prog, 'u_denoise'), params.denoise);
    });

    runPass('sharpen', (prog) => {
      gl.uniform2f(
        gl.getUniformLocation(prog, 'u_resolution'),
        this.imageWidth,
        this.imageHeight
      );
      gl.uniform1f(gl.getUniformLocation(prog, 'u_sharpen'), params.sharpen);
    });

    runPass('clarity', (prog) => {
      gl.uniform2f(
        gl.getUniformLocation(prog, 'u_resolution'),
        this.imageWidth,
        this.imageHeight
      );
      gl.uniform1f(gl.getUniformLocation(prog, 'u_clarity'), params.clarity);
    });

    const progFinal = this.programs.final;
    gl.useProgram(progFinal);

    gl.viewport(0, 0, this.imageWidth, this.imageHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentSrc);
    gl.uniform1i(gl.getUniformLocation(progFinal, 'u_image'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.uniform1i(gl.getUniformLocation(progFinal, 'u_lut'), 1);

    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_lutSize'), this.lutSize);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_lutIntensity'), params.lutIntensity);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_exposure'), params.exposure);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_contrast'), params.contrast);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_vignette'), params.vignette);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_chromaticAberration'), params.chromaticAberration || 0.0);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_grain'), params.grain || 0.0);
    gl.uniform2f(gl.getUniformLocation(progFinal, 'u_resolution'), this.imageWidth, this.imageHeight);
    gl.uniform1f(gl.getUniformLocation(progFinal, 'u_vintageFade'), params.vintage || 0.0);
    gl.uniform1i(gl.getUniformLocation(progFinal, 'u_lutLogMode'), params.lutLogMode ? 1 : 0);

    const posAttr = gl.getAttribLocation(progFinal, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose() {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      if (this.textures[i]) gl.deleteTexture(this.textures[i]);
      if (this.framebuffers[i]) gl.deleteFramebuffer(this.framebuffers[i]);
    }
    if (this.originalTexture) gl.deleteTexture(this.originalTexture);
    if (this.lutTexture) gl.deleteTexture(this.lutTexture);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);

    Object.keys(this.programs).forEach((name) => {
      gl.deleteProgram(this.programs[name]);
    });
  }
}
