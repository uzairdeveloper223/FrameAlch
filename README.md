# FrameAlch

WebGL2-powered client-side 3D LUT photo editor. FrameAlch enables professional-grade color grading, vintage film emulation, and high-performance pixel-level adjustments directly inside your web browser.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Author: Uzair Mughal](https://img.shields.io/badge/author-Uzair%20Mughal-darkgreen.svg)](https://uzair.is-a.dev)
[![Portfolio: uzair.is-a.dev](https://img.shields.io/badge/portfolio-uzair.is--a.dev-lightgrey.svg)](https://uzair.is-a.dev)
[![GitHub: uzairdeveloper223](https://img.shields.io/badge/github-uzairdeveloper223-black.svg?logo=github)](https://github.com/uzairdeveloper223)

## Technical Architecture

FrameAlch uses hardware-accelerated WebGL2 shaders to execute real-time color mapping and mathematical operations on full-resolution digital negatives.

* **GPU Shader Pipeline:** All sliders (temperature, tint, exposure, contrast, saturation, shadows/highlights) translate directly into real-time dynamic GPU operations, running at 60 FPS on standard consumer screens.
* **3D LUT Color Grading:** Implements a tetrahedral/trilinear 3D LUT interpolation pipeline. LUTs are parsed client-side from standard `.cube` formats and bound to 3D textures in graphics memory.
* **Progressive Sequential Loader:** To prevent network request flooding, FrameAlch features a progressive loader queue that dynamically pre-fetches and parses assets sequentially.
* **EXIF Metadata Integrity:** Uses standard client-side segment parsing to extract and stitch original EXIF camera headers back into processed, exported JPEG frames.

## Project Structure

```
FrameAlch/
  index.html          # Main application entry point
  manifest.json       # PWA manifest
  sw.js               # Service worker (caching for offline and LUT assets)
  host.py             # Dev/deployment automation script
  js/
    app.js            # Core application logic
    webgl.js          # WebGL2 GPU shader pipeline
    parser.js         # .cube LUT file parser
    exif.js           # EXIF metadata extraction and stitching
  css/
    index.css         # Full application stylesheet
  assets/
    favicon.svg       # Application icon
  resources/          # (local dev only) Cloned LUT repository
```

## Privacy and Data Security

FrameAlch operates strictly on a zero-server architecture.

* All file decodes, image scaling, WebGL filters, and camera preview rendering run locally in the browser sandbox.
* No image data, file metadata, or camera feeds are ever transmitted, saved, or uploaded to external servers.
* Operates entirely without analytics cookies, third-party trackers, or behavioral profiling tools.

## Development and Hosting

FrameAlch includes a Python deployment script (`host.py`) designed to manage dependencies, toggle environment modes, and serve local assets.

### Dependencies

* Python 3.x (only required for local server operations and auto-cloning assets)
* Git (required for cloning local film LUT libraries)

### Running Locally

To run the application locally, run the executable dev server:

```bash
chmod +x host.py
./host.py
```

This automatically clones the film LUT assets into `/resources/Film-Luts/`, configures the production environment flag in `js/app.js` to `false`, and starts a local web server with CORS and cache headers enabled at `http://localhost:8080`.

### Production Deployment to Static Hosting

To deploy FrameAlch to static cloud hosting solutions (e.g. Vercel, Netlify, Cloudflare Pages, GitHub Pages):

1. Set the production flag:
   ```bash
   ./host.py --prod
   ```
   This toggles `const IS_PRODUCTION = true;` inside `js/app.js`.
2. Push or upload the repository directory. You do not need to upload the `/resources/` folder.
3. In production mode, FrameAlch dynamically streams all static LUT resources and thumbnails on-demand directly from the raw GitHub asset tree of `YahiaAngelo/Film-Luts`.

## Credits and Attribution

### Development

* **Lead Developer:** Uzair Mughal
* **Portfolio Website:** [uzair.is-a.dev](https://uzair.is-a.dev)
* **GitHub Profile:** [@uzairdeveloper223](https://github.com/uzairdeveloper223)
* **Email Support:** [contact@uzair.is-a.dev](mailto:contact@uzair.is-a.dev)

### Third-Party Resources

* **Film LUT Library:** [YahiaAngelo/Film-Luts](https://github.com/YahiaAngelo/Film-Luts) -- A curated collection of professional-grade `.cube` 3D LUT files covering classic analog film stocks (Kodak, Fuji, Ilford, CineStill, etc.) used for the color grading presets in FrameAlch.

## License

FrameAlch is open-source software licensed under the [MIT License](LICENSE).
