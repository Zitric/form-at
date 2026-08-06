// XHR rather than `fetch` deliberately: `fetch` has no upload-progress API (no
// `onUploadProgress`, and the ReadableStream-request-body workaround has
// inconsistent cross-browser support), so `XMLHttpRequest.upload.onprogress`
// is the only fully-supported way to track a large upload's progress.
//
// PUTs the file as a raw ArrayBuffer with NO manually-set headers, not even
// Content-Type. `signQuery: true` presigning (r2Sets.ts) signs only `Host`, and
// any header the client adds that R2 doesn't expect signed rejects the request.
// Browsers don't auto-add a Content-Type for an ArrayBuffer body the way they
// do for Blob/File — which is what sidesteps the mismatch, so don't switch the
// body type.
export function uploadWithProgress(
  url: string,
  body: ArrayBuffer,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload failed: network error"));
    xhr.onabort = () => reject(new Error("upload aborted"));
    xhr.send(body);
  });
}
