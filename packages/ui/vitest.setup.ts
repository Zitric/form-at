import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement HTMLDialogElement.showModal()/close() — polyfill
// just enough for Modal to mount/unmount as it would in a real browser.
// Real browsers also focus the first focusable child on showModal(), which is
// what lets keydown events bubble up to onKeyDown on the dialog. Without that
// focus shift, keydown would fire on body instead and never reach the dialog.
const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function () {
    this.setAttribute("open", "");
    const focusable = this.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
  };
  dialogProto.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
