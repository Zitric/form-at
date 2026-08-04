// Set-upload feature (PR4). `fetch()` has no upload-progress API (verified
// 2026 — no `onUploadProgress`, and the ReadableStream-request-body
// workaround has inconsistent cross-browser support) —
// `XMLHttpRequest.upload.onprogress` remains the standard, fully-supported
// mechanism for tracking a large upload's progress, which is the entire
// reason this exists instead of a plain `fetch` PUT.
//
// PUTs the file as a raw ArrayBuffer with NO manually-set headers — not
// even Content-Type. `signQuery: true` presigning (r2Sets.ts) only signs
// the `Host` header by default; a header the client adds that R2 doesn't
// expect signed gets the request rejected. Browsers don't auto-add a
// Content-Type for an ArrayBuffer body the way they do for a Blob/File body,
// so this sidesteps the mismatch entirely rather than trying to get the
// signed/sent headers to agree.
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
