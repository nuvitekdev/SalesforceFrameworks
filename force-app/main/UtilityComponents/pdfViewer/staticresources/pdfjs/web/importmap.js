// Import map configuration for PDF.js viewer
const importMap = {
  "imports": {
    "pdfjs/": "../src/",
    "pdfjs-lib": "../src/pdf.js",
    "pdfjs-web/": "./",

    "fluent-bundle": "../node_modules/@fluent/bundle/esm/index.js",
    "fluent-dom": "../node_modules/@fluent/dom/esm/index.js",
    "cached-iterable": "../node_modules/cached-iterable/src/index.mjs",

    "display-cmap_reader_factory": "../src/display/cmap_reader_factory.js",
    "display-standard_fontdata_factory": "../src/display/standard_fontdata_factory.js",
    "display-wasm_factory": "../src/display/wasm_factory.js",
    "display-fetch_stream": "../src/display/fetch_stream.js",
    "display-network": "../src/display/network.js",
    "display-node_stream": "../src/display/stubs.js",
    "display-node_utils": "../src/display/stubs.js",

    "web-alt_text_manager": "./alt_text_manager.js",
    "web-annotation_editor_params": "./annotation_editor_params.js",
    "web-download_manager": "./download_manager.js",
    "web-external_services": "./genericcom.js",
    "web-new_alt_text_manager": "./new_alt_text_manager.js",
    "web-null_l10n": "./genericl10n.js",
    "web-pdf_attachment_viewer": "./pdf_attachment_viewer.js",
    "web-pdf_cursor_tools": "./pdf_cursor_tools.js",
    "web-pdf_document_properties": "./pdf_document_properties.js",
    "web-pdf_find_bar": "./pdf_find_bar.js",
    "web-pdf_layer_viewer": "./pdf_layer_viewer.js",
    "web-pdf_outline_viewer": "./pdf_outline_viewer.js",
    "web-pdf_presentation_mode": "./pdf_presentation_mode.js",
    "web-pdf_sidebar": "./pdf_sidebar.js",
    "web-pdf_thumbnail_viewer": "./pdf_thumbnail_viewer.js",
    "web-preferences": "./genericcom.js",
    "web-print_service": "./pdf_print_service.js",
    "web-secondary_toolbar": "./secondary_toolbar.js",
    "web-signature_manager": "./signature_manager.js",
    "web-toolbar": "./toolbar.js"
  }
};

// Register the import map
const importMapElement = document.createElement('script');
importMapElement.type = 'importmap';
importMapElement.textContent = JSON.stringify(importMap);
document.currentScript.after(importMapElement); 