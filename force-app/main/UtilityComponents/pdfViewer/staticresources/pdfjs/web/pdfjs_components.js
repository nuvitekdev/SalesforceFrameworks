/* Copyright 2023 PDF.js Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This module provides fallback implementations for common components imported 
 * from pdfjs-lib, and dynamically attempts to import the real implementations.
 * Use this to avoid import errors when the ES module system can't resolve 
 * the "pdfjs-lib" alias properly.
 */

// ===== Fallback implementations =====

// AnnotationMode enum
export const AnnotationMode = {
  DISABLE: 0,
  ENABLE: 1,
  ENABLE_FORMS: 2,
  ENABLE_STORAGE: 3
};

// AnnotationType enum
export const AnnotationType = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26
};

// PixelsPerInch class
export class PixelsPerInch {
  static CSS = 96.0;
  static PDF = 72.0;
  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
}

// RenderingCancelledException class
export class RenderingCancelledException extends Error {
  constructor(msg, type) {
    super(msg);
    this.name = "RenderingCancelledException";
    this.type = type;
  }
}

// OutputScale class
export class OutputScale {
  constructor() {
    this.sx = 1.0;
    this.sy = 1.0;
    this.scaled = false;
  }
}

// Utility functions
export function shadow(obj, prop, value) {
  Object.defineProperty(obj, prop, {
    value,
    enumerable: true,
    configurable: true,
    writable: false,
  });
  return value;
}

export function normalizeUnicode(str) {
  return str ? str.normalize("NFC") : str;
}

export function stopEvent(event) {
  event.stopPropagation();
  event.preventDefault();
}

export function noContextMenu(event) {
  event.preventDefault();
}

export const Util = {
  applyTransform(p, m) {
    const xt = p[0] * m[0] + p[1] * m[2] + m[4];
    const yt = p[0] * m[1] + p[1] * m[3] + m[5];
    return [xt, yt];
  },
  applyInverseTransform(p, m) {
    const d = m[0] * m[3] - m[1] * m[2];
    const xt = (p[0] * m[3] - p[1] * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const yt = (-p[0] * m[1] + p[1] * m[0] + m[4] * m[1] - m[0] * m[5]) / d;
    return [xt, yt];
  }
};

// Placeholder for classes that require a DOM implementation
export const AnnotationLayer = {
  render: () => {},
  update: () => {},
};

export const DrawLayer = {
  render: () => {},
};

export const TextLayer = {
  render: () => {},
  update: () => {},
};

export const ColorPicker = class {
  static get(_color) {
    return {
      element: document.createElement("div"),
    };
  }
};

// Placeholder for utility functions
export function setLayerDimensions() {}
export function isPdfFile() { return false; }
export function createValidAbsoluteUrl(url, baseUrl) { return url; }
export function getXfaPageViewport(xfaPage, { scale = 1.0 }) {
  const { width, height } = xfaPage.attributes || { width: 612, height: 792 };
  return {
    width: width * scale,
    height: height * scale,
    scale
  };
}

// PDFDataRangeTransport class (placeholder)
export class PDFDataRangeTransport {
  constructor() {
    this.length = 0;
  }
}

// Try to import the real implementations from pdfjs-lib
try {
  // We need to use a dynamic import here since we can't use top-level await
  const importPromise = import("pdfjs-lib");
  
  importPromise.then(module => {
    // Update our exported objects with the real implementations
    // For enums and simple objects
    if (module.AnnotationMode) Object.assign(AnnotationMode, module.AnnotationMode);
    if (module.AnnotationType) Object.assign(AnnotationType, module.AnnotationType);
    
    // For utility functions
    if (module.shadow) {
      // We can't export the imported function directly, but we can assign it
      // to our exported variable name
      Object.defineProperty(exports, "shadow", {
        value: module.shadow,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.normalizeUnicode) {
      Object.defineProperty(exports, "normalizeUnicode", {
        value: module.normalizeUnicode,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.stopEvent) {
      Object.defineProperty(exports, "stopEvent", {
        value: module.stopEvent,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.noContextMenu) {
      Object.defineProperty(exports, "noContextMenu", {
        value: module.noContextMenu,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.Util) Object.assign(Util, module.Util);
    if (module.setLayerDimensions) {
      Object.defineProperty(exports, "setLayerDimensions", {
        value: module.setLayerDimensions,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.isPdfFile) {
      Object.defineProperty(exports, "isPdfFile", {
        value: module.isPdfFile,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.createValidAbsoluteUrl) {
      Object.defineProperty(exports, "createValidAbsoluteUrl", {
        value: module.createValidAbsoluteUrl,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.getXfaPageViewport) {
      Object.defineProperty(exports, "getXfaPageViewport", {
        value: module.getXfaPageViewport,
        writable: true,
        enumerable: true,
      });
    }
    
    // For classes, we can't easily update constructor prototypes
    // But for simple classes like PixelsPerInch, we can copy static properties
    if (module.PixelsPerInch) {
      Object.assign(PixelsPerInch, module.PixelsPerInch);
    }
    
    // For complex classes with methods, we can replace our exported reference
    if (module.AnnotationLayer) {
      Object.defineProperty(exports, "AnnotationLayer", {
        value: module.AnnotationLayer,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.DrawLayer) {
      Object.defineProperty(exports, "DrawLayer", {
        value: module.DrawLayer,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.TextLayer) {
      Object.defineProperty(exports, "TextLayer", {
        value: module.TextLayer,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.ColorPicker) {
      Object.defineProperty(exports, "ColorPicker", {
        value: module.ColorPicker,
        writable: true,
        enumerable: true,
      });
    }
    
    if (module.PDFDataRangeTransport) {
      Object.defineProperty(exports, "PDFDataRangeTransport", {
        value: module.PDFDataRangeTransport,
        writable: true,
        enumerable: true,
      });
    }
    
    console.log("Successfully imported components from pdfjs-lib");
  }).catch(error => {
    console.warn("Failed to import from pdfjs-lib, using fallback implementations:", error);
  });
} catch (error) {
  console.warn("Failed to start dynamic import from pdfjs-lib:", error);
}