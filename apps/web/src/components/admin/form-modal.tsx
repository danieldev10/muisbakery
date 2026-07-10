"use client";

import { Plus, X } from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { FormFeedback, SubmitButton } from "@/components/admin/form-controls";
import { type FormState, initialFormState } from "@/lib/admin/types";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

type ModalControls = {
  close: () => void;
};

type ModalChildren = ReactNode | ((controls: ModalControls) => ReactNode);

type AdminModalProps = {
  children: ModalChildren;
  description?: string;
  eyebrow?: string;
  title: string;
  triggerLabel: string;
  triggerTitle?: string;
  widthClassName?: string;
};

const triggerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[var(--brand-burgundy-dark)] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)]";

function renderModalChildren(children: ModalChildren, controls: ModalControls) {
  return typeof children === "function" ? children(controls) : children;
}

function ModalFrame({
  children,
  description,
  eyebrow = "Admin",
  onClose,
  title,
  widthClassName = "max-w-2xl",
}: {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  onClose: () => void;
  title: string;
  widthClassName?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--brand-near-black)]/60 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div
        className={`flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-white shadow-[var(--shadow-panel)] ${widthClassName}`}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-[color:var(--border-muted)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[1.3px] text-[var(--brand-burgundy)]">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-[var(--text-primary)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close modal"
            className="inline-flex size-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalTrigger({
  onClick,
  title,
  triggerLabel,
}: {
  onClick: () => void;
  title?: string;
  triggerLabel: string;
}) {
  return (
    <button
      className={triggerButtonClass}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Plus aria-hidden className="size-4" />
      {triggerLabel}
    </button>
  );
}

export function AdminModal({
  children,
  description,
  eyebrow,
  title,
  triggerLabel,
  triggerTitle,
  widthClassName,
}: AdminModalProps) {
  const [open, setOpen] = useState(false);
  const controls = { close: () => setOpen(false) };

  return (
    <>
      <ModalTrigger
        onClick={() => setOpen(true)}
        title={triggerTitle}
        triggerLabel={triggerLabel}
      />

      {open ? (
        <ModalFrame
          description={description}
          eyebrow={eyebrow}
          onClose={controls.close}
          title={title}
          widthClassName={widthClassName}
        >
          {renderModalChildren(children, controls)}
        </ModalFrame>
      ) : null}
    </>
  );
}

function ModalActionForm({
  action,
  children,
  onClose,
  submitLabel,
}: {
  action: Action;
  children: ReactNode;
  onClose: () => void;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onClose();
    }
  }, [onClose, state.ok, state.token]);

  return (
    <form action={formAction} className="grid gap-4" ref={formRef}>
      {children}
      {state.error ? <FormFeedback state={state} /> : null}
      <div className="flex justify-end gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-warm)]"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function AdminFormModal({
  action,
  children,
  description,
  eyebrow,
  submitLabel,
  title,
  triggerLabel,
  triggerTitle,
  widthClassName,
}: Omit<AdminModalProps, "children"> & {
  action: Action;
  children: ReactNode;
  submitLabel: string;
}) {
  return (
    <AdminModal
      description={description}
      eyebrow={eyebrow}
      title={title}
      triggerLabel={triggerLabel}
      triggerTitle={triggerTitle}
      widthClassName={widthClassName}
    >
      {({ close }) => (
        <ModalActionForm
          action={action}
          onClose={close}
          submitLabel={submitLabel}
        >
          {children}
        </ModalActionForm>
      )}
    </AdminModal>
  );
}
