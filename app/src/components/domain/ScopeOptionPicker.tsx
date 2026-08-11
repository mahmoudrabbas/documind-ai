"use client";

import {
  filterScopeOptionsByActorScope,
  isScopeValueInActorScope,
  normalizeTaxonomyName,
} from "@/lib/permission-utils";
import { useI18n } from "@/providers/i18n-provider";
import type { PermissionScopes } from "@/types/api/permissions.types";
import type { RoleScopeOption } from "@/types/api/users.types";

type ScopeDimension =
  | "departmentIds"
  | "documentCategories"
  | "documentClassifications";

export function ScopeOptionPicker({
  label,
  options,
  archived,
  selected,
  valueKey,
  dimension,
  actorScope,
  loading,
  error,
  onChange,
}: {
  label: string;
  options: RoleScopeOption[];
  archived: RoleScopeOption[];
  selected: string[];
  valueKey: "id" | "name";
  dimension: ScopeDimension;
  actorScope: PermissionScopes | null;
  loading: boolean;
  error: string | null;
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const lookupKey = (option: RoleScopeOption) =>
    valueKey === "id" ? option.id : option.normalizedName;
  const activeByKey = new Map(
    options.map((option) => [lookupKey(option), option]),
  );
  const archivedByKey = new Map(
    archived.map((option) => [lookupKey(option), option]),
  );
  const selectedKeySet = new Set(
    selected.map((value) =>
      valueKey === "id" ? value : normalizeTaxonomyName(value),
    ),
  );
  const addable = filterScopeOptionsByActorScope({
    dimension,
    options,
    actorScope,
  }).filter((option) => !selectedKeySet.has(lookupKey(option)));

  const addOption = (option: RoleScopeOption) => {
    const value = valueKey === "id" ? option.id : option.name;
    if (!selected.includes(value)) onChange([...selected, value]);
  };

  return (
    <div className="text-xs font-bold text-on-surface-variant">
      {label}
      {loading ? (
        <p className="mt-1 text-[11px] font-normal">
          {t("dashboard.roles.scopeOptionsLoading")}
        </p>
      ) : error ? (
        <p role="alert" className="mt-1 text-[11px] font-normal text-error">
          {error}
        </p>
      ) : (
        <>
          {selected.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {selected.map((value) => {
                const key =
                  valueKey === "id" ? value : normalizeTaxonomyName(value);
                const option = activeByKey.get(key) ?? archivedByKey.get(key);
                const withinActor = isScopeValueInActorScope({
                  dimension,
                  value,
                  actorScope,
                });
                return (
                  <li
                    key={value}
                    className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-2 py-0.5"
                  >
                    <span className="text-xs font-normal text-on-surface">
                      {option?.name ?? value}
                    </span>
                    {option && option.status === "archived" ? (
                      <span className="text-[10px] font-bold text-on-surface-variant">
                        {t("dashboard.roles.scopeArchivedBadge")}
                      </span>
                    ) : null}
                    {!option ? (
                      <span className="text-[10px] font-bold text-error">
                        {t("dashboard.roles.scopeUnknownBadge")}
                      </span>
                    ) : null}
                    {!withinActor ? (
                      <span className="text-[10px] font-bold text-error">
                        {t("dashboard.roles.scopeOutsideActorBadge")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={t("dashboard.roles.scopeRemoveSr", {
                        value: option?.name ?? value,
                      })}
                      className="ms-1 text-on-surface-variant hover:text-error"
                      onClick={() =>
                        onChange(selected.filter((item) => item !== value))
                      }
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {addable.length > 0 ? (
            <select
              value=""
              onChange={(event) => {
                const option = addable.find(
                  (candidate) => lookupKey(candidate) === event.target.value,
                );
                if (option) addOption(option);
              }}
              className="mt-2 w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">
                {t("dashboard.roles.scopeSelectPlaceholder")}
              </option>
              {addable.map((option) => (
                <option key={lookupKey(option)} value={lookupKey(option)}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-[11px] font-normal text-on-surface-variant">
              {t("dashboard.roles.scopeNoOptions")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
