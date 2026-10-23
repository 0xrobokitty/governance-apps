import { useEffect, useId, useRef, useState } from "react";
import { IconPencil } from "@/components/icons/IconPencil";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AddressLink } from "@/components/ui/ExplorerLink";
import { cn } from "@/lib/cn";
import type { DisplayAddressIdentity } from "@/lib/identity/identity";
import { ADDRESS_ALIAS_MAX_LENGTH } from "@/lib/identity/aliases";
import type { AddressAliasMutation, AddressAliasMutationResult } from "@/lib/hooks/useAddressAliases";

export type AddressIdentityCopy = {
  edit: string; fieldLabel: string; browserOnly: string; save: string; cancel: string; reset: string; invalid: string; storageError: string; you: string;
};

export type AddressIdentityProps = {
  copy: AddressIdentityCopy;
  alias?: string;
  identity: DisplayAddressIdentity;
  isCurrentMember?: boolean;
  layout?: "inline" | "stacked";
  onResetAlias?: (address: string) => AddressAliasMutation;
  onSetAlias?: (
    address: string,
    alias: string
  ) => AddressAliasMutation;
};

export function AddressIdentity({
  copy,
  alias,
  identity,
  isCurrentMember = false,
  layout = "inline",
  onResetAlias,
  onSetAlias,
}: AddressIdentityProps) {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? identity.label);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = Boolean(onResetAlias && onSetAlias);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [isEditing]);

  const closeEditor = () => {
    setDraft(alias ?? identity.label);
    setError(null);
    restoreFocusRef.current = true;
    setIsEditing(false);
  };

  const applyResult = (result: AddressAliasMutationResult) => {
    setIsSaving(false);
    if (result !== "saved") {
      setError(result === "storage-error" ? copy.storageError : copy.invalid);
      return;
    }

    setError(null);
    restoreFocusRef.current = true;
    setIsEditing(false);
  };

  const handleMutation = (result: AddressAliasMutation) => {
    if (typeof result === "string") { applyResult(result); return; }
    setIsSaving(true);
    void result.then(applyResult, () => applyResult("storage-error"));
  };

  return (
    <div className="w-full min-w-0 max-w-full">
      {isEditing ? (
        <>
          <form
            className="min-w-0 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isSaving && onSetAlias) handleMutation(onSetAlias(identity.address, draft));
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="text-xs font-bold uppercase text-text-tertiary"
                htmlFor={inputId}
              >
                {copy.fieldLabel}
              </label>
              {isCurrentMember ? (
                <Badge variant="brand">{copy.you}</Badge>
              ) : null}
            </div>
            <input
              ref={inputRef}
              id={inputId}
              className="h-10 w-full min-w-0 rounded-box border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-[border-color,box-shadow] focus:border-text-primary focus:ring-2 focus:ring-text-primary/10"
              value={draft}
              disabled={isSaving}
              maxLength={ADDRESS_ALIAS_MAX_LENGTH}
              aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
              aria-invalid={Boolean(error)}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !isSaving) {
                  event.preventDefault();
                  closeEditor();
                }
              }}
            />
            <p id={descriptionId} className="text-xs leading-5 text-text-tertiary">
              {copy.browserOnly}
            </p>
            {error ? (
              <p id={errorId} className="text-xs text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={isSaving} aria-busy={isSaving}>
                {copy.save}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isSaving}
                onClick={closeEditor}
              >
                {copy.cancel}
              </Button>
              {alias ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  onClick={() => { if (onResetAlias) handleMutation(onResetAlias(identity.address)); }}
                >
                  {copy.reset}
                </Button>
              ) : null}
            </div>
          </form>
          <div className="mt-1 min-w-0">
            <AddressLink
              address={identity.address}
              className="min-w-0"
              variant="compact"
            />
          </div>
        </>
      ) : (
        <div className={cn("flex min-w-0 max-w-full gap-x-2 gap-y-0", layout === "stacked" ? "relative flex-col items-start" : "flex-wrap items-center", layout === "stacked" && canEdit && "pr-10")}>
          {layout === "stacked" && canEdit ? (
            <span data-identity-label className="block w-full min-w-0 truncate font-bold leading-5 text-text-primary" title={identity.label}>{identity.label}</span>
          ) : null}
          {canEdit ? (
            <button
              ref={editButtonRef}
              type="button"
              className={cn("group/name inline-flex min-h-10 min-w-10 max-w-full items-center gap-1 rounded text-left font-bold text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary", layout === "stacked" && "absolute right-0 top-0 size-10 justify-center")}
              aria-label={`${copy.edit}: ${identity.label}`}
              title={layout === "stacked" ? `${copy.edit}: ${identity.label}` : copy.edit}
              onClick={() => {
                setDraft(alias ?? identity.label);
                setError(null);
                setIsEditing(true);
              }}
            >
              <span className={cn("min-w-0 max-w-full", layout === "stacked" ? "sr-only" : "break-words [overflow-wrap:anywhere]")}>
                {identity.label}
              </span>
              <IconPencil
                className={cn("pointer-events-none size-4 shrink-0 text-text-tertiary transition-opacity duration-150 ease-out group-focus-visible/name:opacity-100", layout === "stacked" ? "opacity-60 group-hover/name:opacity-100" : "opacity-0 [@media(pointer:coarse)]:opacity-100 [@media(pointer:fine)]:group-hover/name:opacity-100")}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className={cn("min-w-0 max-w-full font-bold text-text-primary", layout === "stacked" ? "block truncate leading-5" : "break-words [overflow-wrap:anywhere]")} title={layout === "stacked" ? identity.label : undefined}>
              {identity.label}
            </span>
          )}
          {isCurrentMember ? (
            <Badge variant="brand">{copy.you}</Badge>
          ) : null}
          <AddressLink
            address={identity.address}
            className="min-w-0"
            variant="compact"
          />
        </div>
      )}
    </div>
  );
}
