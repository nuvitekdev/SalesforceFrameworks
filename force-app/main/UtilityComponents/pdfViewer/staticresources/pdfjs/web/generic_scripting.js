/* Copyright 2020 Mozilla Foundation
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

// Implementation of the missing function
function getPdfFilenameFromUrl(url) {
  if (!url) {
    return "document.pdf";
  }
  // Remove query string and hash parameters.
  const urlWithoutHash = url.split("#")[0];
  const urlWithoutQuery = urlWithoutHash.split("?")[0];
  
  // Decode URI-encoded characters.
  let path = decodeURIComponent(urlWithoutQuery);
  
  // Remove protocol and domain if present.
  const protocolIndex = path.search(/^[a-z]+:\/\//i);
  if (protocolIndex !== -1) {
    path = path.substring(path.search(/\//, protocolIndex + 3) + 1);
  }

  // Get the filename.
  const parts = path.split(/\/|\\/);
  const filename = parts.pop() || "document.pdf";
  
  return filename;
}

async function docProperties(pdfDocument) {
  const url = "",
    baseUrl = url.split("#", 1)[0];
  const { info, metadata, contentDispositionFilename, contentLength } =
    await pdfDocument.getMetadata();

  return {
    ...info,
    baseURL: baseUrl,
    filesize: contentLength || (await pdfDocument.getDownloadInfo()).length,
    filename: contentDispositionFilename || getPdfFilenameFromUrl(url),
    metadata: metadata?.getRaw(),
    authors: metadata?.get("dc:creator"),
    numPages: pdfDocument.numPages,
    URL: url,
  };
}

class GenericScripting {
  constructor(sandboxBundleSrc) {
    this._ready = new Promise((resolve, reject) => {
      const sandbox =
        typeof PDFJSDev === "undefined"
          ? import(sandboxBundleSrc) // eslint-disable-line no-unsanitized/method
          : __raw_import__(sandboxBundleSrc);
      sandbox
        .then(pdfjsSandbox => {
          resolve(pdfjsSandbox.QuickJSSandbox());
        })
        .catch(reject);
    });
  }

  async createSandbox(data) {
    const sandbox = await this._ready;
    sandbox.create(data);
  }

  async dispatchEventInSandbox(event) {
    const sandbox = await this._ready;
    setTimeout(() => sandbox.dispatchEvent(event), 0);
  }

  async destroySandbox() {
    const sandbox = await this._ready;
    sandbox.nukeSandbox();
  }
}

export { docProperties, GenericScripting };
