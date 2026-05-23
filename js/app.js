import { WebGLPipeline } from './webgl.js';
import { CubeParser } from './parser.js';
import { ExifStitcher } from './exif.js';

const IS_PRODUCTION = false;
const LUT_BASE_URL = IS_PRODUCTION ? 'https://raw.githubusercontent.com/YahiaAngelo/Film-Luts/main/' : '../resources/Film-Luts/';

class FrameAlchApp {
  constructor() {
    this.pipeline = null;
    this.lutCache = new Map();
    this.activeImage = null;
    this.isDraggingSplit = false;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.batchQueue = [];
    this.batchIndex = -1;
    this.isBatchExportPending = false;
    this.activeExif = null;
    this.cameraStream = null;
    this.currentFacingMode = 'environment';
    this.isResizingFooter = false;
    this.footerStartY = 0;
    this.footerStartHeight = 0;

    this.state = {
      temperature: 0.0,
      tint: 0.0,
      shadows: 0.0,
      highlights: 0.0,
      denoise: 0.0,
      sharpen: 0.0,
      clarity: 0.0,
      exposure: 0.0,
      contrast: 0.0,
      saturation: 0.0,
      vibrance: 0.0,
      vignette: 0.0,
      lutIntensity: 1.0,
      splitPosition: 0.5,
      chromaticAberration: 0.0,
      grain: 0.0,
      vintage: 0.0,
      lutLogMode: false
    };

    this.initDOM();
    this.initPipeline();
    this.initEventListeners();
    this.loadPresets();
  }

  initDOM() {
    this.canvas = document.getElementById('gl-canvas');
    this.viewportContainer = document.getElementById('viewport-container');
    this.canvasContainer = document.getElementById('canvas-container');
    this.viewportFallback = document.getElementById('viewport-fallback');
    this.imageUpload = document.getElementById('image-upload');
    this.exportBtn = document.getElementById('export-btn');
    this.splitSlider = document.getElementById('split-slider');
    this.presetsGallery = document.getElementById('presets-gallery');
    this.categoryTabs = document.getElementById('category-tabs');
    this.lutInfoName = document.getElementById('lut-info-name');
    this.originalView = document.getElementById('original-view');
    this.processedWrapper = document.getElementById('processed-wrapper');

    this.batchToggleBtn = document.getElementById('batch-toggle-btn');
    this.batchDrawer = document.getElementById('batch-drawer');
    this.closeDrawerBtn = document.getElementById('close-drawer-btn');
    this.batchList = document.getElementById('batch-list');
    this.batchExportBtn = document.getElementById('batch-export-btn');
    this.clearQueueBtn = document.getElementById('clear-queue-btn');
    this.batchCountBadge = document.getElementById('batch-count');

    this.exportModal = document.getElementById('export-modal');
    this.closeModalBtn = document.getElementById('close-modal-btn');
    this.confirmExportBtn = document.getElementById('confirm-export-btn');
    this.exportFilename = document.getElementById('export-filename');
    this.exportFormat = document.getElementById('export-format');
    this.exportQuality = document.getElementById('export-quality');
    this.exportQualityVal = document.getElementById('export-quality-val');
    this.exportScale = document.getElementById('export-scale');
    this.exportExif = document.getElementById('export-exif');
    this.qualityRow = document.getElementById('quality-row');
    this.exifRow = document.getElementById('exif-row');

    this.cameraBtn = document.getElementById('camera-btn');
    this.cameraModal = document.getElementById('camera-modal');
    this.closeCameraBtn = document.getElementById('close-camera-btn');
    this.shutterBtn = document.getElementById('shutter-btn');
    this.cameraVideo = document.getElementById('camera-video');
    this.switchCameraBtn = document.getElementById('switch-camera-btn');

    this.adjustToggleBtn = document.getElementById('adjust-toggle-btn');
    this.closeAdjustBtn = document.getElementById('close-adjust-btn');
    this.sidebarSection = document.getElementById('sidebar-section');
    this.lutLogModeCheckbox = document.getElementById('lut-log-mode');
    this.resetAllBtn = document.getElementById('reset-all-btn');
    this.appFooter = document.getElementById('app-footer');
    this.footerResizeHandle = document.getElementById('footer-resize-handle');
    this.appLayout = document.getElementById('app');
    this.privacyBanner = document.getElementById('privacy-banner');
    this.acceptPrivacyBtn = document.getElementById('accept-privacy-btn');
    this.privacyModal = document.getElementById('privacy-modal');
    this.privacyPolicyLink = document.getElementById('privacy-policy-link');
    this.bannerPrivacyLink = document.getElementById('banner-privacy-link');
    this.closePrivacyBtn = document.getElementById('close-privacy-btn');
    this.confirmPrivacyBtn = document.getElementById('confirm-privacy-btn');

    this.sliders = {
      temperature: document.getElementById('temp-slider'),
      tint: document.getElementById('tint-slider'),
      shadows: document.getElementById('shadows-slider'),
      highlights: document.getElementById('highlights-slider'),
      denoise: document.getElementById('denoise-slider'),
      sharpen: document.getElementById('sharpen-slider'),
      clarity: document.getElementById('clarity-slider'),
      exposure: document.getElementById('exposure-slider'),
      contrast: document.getElementById('contrast-slider'),
      saturation: document.getElementById('saturation-slider'),
      vibrance: document.getElementById('vibrance-slider'),
      vignette: document.getElementById('vignette-slider'),
      lutIntensity: document.getElementById('lut-intensity-slider'),
      chromaticAberration: document.getElementById('chromatic-aberration-slider'),
      grain: document.getElementById('grain-slider'),
      vintage: document.getElementById('vintage-slider')
    };

    this.badges = {
      temperature: document.getElementById('temp-val'),
      tint: document.getElementById('tint-val'),
      shadows: document.getElementById('shadows-val'),
      highlights: document.getElementById('highlights-val'),
      denoise: document.getElementById('denoise-val'),
      sharpen: document.getElementById('sharpen-val'),
      clarity: document.getElementById('clarity-val'),
      exposure: document.getElementById('exposure-val'),
      contrast: document.getElementById('contrast-val'),
      saturation: document.getElementById('saturation-val'),
      vibrance: document.getElementById('vibrance-val'),
      vignette: document.getElementById('vignette-val'),
      lutIntensity: document.getElementById('lut-intensity-val'),
      chromaticAberration: document.getElementById('chromatic-aberration-val'),
      grain: document.getElementById('grain-val'),
      vintage: document.getElementById('vintage-val')
    };
  }

