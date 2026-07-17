import { useEffect, useRef } from "react";

const activeLayers = [];
let scrollLockCount = 0;
let previousBodyOverflow = "";
const backgroundStates = new Map();

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function removeLayer(layer) {
  const index = activeLayers.lastIndexOf(layer);
  if (index >= 0) activeLayers.splice(index, 1);
}

function updateBackgroundIsolation() {
  const topDialog = [...activeLayers]
    .reverse()
    .find((layer) => layer.isolateBackground);
  if (!topDialog) {
    backgroundStates.forEach(({ inert, ariaHidden }, element) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    });
    backgroundStates.clear();
    return;
  }

  for (const element of document.body.children) {
    if (!backgroundStates.has(element)) {
      backgroundStates.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      });
    }
    const original = backgroundStates.get(element);
    const hidden = element !== topDialog.portalRoot;
    element.inert = hidden ? true : original.inert;
    if (hidden) element.setAttribute("aria-hidden", "true");
    else if (original.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", original.ariaHidden);
  }
}

/**
 * Keeps Escape and outside-click dismissal consistent across dialogs, menus,
 * and popovers. Only the top-most open layer responds, so Escape closes a
 * nested menu before its parent modal.
 */
export function useDismissibleLayer({
  open = true,
  layerRef,
  onDismiss,
  dismissOnEscape = true,
  dismissOnPointerOutside = true,
  trapFocus = false,
  lockScroll = false,
  restoreFocus = false,
  initialFocusRef,
} = {}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open || typeof dismissRef.current !== "function") return undefined;

    const previouslyFocused = document.activeElement;
    const layerNode = layerRef?.current;
    const layer = {
      layerRef,
      isolateBackground: trapFocus,
      portalRoot: layerNode?.closest?.("body > *"),
    };
    activeLayers.push(layer);
    if (trapFocus) updateBackgroundIsolation();

    if (lockScroll) {
      if (scrollLockCount === 0) {
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      scrollLockCount += 1;
    }

    const isTopLayer = () => activeLayers.at(-1) === layer;

    const handleKeyDown = (event) => {
      if (trapFocus && event.key === "Tab" && isTopLayer()) {
        const node = layerRef?.current;
        const focusable = node
          ? [...node.querySelectorAll(focusableSelector)].filter(
              (element) => element.getAttribute("aria-hidden") !== "true",
            )
          : [];
        if (!focusable.length) {
          event.preventDefault();
          node?.focus?.();
          return;
        }

        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      if (!dismissOnEscape || event.key !== "Escape" || !isTopLayer()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dismissRef.current?.();
    };

    const handleFocusIn = (event) => {
      if (!trapFocus || !isTopLayer()) return;
      const node = layerRef?.current;
      if (!node || node.contains(event.target)) return;
      const firstFocusable = node.querySelector(focusableSelector);
      (firstFocusable || node).focus?.();
    };

    const handlePointerDown = (event) => {
      if (!dismissOnPointerOutside || !isTopLayer()) return;
      const node = layerRef?.current;
      if (node?.contains(event.target)) return;
      dismissRef.current?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);

    if (trapFocus) {
      requestAnimationFrame(() => {
        if (!isTopLayer()) return;
        const node = layerRef?.current;
        const initial =
          initialFocusRef?.current ||
          node?.querySelector("[autofocus]") ||
          node?.querySelector(focusableSelector) ||
          node;
        initial?.focus?.();
      });
    }

    return () => {
      removeLayer(layer);
      if (trapFocus) updateBackgroundIsolation();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      if (lockScroll) {
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount === 0) {
          document.body.style.overflow = previousBodyOverflow;
        }
      }
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus?.();
      }
    };
  }, [
    dismissOnEscape,
    dismissOnPointerOutside,
    layerRef,
    lockScroll,
    open,
    restoreFocus,
    trapFocus,
    initialFocusRef,
  ]);
}
