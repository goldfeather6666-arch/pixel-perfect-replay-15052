// Copy text to the clipboard. The async Clipboard API is the primary path; a hidden textarea
// with the legacy copy command is the fallback for browsers where it is unavailable
// (insecure origins, older Safari, embedded webviews).
export type ClipboardLike = { writeText?: (text: string) => Promise<void> } | undefined;

export type CopyField = {
  value: string;
  style: Record<string, string>;
  focus: () => void;
  select: () => void;
};

export type CopyDocument = {
  body: { appendChild: (field: CopyField) => unknown; removeChild: (field: CopyField) => unknown } | null;
  createElement: (tag: "textarea") => CopyField;
  execCommand?: (command: string) => boolean;
} | undefined;

export async function copyToClipboard(
  text: string,
  clipboard: ClipboardLike,
  doc: CopyDocument,
): Promise<boolean> {
  if (!text) return false;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard blocked (permissions or insecure origin): fall through to the legacy path.
    }
  }
  if (!doc?.body || !doc.execCommand) return false;
  let field: CopyField | undefined;
  try {
    field = doc.createElement("textarea");
    field.value = text;
    field.style["position"] = "fixed";
    field.style["top"] = "0";
    field.style["left"] = "0";
    field.style["opacity"] = "0";
    doc.body.appendChild(field);
    field.focus();
    field.select();
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    if (field) {
      try {
        doc.body.removeChild(field);
      } catch {
        // Field was already detached; nothing to clean up.
      }
    }
  }
}

// Browser entry point: resolves the real clipboard and document, guarded for server rendering.
export function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : (navigator.clipboard as ClipboardLike);
  // The textarea element satisfies CopyField at runtime; the DOM typings are too wide to express it.
  const doc = typeof document === "undefined" ? undefined : (document as unknown as CopyDocument);
  return copyToClipboard(text, clipboard, doc);
}