  initPipeline() {
    this.pipeline = new WebGLPipeline(this.canvas);
  }

  initEventListeners() {
    this.imageUpload.addEventListener('change', (e) => this.handleImageFiles(e.target.files));

    this.exportBtn.addEventListener('click', () => this.showExportModal(false));

    const fallbackClick = () => this.imageUpload.click();
    this.viewportFallback.addEventListener('click', fallbackClick);

    this.viewportContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.viewportFallback.classList.add('hover');
    });

    this.viewportContainer.addEventListener('dragleave', () => {
      this.viewportFallback.classList.remove('hover');
    });

    this.viewportContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      this.viewportFallback.classList.remove('hover');
      if (e.dataTransfer.files.length > 0) {
        this.handleImageFiles(e.dataTransfer.files);
      }
    });

    this.batchToggleBtn.addEventListener('click', () => this.toggleBatchDrawer());
    this.closeDrawerBtn.addEventListener('click', () => this.hideBatchDrawer());
    this.clearQueueBtn.addEventListener('click', () => this.clearBatchQueue());
    this.batchExportBtn.addEventListener('click', () => this.runBatchExport());

    this.closeModalBtn.addEventListener('click', () => this.hideExportModal());
    this.exportFormat.addEventListener('change', () => this.toggleFormatRows());
    this.exportQuality.addEventListener('input', (e) => {
      this.exportQualityVal.textContent = `${e.target.value}%`;
    });
    this.confirmExportBtn.addEventListener('click', () => this.triggerCustomExport());

    if (this.cameraBtn) {
      this.cameraBtn.addEventListener('click', () => this.openCamera());
    }
    if (this.closeCameraBtn) {
      this.closeCameraBtn.addEventListener('click', () => this.closeCamera());
    }
    if (this.shutterBtn) {
      this.shutterBtn.addEventListener('click', () => this.captureCameraFrame());
    }
    if (this.cameraModal) {
      this.cameraModal.addEventListener('click', (e) => {
        if (e.target === this.cameraModal) {
          this.closeCamera();
        }
      });
    }
    if (this.switchCameraBtn) {
      this.switchCameraBtn.addEventListener('click', () => {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        this.openCamera();
      });
    }

    if (this.adjustToggleBtn) {
      this.adjustToggleBtn.addEventListener('click', () => {
        this.sidebarSection.classList.add('open');
        this.adjustToggleBtn.classList.add('active');
      });
    }
    if (this.closeAdjustBtn) {
      this.closeAdjustBtn.addEventListener('click', () => {
        this.sidebarSection.classList.remove('open');
        this.adjustToggleBtn.classList.remove('active');
      });
    }
    if (this.resetAllBtn) {
      this.resetAllBtn.addEventListener('click', () => this.resetAllAdjustments());
    }
    if (this.lutLogModeCheckbox) {
      this.lutLogModeCheckbox.addEventListener('change', (e) => {
        this.state.lutLogMode = e.target.checked;
        this.requestRender();
      });
    }

    if (!localStorage.getItem('framealch-privacy-accepted')) {
      if (this.privacyBanner) {
        this.privacyBanner.classList.remove('hidden');
      }
    }

    if (this.acceptPrivacyBtn) {
      this.acceptPrivacyBtn.addEventListener('click', () => {
        localStorage.setItem('framealch-privacy-accepted', 'true');
        if (this.privacyBanner) {
          this.privacyBanner.classList.add('hidden');
        }
      });
    }

    const openPrivacyModal = (e) => {
      e.preventDefault();
      if (this.privacyModal) {
        this.privacyModal.classList.add('open');
      }
    };

    if (this.privacyPolicyLink) {
      this.privacyPolicyLink.addEventListener('click', openPrivacyModal);
    }
    if (this.bannerPrivacyLink) {
      this.bannerPrivacyLink.addEventListener('click', openPrivacyModal);
    }

    const closePrivacyModal = () => {
      if (this.privacyModal) {
        this.privacyModal.classList.remove('open');
      }
    };

    if (this.closePrivacyBtn) {
      this.closePrivacyBtn.addEventListener('click', closePrivacyModal);
    }
    if (this.confirmPrivacyBtn) {
      this.confirmPrivacyBtn.addEventListener('click', closePrivacyModal);
    }
    if (this.privacyModal) {
      this.privacyModal.addEventListener('click', (e) => {
        if (e.target === this.privacyModal) {
          closePrivacyModal();
        }
      });
    }

    this.initFooterResize();

    Object.keys(this.sliders).forEach((key) => {
      const slider = this.sliders[key];
      slider.addEventListener('input', (e) => {
        this.state[key] = parseFloat(e.target.value);
        this.updateBadge(key);
        this.requestRender();
      });

      const sliderHeader = slider.previousElementSibling;
      const resetFn = () => {
        if (key === 'lutIntensity') {
          slider.value = 1.0;
          this.state[key] = 1.0;
        } else {
          slider.value = 0.0;
          this.state[key] = 0.0;
        }
        this.updateBadge(key);
        this.requestRender();
      };
      slider.addEventListener('dblclick', resetFn);
      if (sliderHeader && sliderHeader.classList.contains('slider-header')) {
        sliderHeader.addEventListener('dblclick', resetFn);
        sliderHeader.style.cursor = 'pointer';
        sliderHeader.title = 'Double-click to reset';
      }
    });

    this.splitSlider.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isDraggingSplit = true;
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingSplit = false;
      this.isPanning = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingSplit && this.activeImage) {
        const rect = this.canvas.getBoundingClientRect();
        let pos = (e.clientX - rect.left) / rect.width;
        if (pos < 0) pos = 0;
        if (pos > 1) pos = 1;
        this.state.splitPosition = pos;
        this.splitSlider.style.left = `${pos * 100}%`;
        this.processedWrapper.style.width = `${pos * 100}%`;
        return;
      }

      if (this.isPanning && this.activeImage) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.updateViewportTransform();
      }
    });

    this.splitSlider.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      this.isDraggingSplit = true;
    });

    window.addEventListener('touchend', () => {
      this.isDraggingSplit = false;
      this.isPanning = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (this.isDraggingSplit && this.activeImage && e.touches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        let pos = (e.touches[0].clientX - rect.left) / rect.width;
        if (pos < 0) pos = 0;
        if (pos > 1) pos = 1;
        this.state.splitPosition = pos;
        this.splitSlider.style.left = `${pos * 100}%`;
        this.processedWrapper.style.width = `${pos * 100}%`;
        return;
      }

      if (this.isPanning && this.activeImage && e.touches.length === 1) {
        this.panX = e.touches[0].clientX - this.panStartX;
        this.panY = e.touches[0].clientY - this.panStartY;
        this.updateViewportTransform();
      }
    });

    this.viewportContainer.addEventListener('mousedown', (e) => {
      if (!this.activeImage || e.target.closest('#split-slider') || e.target.closest('.action-btn')) {
        return;
      }
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
    });

    this.viewportContainer.addEventListener('touchstart', (e) => {
      if (!this.activeImage || e.target.closest('#split-slider')) {
        return;
      }
      if (e.touches.length === 1) {
        this.isPanning = true;
        this.panStartX = e.touches[0].clientX - this.panX;
        this.panStartY = e.touches[0].clientY - this.panY;
      }
    });

    this.viewportContainer.addEventListener('wheel', (e) => {
      if (!this.activeImage) {
        return;
      }
      e.preventDefault();

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const oldZoom = this.zoom;
      let newZoom = oldZoom * zoomFactor;
      if (newZoom < 0.2) newZoom = 0.2;
      if (newZoom > 15.0) newZoom = 15.0;

      const rect = this.viewportContainer.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const ratio = newZoom / oldZoom;
      this.panX = mx - (mx - this.panX) * ratio;
      this.panY = my - (my - this.panY) * ratio;
      this.zoom = newZoom;

      this.updateViewportTransform();
    }, { passive: false });

    this.viewportContainer.addEventListener('dblclick', (e) => {
      if (!this.activeImage || e.target.closest('#split-slider')) {
        return;
      }
      this.resetViewport();
    });

    this.categoryTabs.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-btn')) {
        return;
      }
      const activeTab = this.categoryTabs.querySelector('.tab-btn.active');
      if (activeTab) {
        activeTab.classList.remove('active');
      }
      e.target.classList.add('active');
      this.filterPresets(e.target.dataset.category);
    });

    window.addEventListener('resize', () => {
      if (this.activeImage) {
        this.adjustCanvasSize();
        this.resetViewport();
      }
    });
  }

  handleImageFiles(files) {
    if (!files || files.length === 0) {
      return;
    }

    const promises = Array.from(files).map((file) => {
      if (!file.type.startsWith('image/')) {
        return null;
      }
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const exif = ExifStitcher.extractExif(e.target.result);
            resolve({
              file,
              name: file.name,
              url,
              img,
              exif,
              status: 'ready'
            });
          };
          reader.readAsArrayBuffer(file);
        };
        img.src = url;
      });
    });

    Promise.all(promises).then((results) => {
      const validResults = results.filter(r => r !== null);
      if (validResults.length === 0) {
        return;
      }

      const wasEmpty = this.batchQueue.length === 0;
      this.batchQueue.push(...validResults);
      this.updateBatchQueueUI();

      if (wasEmpty) {
        this.loadBatchItem(0);
      }
    });
  }

  adjustCanvasSize() {
    const containerWidth = this.viewportContainer.clientWidth - 48;
    const containerHeight = this.viewportContainer.clientHeight - 48;
    const imgAspect = this.activeImage.naturalWidth / this.activeImage.naturalHeight;
    const containerAspect = containerWidth / containerHeight;

    let targetWidth = 0;
    let targetHeight = 0;

    if (imgAspect > containerAspect) {
      targetWidth = containerWidth;
      targetHeight = containerWidth / imgAspect;
    } else {
      targetHeight = containerHeight;
      targetWidth = containerHeight * imgAspect;
    }

    const wStr = `${targetWidth}px`;
    const hStr = `${targetHeight}px`;

    this.canvasContainer.style.width = wStr;
    this.canvasContainer.style.height = hStr;

    this.originalView.style.width = wStr;
    this.originalView.style.height = hStr;

    this.canvas.style.width = wStr;
    this.canvas.style.height = hStr;
  }

  updateBadge(key) {
    const val = this.state[key];
    let display = val;
    if (key === 'temperature') {
      display = val === 0 ? 'As Shot' : val > 0 ? `+${Math.round(val * 100)}` : Math.round(val * 100);
    } else if (key === 'tint') {
      display = val === 0 ? 'As Shot' : val > 0 ? `+${Math.round(val * 100)}` : Math.round(val * 100);
    } else if (key === 'shadows' || key === 'highlights' || key === 'contrast' || key === 'saturation' || key === 'vibrance') {
      display = val === 0 ? '0%' : val > 0 ? `+${Math.round(val * 100)}%` : `${Math.round(val * 100)}%`;
    } else if (key === 'exposure') {
      display = val === 0 ? '0.00' : val > 0 ? `+${val.toFixed(2)} EV` : `${val.toFixed(2)} EV`;
    } else if (key === 'denoise' || key === 'vignette') {
      display = val === 0 ? 'Off' : `${Math.round(val * 100)}%`;
    } else if (key === 'sharpen') {
      display = val === 0 ? 'Off' : val.toFixed(2);
    } else if (key === 'clarity') {
      display = val === 0 ? 'Neutral' : val > 0 ? `+${Math.round(val * 100)}` : Math.round(val * 100);
    } else if (key === 'lutIntensity') {
      display = `${Math.round(val * 100)}%`;
    } else if (key === 'chromaticAberration') {
      display = val === 0 ? 'Off' : val.toFixed(2);
    } else if (key === 'grain' || key === 'vintage') {
      display = val === 0 ? 'Off' : `${Math.round(val * 100)}%`;
    }
    this.badges[key].textContent = display;
  }

  requestRender() {
    if (!this.activeImage) {
      return;
    }
    requestAnimationFrame(() => this.pipeline.render(this.state));
  }

  async loadPresets() {
    try {
      const response = await fetch(`${LUT_BASE_URL}film_luts.json`);
      const data = await response.json();
      this.presets = data.filmLUTs;

      if (this.categoryTabs) {
        const categories = ['All', ...new Set(this.presets.map(lut => lut.category))];
        this.categoryTabs.innerHTML = '';
        categories.forEach(cat => {
          const btn = document.createElement('button');
          btn.className = `tab-btn${cat === 'All' ? ' active' : ''}`;
          btn.dataset.category = cat;

          if (cat === 'Bw') {
            btn.textContent = 'Black & White';
          } else {
            btn.textContent = cat;
          }
          this.categoryTabs.appendChild(btn);
        });
      }

      this.renderPresets();
    } catch (e) {
      this.presets = [];
    }
  }

  renderPresets() {
    const listElements = [this.presetsGallery.querySelector('#preset-linear')];
    this.presetsGallery.innerHTML = '';
    const linearCard = listElements[0];
    if (linearCard) {
      linearCard.addEventListener('click', () => this.applyPreset(linearCard));
      this.presetsGallery.appendChild(linearCard);
    }

    this.presets.forEach((lut, idx) => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.dataset.lutFile = lut.lut_file;
      card.dataset.index = idx;

      const thumbContainer = document.createElement('div');
      thumbContainer.className = 'preset-thumbnail-placeholder';

      const spinner = document.createElement('div');
      spinner.className = 'preset-card-spinner';
      thumbContainer.appendChild(spinner);

      const info = document.createElement('div');
      info.className = 'preset-info';

      const name = document.createElement('p');
      name.className = 'preset-name';
      name.textContent = lut.name;

      const cat = document.createElement('p');
      cat.className = 'preset-cat';
      cat.textContent = lut.category === 'Bw' ? 'Black & White' : lut.category;

      info.appendChild(name);
      info.appendChild(cat);
      card.appendChild(thumbContainer);
      card.appendChild(info);

      card.addEventListener('click', () => this.applyPreset(card));
      this.presetsGallery.appendChild(card);
    });

    this.loadPresetsSequentially();
  }

  async loadPresetsSequentially() {
    const cards = Array.from(this.presetsGallery.querySelectorAll('.preset-card')).filter(c => c.id !== 'preset-linear');
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const idx = parseInt(card.dataset.index, 10);
      const lut = this.presets[idx];
      if (!lut) continue;

      const thumbContainer = card.querySelector('.preset-thumbnail-placeholder');

      try {
        const loadImg = new Promise((resolve, reject) => {
          const img = new Image();
          img.className = 'preset-thumbnail-img';
          img.onload = () => {
            if (thumbContainer) {
              thumbContainer.innerHTML = '';
              thumbContainer.appendChild(img);
              requestAnimationFrame(() => {
                img.classList.add('fade-in');
              });
            }
            resolve();
          };
          img.onerror = reject;
          img.src = `${LUT_BASE_URL}${lut.thumbnail}`;
        });

        const loadCube = (async () => {
          const file = lut.lut_file;
          if (this.lutCache.has(file)) return;
          const response = await fetch(`${LUT_BASE_URL}${file}`);
          const text = await response.getReader ? await this.readStreamAsText(response) : await response.text();
          const lutData = CubeParser.parse(text);
          this.lutCache.set(file, lutData);
        })();

        await Promise.all([loadImg, loadCube]);
      } catch (e) {
        if (thumbContainer) {
          thumbContainer.innerHTML = '';
          const errorIcon = document.createElement('div');
          errorIcon.style.color = '#ef4444';
          errorIcon.style.fontSize = '12px';
          errorIcon.textContent = 'Error';
          thumbContainer.appendChild(errorIcon);
        }
      }
    }
  }

  filterPresets(category) {
    const cards = this.presetsGallery.querySelectorAll('.preset-card');
    cards.forEach((card) => {
      if (card.id === 'preset-linear') {
        return;
      }
      const idx = parseInt(card.dataset.index, 10);
      const lut = this.presets[idx];
      if (category === 'All' || lut.category === category) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  async applyPreset(cardElement) {
    const active = this.presetsGallery.querySelector('.preset-card.active');
    if (active) {
      active.classList.remove('active');
    }
    cardElement.classList.add('active');

    let checkLogMode = false;
    if (cardElement.id !== 'preset-linear') {
      checkLogMode = true;
    }
    this.state.lutLogMode = checkLogMode;
    if (this.lutLogModeCheckbox) {
      this.lutLogModeCheckbox.checked = checkLogMode;
    }

    const file = cardElement.dataset.lutFile;
    if (file === 'linear') {
      this.pipeline.initDefaultLut();
      this.lutInfoName.textContent = 'None';
      this.requestRender();
      return;
    }

    const name = cardElement.querySelector('.preset-name').textContent;
    this.lutInfoName.textContent = `Processing ${name}...`;

    if (this.lutCache.has(file)) {
      const cached = this.lutCache.get(file);
      this.pipeline.setLutData(cached.size, cached.data);
      this.lutInfoName.textContent = name;
      this.requestRender();
      return;
    }

    cardElement.classList.add('processing');
    try {
      const response = await fetch(`${LUT_BASE_URL}${file}`);
      const text = await response.getReader ? await this.readStreamAsText(response) : await response.text();
      const lutData = CubeParser.parse(text);
      this.lutCache.set(file, lutData);
      this.pipeline.setLutData(lutData.size, lutData.data);
      this.lutInfoName.textContent = name;
      this.requestRender();
    } catch (e) {
      this.lutInfoName.textContent = 'Error loading LUT';
    } finally {
      cardElement.classList.remove('processing');
    }
  }

  async readStreamAsText(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  }

  exportImage() {
    this.showExportModal(false);
  }

  resetViewport() {
    if (!this.activeImage) {
      return;
    }
    this.zoom = 1.0;
    const wrapperW = this.viewportContainer.clientWidth;
    const wrapperH = this.viewportContainer.clientHeight;
    const imgAspect = this.activeImage.naturalWidth / this.activeImage.naturalHeight;
    const containerAspect = (wrapperW - 48) / (wrapperH - 48);

    let targetWidth = 0;
    let targetHeight = 0;
    if (imgAspect > containerAspect) {
      targetWidth = wrapperW - 48;
      targetHeight = (wrapperW - 48) / imgAspect;
    } else {
      targetHeight = wrapperH - 48;
      targetWidth = (wrapperH - 48) * imgAspect;
    }

    this.panX = Math.round((wrapperW - targetWidth) / 2);
    this.panY = Math.round((wrapperH - targetHeight) / 2);
    this.updateViewportTransform();
  }

  updateViewportTransform() {
    this.canvasContainer.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0px) scale(${this.zoom})`;
  }

  resetAllAdjustments() {
    this.state.temperature = 0.0;
    this.state.tint = 0.0;
    this.state.shadows = 0.0;
    this.state.highlights = 0.0;
    this.state.denoise = 0.0;
    this.state.sharpen = 0.0;
    this.state.clarity = 0.0;
    this.state.exposure = 0.0;
    this.state.contrast = 0.0;
    this.state.saturation = 0.0;
    this.state.vibrance = 0.0;
    this.state.vignette = 0.0;
    this.state.lutIntensity = 1.0;
    this.state.chromaticAberration = 0.0;
    this.state.grain = 0.0;
    this.state.vintage = 0.0;

    Object.keys(this.sliders).forEach((key) => {
      const slider = this.sliders[key];
      if (slider) {
        if (key === 'lutIntensity') {
          slider.value = 1.0;
        } else {
          slider.value = 0.0;
        }
        this.updateBadge(key);
      }
    });

    this.requestRender();
  }

  initFooterResize() {
    const handle = this.footerResizeHandle;
    if (!handle) return;

    const onStart = (clientY) => {
      this.isResizingFooter = true;
      this.footerStartY = clientY;
      this.footerStartHeight = this.appFooter.getBoundingClientRect().height;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    };

    const onMove = (clientY) => {
      if (!this.isResizingFooter) return;
      const delta = this.footerStartY - clientY;
      const viewportHeight = window.innerHeight;
      const maxHeight = viewportHeight * 0.6;
      const minHeight = 80;
      const newHeight = Math.max(
        minHeight,
        Math.min(maxHeight, this.footerStartHeight + delta)
      );
      this.appLayout.style.gridTemplateRows =
        `auto 1fr ${newHeight}px`;
    };

    const onEnd = () => {
      if (!this.isResizingFooter) return;
      this.isResizingFooter = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (this.activeImage) {
        this.adjustCanvasSize();
        this.resetViewport();
      }
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart(e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isResizingFooter) onMove(e.clientY);
    });

    window.addEventListener('mouseup', () => onEnd());

    handle.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        onStart(e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isResizingFooter && e.touches.length === 1) {
        onMove(e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => onEnd());
  }

  toggleBatchDrawer() {
    this.batchDrawer.classList.toggle('open');
  }

  hideBatchDrawer() {
    this.batchDrawer.classList.remove('open');
  }

  updateBatchQueueUI() {
    this.batchCountBadge.textContent = this.batchQueue.length;
    this.batchList.innerHTML = '';

    this.batchQueue.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = `batch-item${index === this.batchIndex ? ' active' : ''}`;

      let statusText = 'Ready';
      if (item.status === 'processing') {
        statusText = 'Processing...';
      } else if (item.status === 'done') {
        statusText = 'Completed';
      }

      el.innerHTML = `
        <img class="batch-thumb" src="${item.url}" alt="${item.name}">
        <div class="batch-item-info">
          <div class="batch-item-name">${item.name}</div>
          <div class="batch-item-status">${statusText}</div>
        </div>
        <button class="batch-item-remove" data-index="${index}">&times;</button>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('batch-item-remove')) {
          e.stopPropagation();
          this.removeBatchItem(parseInt(e.target.dataset.index));
          return;
        }
        this.loadBatchItem(index);
      });

      this.batchList.appendChild(el);
    });

    this.batchExportBtn.disabled = this.batchQueue.length === 0;
  }

  loadBatchItem(index) {
    if (index < 0 || index >= this.batchQueue.length) {
      return;
    }
    this.batchIndex = index;
    const item = this.batchQueue[index];
    this.activeImage = item.img;
    this.activeExif = item.exif;

    this.pipeline.setImage(item.img);
    this.originalView.src = item.url;
    this.viewportFallback.style.display = 'none';
    this.canvasContainer.style.display = 'block';
    this.exportBtn.removeAttribute('disabled');
    this.splitSlider.style.left = `${this.state.splitPosition * 100}%`;
    this.processedWrapper.style.width = `${this.state.splitPosition * 100}%`;

    this.adjustCanvasSize();
    this.resetViewport();
    this.updateBatchQueueUI();
    this.requestRender();
  }

  removeBatchItem(index) {
    const item = this.batchQueue[index];
    URL.revokeObjectURL(item.url);
    this.batchQueue.splice(index, 1);

    if (this.batchQueue.length === 0) {
      this.batchIndex = -1;
      this.activeImage = null;
      this.activeExif = null;
      this.canvasContainer.style.display = 'none';
      this.viewportFallback.style.display = 'flex';
      this.exportBtn.setAttribute('disabled', 'true');
    } else if (this.batchIndex === index) {
      this.loadBatchItem(Math.max(0, index - 1));
    } else if (this.batchIndex > index) {
      this.batchIndex--;
    }

    this.updateBatchQueueUI();
  }

  clearBatchQueue() {
    this.batchQueue.forEach(item => URL.revokeObjectURL(item.url));
    this.batchQueue = [];
    this.batchIndex = -1;
    this.activeImage = null;
    this.activeExif = null;
    this.canvasContainer.style.display = 'none';
    this.viewportFallback.style.display = 'flex';
    this.exportBtn.setAttribute('disabled', 'true');
    this.updateBatchQueueUI();
  }

  showExportModal(isBatch = false) {
    if (!this.activeImage && !isBatch) {
      return;
    }
    this.isBatchExportPending = isBatch;

    if (isBatch) {
      this.exportFilename.value = 'framealch_batch';
      this.exifRow.style.display = 'block';
      this.exportExif.checked = true;
    } else {
      const activeName = this.batchIndex >= 0 ? this.batchQueue[this.batchIndex].name : 'capture';
      const baseName = activeName.substring(0, activeName.lastIndexOf('.')) || activeName;
      this.exportFilename.value = `framealch_${baseName}`;

      if (this.activeExif) {
        this.exifRow.style.display = 'block';
        this.exportExif.checked = true;
      } else {
        this.exifRow.style.display = 'none';
        this.exportExif.checked = false;
      }
    }

    this.toggleFormatRows();
    this.exportModal.classList.add('open');
  }

  hideExportModal() {
    this.exportModal.classList.remove('open');
  }

  toggleFormatRows() {
    const isJpeg = this.exportFormat.value === 'image/jpeg';
    this.qualityRow.style.display = isJpeg ? 'block' : 'none';
    if (!isJpeg) {
      this.exifRow.style.display = 'none';
    } else if (!this.isBatchExportPending && !this.activeExif) {
      this.exifRow.style.display = 'none';
    } else {
      this.exifRow.style.display = 'block';
    }
  }

  runBatchExport() {
    this.showExportModal(true);
  }

  async triggerCustomExport() {
    const settings = {
      filename: this.exportFilename.value.trim() || 'framealch_capture',
      format: this.exportFormat.value,
      quality: parseFloat(this.exportQuality.value) / 100,
      scale: parseFloat(this.exportScale.value),
      stitchExif: this.exportExif.checked
    };

    this.hideExportModal();

    if (this.isBatchExportPending) {
      await this.runBatchExportProcessing(settings);
    } else {
      await this.runSingleExportProcessing(settings);
    }
  }

  async runSingleExportProcessing(settings) {
    if (!this.activeImage) {
      return;
    }

    this.pipeline.setupResolution(true);
    this.pipeline.render(this.state);

    const blob = await new Promise((resolve) => {
      this.canvas.toBlob((b) => resolve(b), settings.format, settings.quality);
    });

    let outputBuffer = await blob.arrayBuffer();
    if (settings.stitchExif && this.activeExif) {
      outputBuffer = ExifStitcher.insertExif(outputBuffer, this.activeExif);
    }

    const outputBlob = new Blob([outputBuffer], { type: settings.format });
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement('a');

    const ext = settings.format === 'image/png' ? 'png' : 'jpg';
    link.download = `${settings.filename}.${ext}`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);

    this.pipeline.setupResolution(false);
    this.adjustCanvasSize();
    this.requestRender();
  }

  async runBatchExportProcessing(settings) {
    this.batchExportBtn.disabled = true;
    this.batchExportBtn.textContent = 'Processing...';

    for (let i = 0; i < this.batchQueue.length; i++) {
      const item = this.batchQueue[i];
      item.status = 'processing';
      this.updateBatchQueueUI();

      this.pipeline.setImage(item.img);

      const originalW = item.img.naturalWidth;
      const originalH = item.img.naturalHeight;
      const targetW = Math.round(originalW * settings.scale);
      const targetH = Math.round(originalH * settings.scale);

      this.pipeline.width = targetW;
      this.pipeline.height = targetH;
      this.pipeline.canvas.width = targetW;
      this.pipeline.canvas.height = targetH;

      this.pipeline.render(this.state);

      const blob = await new Promise((resolve) => {
        this.canvas.toBlob((b) => resolve(b), settings.format, settings.quality);
      });

      let outputBuffer = await blob.arrayBuffer();
      if (settings.stitchExif && item.exif) {
        outputBuffer = ExifStitcher.insertExif(outputBuffer, item.exif);
      }

      const outputBlob = new Blob([outputBuffer], { type: settings.format });
      const url = URL.createObjectURL(outputBlob);
      const link = document.createElement('a');

      const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
      const ext = settings.format === 'image/png' ? 'png' : 'jpg';
      link.download = `${settings.filename}_${baseName}.${ext}`;
      link.href = url;
      link.click();

      URL.revokeObjectURL(url);
      item.status = 'done';
      this.updateBatchQueueUI();

      await new Promise(r => setTimeout(r, 600));
    }

    if (this.batchIndex >= 0) {
      const currentItem = this.batchQueue[this.batchIndex];
      this.pipeline.setImage(currentItem.img);
      this.adjustCanvasSize();
      this.requestRender();
    }

    this.batchExportBtn.disabled = false;
    this.batchExportBtn.textContent = 'Export Entire Queue';
    this.isBatchExportPending = false;
  }

  async openCamera() {
    if (this.cameraStream) {
      this.closeCamera();
    }
    this.cameraModal.classList.add('open');
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.currentFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
    } catch (e) {
      try {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err) {
        alert('Could not access camera: ' + err.message);
        this.cameraModal.classList.remove('open');
        return;
      }
    }

    let isFront = true;
    const track = this.cameraStream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      if (settings && settings.facingMode) {
        if (settings.facingMode === 'environment') {
          isFront = false;
        }
      } else if (track.label) {
        const label = track.label.toLowerCase();
        if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
          isFront = false;
        }
      }
    }

    if (isFront) {
      this.cameraVideo.classList.add('mirrored');
    } else {
      this.cameraVideo.classList.remove('mirrored');
    }

    this.cameraVideo.srcObject = this.cameraStream;
    this.cameraVideo.play().catch(() => { });
  }

  closeCamera() {
    this.cameraModal.classList.remove('open');
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    this.cameraVideo.srcObject = null;
  }

  captureCameraFrame() {
    if (!this.cameraVideo.videoWidth) return;
    const canvas = document.createElement('canvas');
    const w = this.cameraVideo.videoWidth;
    const h = this.cameraVideo.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (this.cameraVideo.classList.contains('mirrored')) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.cameraVideo, 0, 0, w, h);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `live_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        this.handleImageFiles([file]);
        this.closeCamera();
      }
    }, 'image/jpeg', 0.95);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new FrameAlchApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').catch(() => { });
  }
});
