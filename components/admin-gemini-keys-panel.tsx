"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createGeminiKeyFormAction,
  deleteGeminiKeyAction,
  rotateGeminiKeyFormAction,
  setUserGeminiAssignmentAction,
  updateGeminiKeyLabelFormAction,
  type GeminiKeyActionState
} from "@/components/admin-gemini-keys-actions";
import type { GeminiKeyPublic, UserAssignmentRow } from "@/lib/gemini-api-keys";

type Props = {
  keys: GeminiKeyPublic[];
  assignments: UserAssignmentRow[];
};

const initialActionState: GeminiKeyActionState = { ok: true };

function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="error-text admin-form-error">{message}</p>;
}

export function AdminGeminiKeysPanel({ keys, assignments }: Props) {
  const router = useRouter();
  const [createState, createAction, createPending] = useActionState(
    createGeminiKeyFormAction,
    initialActionState
  );
  const createFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createState.ok && !createPending) {
      createFormRef.current?.reset();
      router.refresh();
    }
  }, [createState.ok, createPending, router]);

  return (
    <div className="admin-gemini-keys">
      <div className="admin-gemini-keys-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Gemini API keys</h1>
          <p className="admin-gemini-keys-lead">
            Keys are encrypted with{" "}
            <code className="inline-code">GEMINI_KEYS_MASTER_SECRET</code> before
            storage. Assign a key to each user, or leave unassigned to fall back to{" "}
            <code className="inline-code">GEMINI_API_KEY</code>.
          </p>
        </div>
        <Link className="ghost-button" href="/app">
          Back to chat
        </Link>
      </div>

      <section className="admin-card">
        <h2>Add key</h2>
        <form ref={createFormRef} action={createAction} className="admin-form">
          <label className="admin-field">
            <span>Label</span>
            <input name="label" type="text" required maxLength={120} />
          </label>
          <label className="admin-field">
            <span>API key (stored encrypted)</span>
            <input name="apiKey" type="password" required autoComplete="off" />
          </label>
          <button className="primary-button" disabled={createPending} type="submit">
            {createPending ? "Saving…" : "Add key"}
          </button>
          <FormError message={createState.ok ? undefined : createState.error} />
        </form>
      </section>

      <section className="admin-card">
        <h2>Keys</h2>
        {keys.length === 0 ? (
          <p className="admin-empty">No keys yet.</p>
        ) : (
          <ul className="admin-key-list">
            {keys.map((key) => (
              <li className="admin-key-item" key={key.id}>
                <div className="admin-key-meta">
                  <strong>{key.label}</strong>
                  <span className="admin-key-last4">…{key.last4}</span>
                </div>
                <AdminKeyRowForms geminiKey={key} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card">
        <h2>User assignments</h2>
        <p className="admin-gemini-keys-lead">
          Each user can have at most one assigned key. Clearing assignment uses the
          global fallback key when configured.
        </p>
        <ul className="admin-assign-list">
          {assignments.map((row) => (
            <li className="admin-assign-row" key={row.userId}>
              <UserAssignmentRowForm keys={keys} row={row} />
            </li>
          ))}
        </ul>
        {assignments.length === 0 ? <p className="admin-empty">No users.</p> : null}
      </section>
    </div>
  );
}

function AdminKeyRowForms({ geminiKey }: { geminiKey: GeminiKeyPublic }) {
  const router = useRouter();
  const [labelState, labelAction, labelPending] = useActionState(
    updateGeminiKeyLabelFormAction,
    initialActionState
  );
  const [rotateState, rotateAction, rotatePending] = useActionState(
    rotateGeminiKeyFormAction,
    initialActionState
  );
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (labelState.ok && !labelPending) {
      router.refresh();
    }
  }, [labelState.ok, labelPending, router]);

  useEffect(() => {
    if (rotateState.ok && !rotatePending) {
      router.refresh();
    }
  }, [rotateState.ok, rotatePending, router]);

  return (
    <div className="admin-key-forms">
      <form action={labelAction} className="admin-form admin-form-inline">
        <input name="id" type="hidden" value={geminiKey.id} />
        <label className="admin-field">
          <span className="sr-only">Label</span>
          <input
            defaultValue={geminiKey.label}
            name="label"
            type="text"
            maxLength={120}
          />
        </label>
        <button className="ghost-button" disabled={labelPending} type="submit">
          {labelPending ? "…" : "Save label"}
        </button>
        <FormError message={labelState.ok ? undefined : labelState.error} />
      </form>

      <form action={rotateAction} className="admin-form">
        <input name="id" type="hidden" value={geminiKey.id} />
        <label className="admin-field">
          <span>Rotate API key</span>
          <input name="apiKey" type="password" autoComplete="off" />
        </label>
        <button className="ghost-button" disabled={rotatePending} type="submit">
          {rotatePending ? "Updating…" : "Rotate secret"}
        </button>
        <FormError message={rotateState.ok ? undefined : rotateState.error} />
      </form>

      <button
        className="danger-button"
        disabled={isDeleting}
        onClick={() => {
          if (!window.confirm(`Delete key “${geminiKey.label}”?`)) {
            return;
          }
          startDelete(async () => {
            const result = await deleteGeminiKeyAction(geminiKey.id);
            if (!result.ok) {
              window.alert(result.error ?? "Delete failed.");
              return;
            }
            router.refresh();
          });
        }}
        type="button"
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

function UserAssignmentRowForm({
  row,
  keys
}: {
  row: UserAssignmentRow;
  keys: GeminiKeyPublic[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="admin-assign-form">
      <div className="admin-assign-user">
        <strong>{row.displayName ?? row.username}</strong>
        <span className="admin-assign-username">@{row.username}</span>
      </div>
      <select
        className="admin-select"
        defaultValue={row.geminiKeyId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value;
          const geminiKeyId = value.length > 0 ? value : null;
          startTransition(async () => {
            const result = await setUserGeminiAssignmentAction(
              row.userId,
              geminiKeyId
            );
            if (!result.ok) {
              window.alert(result.error ?? "Update failed.");
              event.target.value = row.geminiKeyId ?? "";
              return;
            }
            router.refresh();
          });
        }}
      >
        <option value="">— Global GEMINI_API_KEY —</option>
        {keys.map((key) => (
          <option key={key.id} value={key.id}>
            {key.label} (…{key.last4})
          </option>
        ))}
      </select>
    </div>
  );
}
