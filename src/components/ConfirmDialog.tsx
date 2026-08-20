import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <dialog>-based confirm. Used instead of window.confirm so the page
 * never blocks and the sheet matches the rest of the product.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="dialog-body">
        <h2>{title}</h2>
        {children}
      </div>
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className={`btn ${danger ? "btn--danger" : "btn--primary"}`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
