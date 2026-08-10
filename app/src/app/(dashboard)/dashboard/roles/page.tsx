"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ApiError } from "@/lib/api-client";
import { usePermissions } from "@/providers/permission-provider";
import {
  archiveRole,
  assignRole,
  cloneRole,
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRole,
  getRoleScopeOptions,
  getRoleUsage,
  listRoles,
  migrateRoleUsers,
  reactivateRole,
  removeRoleAssignment,
  updateRole,
} from "@/services/roles.service";
import { listAllUsers } from "@/services/users.service";
import type {
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionGrant,
  PermissionScopes,
  PermissionScopeType,
} from "@/types/api/permissions.types";
import { Permission } from "@/types/api/permissions.types";
import type {
  RoleScopeOptions,
  RoleView,
  UserView,
} from "@/types/api/users.types";
import {
  collectRoleScopeResolution,
  deriveDeleteFlowState,
  deriveInheritedPermissionIds,
  deriveRoleActionVisibility,
  deriveRoleListViewState,
  deriveVersionConflictState,
  emptyPermissionScopes,
  filterCatalogGroupsForActor,
  flattenCatalogEntries,
  normalizeScopesForPermission,
  normalizeTaxonomyName,
  permissionScopesAreEmpty,
  prepareCreateRoleSubmission,
  prepareUpdateRoleSubmission,
  type ActorGrantMap,
} from "@/lib/permission-utils";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { ScopeOptionPicker } from "@/components/domain/ScopeOptionPicker";
import { useI18n } from "@/providers/i18n-provider";

const BASE_ROLE_OPTIONS = [
  { value: "EMPLOYEE", labelKey: "dashboard.roles.employee" },
  { value: "COMPANY_ADMIN", labelKey: "dashboard.roles.companyAdmin" },
] as const;

const STATUS_OPTIONS = [
  { value: "all", labelKey: "dashboard.roles.allStatuses" },
  { value: "active", labelKey: "dashboard.roles.active" },
  { value: "archived", labelKey: "dashboard.roles.archived" },
] as const;

type TenantBaseRole = "COMPANY_ADMIN" | "EMPLOYEE";
type RoleStatusFilter = "all" | "active" | "archived";
type BaseRoleFilter = "all" | TenantBaseRole;
type LifecycleKind = "clone" | "archive" | "reactivate" | "delete";

interface CatalogData {
  contractVersion: number;
  groups: PermissionCatalogGroup[];
  baseRoleDefaults: Record<string, string[]>;
}

const EMPTY_SCOPE_OPTIONS: RoleScopeOptions = {
  departments: [],
  categories: [],
  classifications: [],
  archived: {
    departments: [],
    categories: [],
    classifications: [],
  },
};

interface LifecycleState {
  type: LifecycleKind;
  role: RoleView;
}

interface MigrationResult {
  affected: number;
  skipped: number;
  conflicted: number;
}

function grantsEqual(a: PermissionGrant[], b: PermissionGrant[]): boolean {
  const normalize = (grants: PermissionGrant[]) =>
    [...grants]
      .map((grant) => ({
        permission: grant.permission,
        scopes: grant.scopes
          ? {
              selfOnly: grant.scopes.selfOnly,
              departmentIds: [...grant.scopes.departmentIds].sort(),
              documentCategories: [...grant.scopes.documentCategories].sort(),
              documentClassifications: [
                ...grant.scopes.documentClassifications,
              ].sort(),
            }
          : undefined,
      }))
      .sort((left, right) => left.permission.localeCompare(right.permission));

  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function formatScope(
  scopes: PermissionScopes | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!scopes || permissionScopesAreEmpty(scopes))
    return t("dashboard.roles.scopeUnrestricted");
  const parts: string[] = [];
  if (scopes.selfOnly) parts.push(t("dashboard.roles.scopeSelfOnly"));
  if (scopes.departmentIds.length > 0) {
    parts.push(
      t("dashboard.roles.scopeDepartments", {
        departments: scopes.departmentIds.join(", "),
      }),
    );
  }
  if (scopes.documentCategories.length > 0) {
    parts.push(
      t("dashboard.roles.scopeCategories", {
        categories: scopes.documentCategories.join(", "),
      }),
    );
  }
  if (scopes.documentClassifications.length > 0) {
    parts.push(
      t("dashboard.roles.scopeClassifications", {
        classifications: scopes.documentClassifications.join(", "),
      }),
    );
  }
  return parts.join(" · ");
}

function isVersionConflict(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return deriveVersionConflictState(error.code).isConflict;
}

export default function RolesPage() {
  const { t, tPlural, dir } = useI18n();
  const permissionContext = usePermissions();
  const permissionsReady = permissionContext.status === "ready";
  const effectivePermissions = useMemo(
    () =>
      permissionsReady ? permissionContext.permissions : new Set<string>(),
    [permissionContext, permissionsReady],
  );
  const actorGrants: ActorGrantMap = useMemo(
    () => (permissionsReady ? permissionContext.grants : {}),
    [permissionContext, permissionsReady],
  );
  const pageVisibility = useMemo(
    () => deriveRoleActionVisibility(effectivePermissions, "active"),
    [effectivePermissions],
  );
  const canReadRoles = pageVisibility.canView;
  const canCreateRole = effectivePermissions.has(Permission.ROLES_CREATE);

  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [baseRoleFilter, setBaseRoleFilter] = useState<BaseRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<RoleStatusFilter>("all");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [scopeOptions, setScopeOptions] = useState<RoleScopeOptions>(
    EMPTY_SCOPE_OPTIONS,
  );
  const [scopeOptionsLoading, setScopeOptionsLoading] = useState(false);
  const [scopeOptionsError, setScopeOptionsError] = useState<string | null>(
    null,
  );
  const scopeResolveRef = useRef<{
    departments: Set<string>;
    categories: Set<string>;
    classifications: Set<string>;
  }>({
    departments: new Set(),
    categories: new Set(),
    classifications: new Set(),
  });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBaseRole, setCreateBaseRole] =
    useState<TenantBaseRole>("EMPLOYEE");
  const [createGrants, setCreateGrants] = useState<PermissionGrant[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [detailsRoleId, setDetailsRoleId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleView | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBaseRole, setEditBaseRole] = useState<TenantBaseRole>("EMPLOYEE");
  const [editGrants, setEditGrants] = useState<PermissionGrant[]>([]);
  const [editOriginalName, setEditOriginalName] = useState("");
  const [editOriginalBaseRole, setEditOriginalBaseRole] =
    useState<TenantBaseRole>("EMPLOYEE");
  const [editOriginalGrants, setEditOriginalGrants] = useState<
    PermissionGrant[]
  >([]);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editStale, setEditStale] = useState(false);

  const [lifecycle, setLifecycle] = useState<LifecycleState | null>(null);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleStale, setLifecycleStale] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [migrationDestinationId, setMigrationDestinationId] = useState("");
  const [migrationSubmitting, setMigrationSubmitting] = useState(false);
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);

  const [assignmentRole, setAssignmentRole] = useState<RoleView | null>(null);
  const [assignmentUsers, setAssignmentUsers] = useState<UserView[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState<
    Record<string, boolean>
  >({});
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentStale, setAssignmentStale] = useState(false);

  const catalogEntries = useMemo(
    () => (catalog ? flattenCatalogEntries(catalog.groups) : []),
    [catalog],
  );
  const selectableGroups = useMemo(
    () =>
      catalog && permissionsReady
        ? filterCatalogGroupsForActor(catalog.groups, actorGrants)
        : [],
    [actorGrants, catalog, permissionsReady],
  );

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listRoles();
      setRoles(response.data.roles);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : t("dashboard.roles.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await getPermissionCatalog();
      setCatalog({
        contractVersion: response.data.contractVersion,
        groups: response.data.groups,
        baseRoleDefaults: response.data.baseRoleDefaults,
      });
    } catch (loadError) {
      setCatalogError(
        loadError instanceof ApiError
          ? loadError.message
          : t("dashboard.roles.catalogLoadError"),
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [t]);

  const loadScopeOptions = useCallback(
    async (
      resolution?: ReturnType<typeof collectRoleScopeResolution>,
    ): Promise<boolean> => {
      if (resolution) {
        for (const id of resolution.departments) {
          scopeResolveRef.current.departments.add(id);
        }
        for (const name of resolution.categories) {
          scopeResolveRef.current.categories.add(normalizeTaxonomyName(name));
        }
        for (const name of resolution.classifications) {
          scopeResolveRef.current.classifications.add(
            normalizeTaxonomyName(name),
          );
        }
      }
      setScopeOptionsLoading(true);
      setScopeOptionsError(null);
      try {
        const response = await getRoleScopeOptions({
          departments: [...scopeResolveRef.current.departments],
          categories: [...scopeResolveRef.current.categories],
          classifications: [...scopeResolveRef.current.classifications],
        });
        setScopeOptions(response.data);
        return true;
      } catch (loadError) {
        setScopeOptionsError(
          loadError instanceof ApiError
            ? loadError.message
            : t("dashboard.roles.scopeOptionsError"),
        );
        return false;
      } finally {
        setScopeOptionsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!permissionsReady) return;
    if (!canReadRoles) {
      setLoading(false);
      return;
    }
    void Promise.all([loadRoles(), loadCatalog(), loadScopeOptions()]);
  }, [canReadRoles, loadCatalog, loadRoles, loadScopeOptions, permissionsReady]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const filteredRoles = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return roles.filter((role) => {
      if (baseRoleFilter !== "all" && role.baseRole !== baseRoleFilter) {
        return false;
      }
      if (statusFilter !== "all" && role.status !== statusFilter) {
        return false;
      }
      if (
        normalizedSearch &&
        !role.name.toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [baseRoleFilter, roles, searchTerm, statusFilter]);

  const listView = useMemo(
    () =>
      deriveRoleListViewState({
        permissionsReady,
        canRead: canReadRoles,
        loading,
        error,
        rolesCount: roles.length,
        filteredCount: filteredRoles.length,
      }),
    [
      canReadRoles,
      error,
      filteredRoles.length,
      loading,
      permissionsReady,
      roles.length,
    ],
  );

  const clearFilters = () => {
    setSearchTerm("");
    setBaseRoleFilter("all");
    setStatusFilter("all");
  };

  const createInheritedIds = useMemo(
    () =>
      catalog
        ? deriveInheritedPermissionIds(catalog.baseRoleDefaults, createBaseRole)
        : [],
    [catalog, createBaseRole],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog || !permissionsReady) {
      setCreateError(t("dashboard.roles.permissionDataLoading"));
      return;
    }

    const prepared = prepareCreateRoleSubmission({
      name: createName,
      baseRole: createBaseRole,
      grants: createGrants,
      baseRoleDefaults: catalog.baseRoleDefaults,
      catalogEntries,
      actorGrants,
    });
    if (!prepared.valid) {
      setCreateError(prepared.error);
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);
    setSuccessMessage(null);
    try {
      await createRole(prepared.payload);
      setSuccessMessage(
        t("dashboard.roles.createdSuccess", { name: prepared.payload.name }),
      );
      setCreateName("");
      setCreateBaseRole("EMPLOYEE");
      setCreateGrants([]);
      setShowCreateForm(false);
      await loadRoles();
      await permissionContext.refreshPermissions();
    } catch (createFailure) {
      setCreateError(
        createFailure instanceof ApiError
          ? createFailure.message
          : t("dashboard.roles.createError"),
      );
    } finally {
      setCreateSubmitting(false);
    }
  }

  const openRoleDetails = useCallback(
    async (roleId: string, startInEdit = false) => {
      setDetailsRoleId(roleId);
      setSelectedRole(null);
      setDetailsLoading(true);
      setDetailsError(null);
      setEditing(false);
      setEditError(null);
      setEditStale(false);
      try {
        const response = await getRole(roleId);
        const latest = response.data.role;
        setSelectedRole(latest);
        void loadScopeOptions(collectRoleScopeResolution(latest.grants));
        if (startInEdit) {
          setEditing(true);
          setEditName(latest.name);
          setEditBaseRole(latest.baseRole);
          setEditGrants(latest.grants);
          setEditOriginalName(latest.name);
          setEditOriginalBaseRole(latest.baseRole);
          setEditOriginalGrants(latest.grants);
          setEditVersion(latest.version);
        }
      } catch (detailsFailure) {
        setDetailsError(
          detailsFailure instanceof ApiError
            ? detailsFailure.message
            : t("dashboard.roles.detailsLoadError"),
        );
      } finally {
        setDetailsLoading(false);
      }
    },
    [loadScopeOptions, t],
  );

  const closeDetails = () => {
    setDetailsRoleId(null);
    setSelectedRole(null);
    setDetailsError(null);
    setEditing(false);
    setEditError(null);
    setEditStale(false);
  };

  const startEdit = (role: RoleView) => {
    setEditing(true);
    setEditName(role.name);
    setEditBaseRole(role.baseRole);
    setEditGrants(role.grants);
    setEditOriginalName(role.name);
    setEditOriginalBaseRole(role.baseRole);
    setEditOriginalGrants(role.grants);
    setEditVersion(role.version);
    setEditError(null);
    setEditStale(false);
  };

  const editHasChanges = useMemo(
    () =>
      editing &&
      (editName.trim() !== editOriginalName ||
        editBaseRole !== editOriginalBaseRole ||
        !grantsEqual(editGrants, editOriginalGrants)),
    [
      editBaseRole,
      editGrants,
      editName,
      editOriginalBaseRole,
      editOriginalGrants,
      editOriginalName,
      editing,
    ],
  );

  async function handleEdit() {
    if (
      !selectedRole ||
      !catalog ||
      !permissionsReady ||
      editVersion === null
    ) {
      return;
    }

    const prepared = prepareUpdateRoleSubmission({
      name: editName,
      baseRole: editBaseRole,
      grants: editGrants,
      version: editVersion,
      baseRoleDefaults: catalog.baseRoleDefaults,
      catalogEntries,
      actorGrants,
      isStale: editStale,
    });
    if (!prepared.valid) {
      setEditError(prepared.error);
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    setSuccessMessage(null);
    try {
      const response = await updateRole(selectedRole.id, prepared.payload);
      const latest = response.data.role;
      setSelectedRole(latest);
      setRoles((current) =>
        current.map((role) => (role.id === latest.id ? latest : role)),
      );
      setEditing(false);
      setEditStale(false);
      setSuccessMessage(
        t("dashboard.roles.updatedSuccess", { name: latest.name }),
      );
      await permissionContext.refreshPermissions();
    } catch (editFailure) {
      if (isVersionConflict(editFailure)) {
        const conflict = deriveVersionConflictState(editFailure.code);
        setEditStale(conflict.isStale);
        setEditError(conflict.message);
      } else {
        setEditError(
          editFailure instanceof ApiError
            ? editFailure.message
            : t("dashboard.roles.updateError"),
        );
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  async function reloadLatestForEdit() {
    if (!selectedRole) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const response = await getRole(selectedRole.id);
      const latest = response.data.role;
      setSelectedRole(latest);
      setRoles((current) =>
        current.map((role) => (role.id === latest.id ? latest : role)),
      );
      startEdit(latest);
      setSuccessMessage(t("dashboard.roles.latestVersionLoadedReview"));
    } catch (reloadError) {
      setEditError(
        reloadError instanceof ApiError
          ? reloadError.message
          : t("dashboard.roles.reloadError"),
      );
    } finally {
      setEditSubmitting(false);
    }
  }

  function openLifecycle(type: LifecycleKind, role: RoleView) {
    setLifecycle({ type, role });
    setLifecycleError(null);
    setLifecycleStale(false);
    setCloneName(type === "clone" ? `${role.name} (copy)` : "");
    setUsageCount(null);
    setMigrationDestinationId("");
    setMigrationResult(null);
  }

  const loadAuthoritativeUsage = useCallback(
    async (roleId: string) => {
      setUsageLoading(true);
      setLifecycleError(null);
      try {
        const response = await getRoleUsage(roleId);
        setUsageCount(response.data.assignedUserCount);
        return response.data.assignedUserCount;
      } catch (usageFailure) {
        setLifecycleError(
          usageFailure instanceof ApiError
            ? usageFailure.message
            : t("dashboard.roles.usageLoadError"),
        );
        return null;
      } finally {
        setUsageLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (lifecycle?.type !== "delete") return;
    void loadAuthoritativeUsage(lifecycle.role.id);
  }, [lifecycle, loadAuthoritativeUsage]);

  const deleteFlow = deriveDeleteFlowState(
    usageCount,
    lifecycle?.role.status ?? "active",
  );

  const migrationDestinations = useMemo(() => {
    if (!lifecycle) return [];
    return roles.filter(
      (role) =>
        role.status === "active" &&
        role.id !== lifecycle.role.id &&
        role.baseRole === lifecycle.role.baseRole,
    );
  }, [lifecycle, roles]);

  async function handleLifecycle() {
    if (!lifecycle || lifecycleStale) return;
    setLifecycleSubmitting(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      if (lifecycle.type === "clone") {
        const nameValidation = prepareCreateRoleSubmission({
          name: cloneName,
          baseRole: lifecycle.role.baseRole,
          grants: [],
          baseRoleDefaults: {},
          catalogEntries: [],
          actorGrants: {},
        });
        if (!nameValidation.valid) {
          setLifecycleError(nameValidation.error);
          return;
        }
        const response = await cloneRole(
          lifecycle.role.id,
          nameValidation.payload.name,
          lifecycle.role.version,
        );
        setSuccessMessage(
          t("dashboard.roles.clonedSuccess", {
            name: response.data.role.name,
          }),
        );
      } else if (lifecycle.type === "archive") {
        const response = await archiveRole(
          lifecycle.role.id,
          lifecycle.role.version,
        );
        setSuccessMessage(
          t("dashboard.roles.archivedSuccess", {
            name: response.data.role.name,
          }),
        );
      } else if (lifecycle.type === "reactivate") {
        const response = await reactivateRole(
          lifecycle.role.id,
          lifecycle.role.version,
        );
        setSuccessMessage(
          t("dashboard.roles.reactivatedSuccess", {
            name: response.data.role.name,
          }),
        );
      } else {
        const confirmedUsage = await loadAuthoritativeUsage(lifecycle.role.id);
        const confirmedFlow = deriveDeleteFlowState(
          confirmedUsage,
          lifecycle.role.status,
        );
        if (!confirmedFlow.canDelete) {
          setLifecycleError(
            confirmedFlow.requiresMigration
              ? tPlural("dashboard.roles.deleteHasUsers", confirmedUsage ?? 0, {
                  count: String(confirmedUsage ?? 0),
                })
              : t("dashboard.roles.deleteUsageNotZero"),
          );
          return;
        }
        await deleteRole(lifecycle.role.id, lifecycle.role.version);
        setSuccessMessage(
          t("dashboard.roles.deletedSuccess", { name: lifecycle.role.name }),
        );
        if (selectedRole?.id === lifecycle.role.id) closeDetails();
      }

      setLifecycle(null);
      await loadRoles();
      await permissionContext.refreshPermissions();
    } catch (lifecycleFailure) {
      if (isVersionConflict(lifecycleFailure)) {
        const conflict = deriveVersionConflictState(lifecycleFailure.code);
        setLifecycleStale(conflict.isStale);
        setLifecycleError(conflict.message);
      } else if (
        lifecycleFailure instanceof ApiError &&
        lifecycleFailure.code === "ROLE_IN_USE"
      ) {
        setLifecycleError(t("dashboard.roles.roleInUse"));
        await loadAuthoritativeUsage(lifecycle.role.id);
      } else {
        setLifecycleError(
          lifecycleFailure instanceof ApiError
            ? lifecycleFailure.message
            : t("dashboard.roles.operationFailed"),
        );
      }
    } finally {
      setLifecycleSubmitting(false);
    }
  }

  async function handleMigration() {
    if (!lifecycle || lifecycle.type !== "delete" || lifecycleStale) return;
    const destination = migrationDestinations.find(
      (role) => role.id === migrationDestinationId,
    );
    if (!destination) {
      setLifecycleError(t("dashboard.roles.selectDestinationRole"));
      return;
    }

    setMigrationSubmitting(true);
    setLifecycleError(null);
    try {
      const response = await migrateRoleUsers(
        lifecycle.role.id,
        destination.id,
        lifecycle.role.version,
        destination.version,
      );
      setMigrationResult({
        affected: response.data.affected,
        skipped: response.data.skipped,
        conflicted: response.data.conflicted,
      });
      const latestRoleResponse = await getRole(lifecycle.role.id);
      const latestSourceRole = latestRoleResponse.data.role;
      setLifecycle((current) =>
        current ? { ...current, role: latestSourceRole } : current,
      );
      setRoles((current) =>
        current.map((role) =>
          role.id === latestSourceRole.id ? latestSourceRole : role,
        ),
      );
      const latestUsage = await loadAuthoritativeUsage(lifecycle.role.id);
      await loadRoles();
      await permissionContext.refreshPermissions();
      setSuccessMessage(
        latestUsage === 0
          ? t("dashboard.roles.migrationZero")
          : latestUsage !== null
            ? tPlural("dashboard.roles.migrationUsersRemain", latestUsage, {
                count: String(latestUsage),
              })
            : t("dashboard.roles.migrationUsersRemainUnknown"),
      );
    } catch (migrationFailure) {
      if (isVersionConflict(migrationFailure)) {
        const conflict = deriveVersionConflictState(migrationFailure.code);
        setLifecycleStale(conflict.isStale);
        setLifecycleError(conflict.message);
      } else {
        setLifecycleError(
          migrationFailure instanceof ApiError
            ? migrationFailure.message
            : t("dashboard.roles.migrationFailed"),
        );
      }
    } finally {
      setMigrationSubmitting(false);
    }
  }

  async function reloadLifecycleRole() {
    if (!lifecycle) return;
    setLifecycleSubmitting(true);
    setLifecycleError(null);
    try {
      const response = await getRole(lifecycle.role.id);
      const latest = response.data.role;
      setLifecycle((current) =>
        current ? { ...current, role: latest } : current,
      );
      setRoles((current) =>
        current.map((role) => (role.id === latest.id ? latest : role)),
      );
      setLifecycleStale(false);
      setMigrationDestinationId("");
      if (lifecycle.type === "delete") {
        await loadAuthoritativeUsage(latest.id);
      }
      setSuccessMessage(t("dashboard.roles.latestLoadedConfirmAgain"));
    } catch (reloadError) {
      setLifecycleError(
        reloadError instanceof ApiError
          ? reloadError.message
          : t("dashboard.roles.reloadError"),
      );
    } finally {
      setLifecycleSubmitting(false);
    }
  }

  const openAssignments = useCallback(async (role: RoleView) => {
    setAssignmentRole(role);
    setAssignmentUsers([]);
    setAssignmentLoading(true);
    setAssignmentError(null);
    setAssignmentSearch("");
    setAssignmentStale(false);
    try {
      setAssignmentUsers(await listAllUsers());
    } catch (usersFailure) {
      setAssignmentError(
        usersFailure instanceof ApiError
          ? usersFailure.message
          : t("dashboard.roles.loadUsersError"),
      );
    } finally {
      setAssignmentLoading(false);
    }
  }, [t]);

  async function refreshAssignmentRole() {
    if (!assignmentRole) return;
    setAssignmentLoading(true);
    setAssignmentError(null);
    try {
      const [roleResponse, users] = await Promise.all([
        getRole(assignmentRole.id),
        listAllUsers(),
      ]);
      setAssignmentRole(roleResponse.data.role);
      setAssignmentUsers(users);
      setAssignmentStale(false);
      setSuccessMessage(t("dashboard.roles.latestLoadedRetryManual"));
    } catch (refreshFailure) {
      setAssignmentError(
        refreshFailure instanceof ApiError
          ? refreshFailure.message
          : t("dashboard.roles.refreshAssignmentError"),
      );
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function mutateAssignment(userId: string, remove: boolean) {
    if (!assignmentRole || assignmentStale) return;
    setAssignmentSaving((current) => ({ ...current, [userId]: true }));
    setAssignmentError(null);
    try {
      const response = remove
        ? await removeRoleAssignment(
            assignmentRole.id,
            userId,
            assignmentRole.version,
          )
        : await assignRole(assignmentRole.id, userId, assignmentRole.version);
      setSuccessMessage(
        response.data.changed
          ? remove
            ? t("dashboard.roles.assignmentRemoved")
            : t("dashboard.roles.userAssigned")
          : remove
            ? t("dashboard.roles.userDidNotHaveRole")
            : t("dashboard.roles.userAlreadyHadRole"),
      );
      await Promise.all([refreshAssignmentRole(), loadRoles()]);
      await permissionContext.refreshPermissions();
    } catch (assignmentFailure) {
      if (isVersionConflict(assignmentFailure)) {
        const conflict = deriveVersionConflictState(assignmentFailure.code);
        setAssignmentStale(conflict.isStale);
        setAssignmentError(conflict.message);
      } else {
        setAssignmentError(
          assignmentFailure instanceof ApiError
            ? assignmentFailure.message
            : remove
              ? t("dashboard.roles.removeAssignmentError")
              : t("dashboard.roles.assignRoleError"),
        );
      }
    } finally {
      setAssignmentSaving((current) => ({ ...current, [userId]: false }));
    }
  }

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("dashboard.roles.title")}
        description={t("dashboard.roles.description")}
        actions={
          canCreateRole ? (
            <button
              type="button"
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 sm:w-auto"
              onClick={() => {
                setShowCreateForm((current) => !current);
                setCreateError(null);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">
                {showCreateForm ? "close" : "add"}
              </span>
              {showCreateForm
                ? t("dashboard.roles.cancel")
                : t("dashboard.roles.createRole")}
            </button>
          ) : null
        }
      />

      {successMessage ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {successMessage}
        </div>
      ) : null}

      {showCreateForm && canCreateRole ? (
        <CreateRolePanel
          name={createName}
          onNameChange={setCreateName}
          baseRole={createBaseRole}
          onBaseRoleChange={(role) => {
            setCreateBaseRole(role);
            setCreateGrants([]);
          }}
          grants={createGrants}
          onGrantsChange={setCreateGrants}
          inheritedIds={createInheritedIds}
          catalogEntries={catalogEntries}
          selectableGroups={selectableGroups}
          actorGrants={actorGrants}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          scopeOptions={scopeOptions}
          scopeOptionsLoading={scopeOptionsLoading}
          scopeOptionsError={scopeOptionsError}
          error={createError}
          submitting={createSubmitting}
          onSubmit={handleCreate}
          onRetryCatalog={() => void loadCatalog()}
        />
      ) : null}

      {canReadRoles ? (
        <RoleFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          baseRoleFilter={baseRoleFilter}
          onBaseRoleFilterChange={setBaseRoleFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      ) : null}

      <DashboardPanel padding="none">
        <RoleListContent
          state={listView.viewState}
          error={error}
          roles={filteredRoles}
          hasAnyRoles={roles.length > 0}
          onRetry={() => void loadRoles()}
          onClearFilters={clearFilters}
          effectivePermissions={effectivePermissions}
          onView={(role) => void openRoleDetails(role.id)}
          onEdit={(role) => void openRoleDetails(role.id, true)}
          onAssign={(role) => void openAssignments(role)}
          onLifecycle={openLifecycle}
        />
      </DashboardPanel>

      {detailsRoleId ? (
        <RoleDetailsDialog
          role={selectedRole}
          loading={detailsLoading}
          error={detailsError}
          catalog={catalog}
          catalogEntries={catalogEntries}
          selectableGroups={selectableGroups}
          actorGrants={actorGrants}
          scopeOptions={scopeOptions}
          scopeOptionsLoading={scopeOptionsLoading}
          scopeOptionsError={scopeOptionsError}
          editing={editing}
          editName={editName}
          editBaseRole={editBaseRole}
          editGrants={editGrants}
          editError={editError}
          editSubmitting={editSubmitting}
          editStale={editStale}
          editHasChanges={editHasChanges}
          canEdit={
            selectedRole
              ? deriveRoleActionVisibility(
                  effectivePermissions,
                  selectedRole.status,
                ).canEdit
              : false
          }
          onClose={closeDetails}
          onRetry={() => void openRoleDetails(detailsRoleId)}
          onStartEdit={startEdit}
          onCancelEdit={() => {
            setEditing(false);
            setEditError(null);
            setEditStale(false);
          }}
          onEditNameChange={setEditName}
          onEditBaseRoleChange={setEditBaseRole}
          onEditGrantsChange={setEditGrants}
          onSave={() => void handleEdit()}
          onReloadLatest={() => void reloadLatestForEdit()}
        />
      ) : null}

      {lifecycle ? (
        <LifecycleDialog
          lifecycle={lifecycle}
          cloneName={cloneName}
          onCloneNameChange={setCloneName}
          usageCount={usageCount}
          usageLoading={usageLoading}
          deleteFlow={deleteFlow}
          canMigrate={
            deriveRoleActionVisibility(
              effectivePermissions,
              lifecycle.role.status,
            ).canMigrate
          }
          destinations={migrationDestinations}
          destinationId={migrationDestinationId}
          onDestinationChange={setMigrationDestinationId}
          migrationResult={migrationResult}
          migrationSubmitting={migrationSubmitting}
          submitting={lifecycleSubmitting}
          stale={lifecycleStale}
          error={lifecycleError}
          onConfirm={() => void handleLifecycle()}
          onMigrate={() => void handleMigration()}
          onReloadLatest={() => void reloadLifecycleRole()}
          onCancel={() => setLifecycle(null)}
        />
      ) : null}

      {assignmentRole ? (
        <UserAssignmentDialog
          role={assignmentRole}
          users={assignmentUsers}
          search={assignmentSearch}
          onSearchChange={setAssignmentSearch}
          loading={assignmentLoading}
          saving={assignmentSaving}
          error={assignmentError}
          stale={assignmentStale}
          onAssign={(userId) => void mutateAssignment(userId, false)}
          onRemove={(userId) => void mutateAssignment(userId, true)}
          onReloadLatest={() => void refreshAssignmentRole()}
          onClose={() => {
            setAssignmentRole(null);
            setAssignmentUsers([]);
            setAssignmentError(null);
            setAssignmentStale(false);
          }}
        />
      ) : null}
    </DashboardPage>
  );
}

function CreateRolePanel({
  name,
  onNameChange,
  baseRole,
  onBaseRoleChange,
  grants,
  onGrantsChange,
  inheritedIds,
  catalogEntries,
  selectableGroups,
  actorGrants,
  scopeOptions,
  scopeOptionsLoading,
  scopeOptionsError,
  catalogLoading,
  catalogError,
  error,
  submitting,
  onSubmit,
  onRetryCatalog,
}: {
  name: string;
  onNameChange: (value: string) => void;
  baseRole: TenantBaseRole;
  onBaseRoleChange: (value: TenantBaseRole) => void;
  grants: PermissionGrant[];
  onGrantsChange: (value: PermissionGrant[]) => void;
  inheritedIds: string[];
  catalogEntries: PermissionCatalogEntry[];
  selectableGroups: PermissionCatalogGroup[];
  actorGrants: ActorGrantMap;
  scopeOptions: RoleScopeOptions;
  scopeOptionsLoading: boolean;
  scopeOptionsError: string | null;
  catalogLoading: boolean;
  catalogError: string | null;
  error: string | null;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetryCatalog: () => void;
}) {
  const { t } = useI18n();
  return (
    <DashboardPanel className="mb-6">
      <div className="mb-5 border-b border-outline-variant/30 pb-4">
        <h2 className="text-title-lg font-bold text-primary">
          {t("dashboard.roles.createRole")}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("dashboard.roles.createPanelDesc")}
        </p>
      </div>
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="create-role-name"
              className="mb-2 block text-sm font-bold text-on-surface"
            >
              {t("dashboard.roles.roleNameLabel")}
            </label>
            <input
              id="create-role-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={50}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
              aria-describedby="create-role-name-help"
            />
            <p
              id="create-role-name-help"
              className="mt-1 text-xs text-on-surface-variant"
            >
              {t("dashboard.roles.roleNameHelp")}
            </p>
          </div>
          <div>
            <label
              htmlFor="create-role-base"
              className="mb-2 block text-sm font-bold text-on-surface"
            >
              {t("dashboard.roles.baseRoleLabel")}
            </label>
            <select
              id="create-role-base"
              value={baseRole}
              onChange={(event) =>
                onBaseRoleChange(event.target.value as TenantBaseRole)
              }
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            >
              {BASE_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {catalogError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            {catalogError}
            <button
              type="button"
              className="ms-3 underline"
              onClick={onRetryCatalog}
            >
              {t("dashboard.roles.retry")}
            </button>
          </div>
        ) : null}

        <PermissionEditor
          groups={selectableGroups}
          allEntries={catalogEntries}
          actorGrants={actorGrants}
          inheritedIds={inheritedIds}
          selectedGrants={grants}
          onChange={onGrantsChange}
          loading={catalogLoading}
          scopeOptions={scopeOptions}
          scopeOptionsLoading={scopeOptionsLoading}
          scopeOptionsError={scopeOptionsError}
        />

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        <div className="flex justify-end border-t border-outline-variant/30 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? t("dashboard.roles.creating")
              : t("dashboard.roles.createRole")}
          </button>
        </div>
      </form>
    </DashboardPanel>
  );
}

function RoleFilters({
  searchTerm,
  onSearchChange,
  baseRoleFilter,
  onBaseRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  baseRoleFilter: BaseRoleFilter;
  onBaseRoleFilterChange: (value: BaseRoleFilter) => void;
  statusFilter: RoleStatusFilter;
  onStatusFilterChange: (value: RoleStatusFilter) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block max-w-sm flex-1">
        <span className="sr-only">{t("dashboard.roles.searchRolesSr")}</span>
        <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
          search
        </span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("dashboard.roles.searchPlaceholder")}
          className="w-full rounded-full border border-outline-variant bg-surface py-2 pe-4 ps-10 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label>
          <span className="sr-only">
            {t("dashboard.roles.filterBaseRoleSr")}
          </span>
          <select
            value={baseRoleFilter}
            onChange={(event) =>
              onBaseRoleFilterChange(event.target.value as BaseRoleFilter)
            }
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">{t("dashboard.roles.allBaseRoles")}</option>
            {BASE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">
            {t("dashboard.roles.filterStatusSr")}
          </span>
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as RoleStatusFilter)
            }
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function RoleListContent({
  state,
  error,
  roles,
  hasAnyRoles,
  onRetry,
  onClearFilters,
  effectivePermissions,
  onView,
  onEdit,
  onAssign,
  onLifecycle,
}: {
  state: ReturnType<typeof deriveRoleListViewState>["viewState"];
  error: string | null;
  roles: RoleView[];
  hasAnyRoles: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  effectivePermissions: Set<string>;
  onView: (role: RoleView) => void;
  onEdit: (role: RoleView) => void;
  onAssign: (role: RoleView) => void;
  onLifecycle: (type: LifecycleKind, role: RoleView) => void;
}) {
  const { t } = useI18n();
  if (state === "permissionLoading") {
    return <CenteredStatus text={t("dashboard.roles.loadingPermissions")} />;
  }
  if (state === "permissionDenied") {
    return (
      <div
        role="alert"
        className="p-6 text-center text-sm text-on-surface-variant"
      >
        {t("dashboard.roles.permissionDenied")}
      </div>
    );
  }
  if (state === "loading")
    return <CenteredStatus text={t("dashboard.roles.loadingRoles")} />;
  if (state === "error") {
    return (
      <div className="p-5">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {error ?? t("dashboard.roles.loadError")}
          <button type="button" className="ms-3 underline" onClick={onRetry}>
            {t("dashboard.roles.retry")}
          </button>
        </div>
      </div>
    );
  }
  if (state === "empty" || state === "filteredEmpty") {
    return (
      <div className="p-8 text-center">
        <span className="material-symbols-outlined text-[38px] text-outline">
          shield_person
        </span>
        <h2 className="mt-2 font-bold text-on-surface">
          {hasAnyRoles
            ? t("dashboard.roles.noMatchingRoles")
            : t("dashboard.roles.noCustomRolesYet")}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {hasAnyRoles
            ? t("dashboard.roles.adjustClearFilters")
            : t("dashboard.roles.createCustomRoleDesc")}
        </p>
        {state === "filteredEmpty" ? (
          <button
            type="button"
            className="mt-4 rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold"
            onClick={onClearFilters}
          >
            {t("dashboard.roles.clearFilters")}
          </button>
        ) : null}
      </div>
    );
  }

  const headings = [
    t("dashboard.roles.headingName"),
    t("dashboard.roles.headingBaseRole"),
    t("dashboard.roles.headingStatus"),
    t("dashboard.roles.headingUsers"),
    t("dashboard.roles.headingVersion"),
    t("dashboard.roles.headingActions"),
  ];

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-surface-container-low text-start">
            <tr>
              {headings.map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-start font-bold text-on-surface-variant"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                visibility={deriveRoleActionVisibility(
                  effectivePermissions,
                  role.status,
                )}
                onView={onView}
                onEdit={onEdit}
                onAssign={onAssign}
                onLifecycle={onLifecycle}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-outline-variant/30 md:hidden">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            visibility={deriveRoleActionVisibility(
              effectivePermissions,
              role.status,
            )}
            onView={onView}
            onEdit={onEdit}
            onAssign={onAssign}
            onLifecycle={onLifecycle}
          />
        ))}
      </div>
    </>
  );
}

function CenteredStatus({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 p-8 text-sm text-on-surface-variant"
    >
      <span className="material-symbols-outlined animate-spin">
        progress_activity
      </span>
      {text}
    </div>
  );
}

interface RoleActionProps {
  role: RoleView;
  visibility: ReturnType<typeof deriveRoleActionVisibility>;
  onView: (role: RoleView) => void;
  onEdit: (role: RoleView) => void;
  onAssign: (role: RoleView) => void;
  onLifecycle: (type: LifecycleKind, role: RoleView) => void;
}

function RoleRow(props: RoleActionProps) {
  const { role } = props;
  const { t } = useI18n();
  return (
    <tr className="hover:bg-surface-container-low/50">
      <td className="px-4 py-3 font-bold text-on-surface">{role.name}</td>
      <td className="px-4 py-3 text-on-surface-variant">
        {role.baseRole === "COMPANY_ADMIN"
          ? t("dashboard.roles.companyAdmin")
          : t("dashboard.roles.employee")}
      </td>
      <td className="px-4 py-3">
        {(() => {
          const roleStatus = role.status;
          return <StatusBadge status={roleStatus} />;
        })()}
      </td>
      <td className="px-4 py-3 text-on-surface-variant">{role.userCount}</td>
      <td className="px-4 py-3 font-mono text-on-surface-variant">
        v{role.version}
      </td>
      <td className="px-4 py-3">
        <RoleActionButtons {...props} />
      </td>
    </tr>
  );
}

function RoleCard(props: RoleActionProps) {
  const { role } = props;
  const { t, tPlural } = useI18n();
  const roleStatus = role.status;
  const baseRoleLabel =
    role.baseRole === "COMPANY_ADMIN"
      ? t("dashboard.roles.companyAdmin")
      : t("dashboard.roles.employee");
  const usersCountLabel = tPlural("dashboard.roles.usersCount", role.userCount, {
    count: String(role.userCount),
  });
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold text-on-surface">{role.name}</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            {baseRoleLabel} · {usersCountLabel} · v{role.version}
          </p>
        </div>
        <StatusBadge status={roleStatus} />
      </div>
      <div className="mt-3">
        <RoleActionButtons {...props} />
      </div>
    </article>
  );
}

function RoleActionButtons({
  role,
  visibility,
  onView,
  onEdit,
  onAssign,
  onLifecycle,
}: RoleActionProps) {
  const { t } = useI18n();
  const buttonClass =
    "rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold hover:bg-surface-container-low";
  return (
    <div className="flex flex-wrap gap-2">
      {visibility.canView ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onView(role)}
        >
          {t("dashboard.roles.actionView")}
        </button>
      ) : null}
      {visibility.canEdit ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            onView(role);
            onEdit(role);
          }}
        >
          {t("dashboard.roles.actionEdit")}
        </button>
      ) : null}
      {visibility.canAssign ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onAssign(role)}
        >
          {t("dashboard.roles.actionAssign")}
        </button>
      ) : null}
      {visibility.canClone ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onLifecycle("clone", role)}
        >
          {t("dashboard.roles.actionClone")}
        </button>
      ) : null}
      {visibility.canArchive ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onLifecycle("archive", role)}
        >
          {t("dashboard.roles.actionArchive")}
        </button>
      ) : null}
      {visibility.canReactivate ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onLifecycle("reactivate", role)}
        >
          {t("dashboard.roles.actionReactivate")}
        </button>
      ) : null}
      {visibility.canDelete ? (
        <button
          type="button"
          className={`${buttonClass} text-error`}
          onClick={() => onLifecycle("delete", role)}
        >
          {t("dashboard.roles.actionDelete")}
        </button>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: RoleView["status"] }) {
  const { t } = useI18n();
  return (
    <span
      className={
        status === "active"
          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900"
          : "inline-flex rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant"
      }
    >
      {status === "active"
        ? t("dashboard.roles.active")
        : t("dashboard.roles.archived")}
    </span>
  );
}

function PermissionEditor({
  groups,
  allEntries,
  actorGrants,
  inheritedIds,
  selectedGrants,
  onChange,
  loading,
  scopeOptions,
  scopeOptionsLoading,
  scopeOptionsError,
}: {
  groups: PermissionCatalogGroup[];
  allEntries: PermissionCatalogEntry[];
  actorGrants: ActorGrantMap;
  inheritedIds: string[];
  selectedGrants: PermissionGrant[];
  onChange: (grants: PermissionGrant[]) => void;
  loading: boolean;
  scopeOptions: RoleScopeOptions;
  scopeOptionsLoading: boolean;
  scopeOptionsError: string | null;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const entryById = useMemo(
    () => new Map(allEntries.map((entry) => [entry.id, entry])),
    [allEntries],
  );
  const inherited = new Set(inheritedIds);
  const selectedById = new Map(
    selectedGrants.map((grant) => [grant.permission, grant]),
  );
  const selectableIds = new Set(
    groups.flatMap((group) => group.permissions.map((entry) => entry.id)),
  );
  const unavailableSelected = selectedGrants.filter(
    (grant) =>
      !selectableIds.has(grant.permission) && !inherited.has(grant.permission),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter(
        (entry) =>
          !normalizedSearch ||
          `${entry.label} ${entry.description} ${entry.id}`
            .toLowerCase()
            .includes(normalizedSearch),
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  const updateGrant = (permission: string, next: PermissionGrant | null) => {
    const without = selectedGrants.filter(
      (grant) => grant.permission !== permission,
    );
    onChange(next ? [...without, next] : without);
  };

  if (loading)
    return <CenteredStatus text={t("dashboard.roles.catalogLoadError")} />;

  return (
    <section aria-labelledby="permission-editor-title" className="space-y-4">
      <div>
        <h3 id="permission-editor-title" className="font-bold text-on-surface">
          {t("dashboard.roles.permissions")}
        </h3>
        <p className="text-xs text-on-surface-variant">
          {t("dashboard.roles.scopeControlsDesc")}
        </p>
      </div>

      <div className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
        <p className="text-sm font-bold text-on-surface">
          {t("dashboard.roles.inheritedReadonly")}
        </p>
        {inheritedIds.length === 0 ? (
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("dashboard.roles.noInherited")}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {inheritedIds.map((id) => (
              <span
                key={id}
                className="rounded-full bg-surface px-2 py-1 text-xs text-on-surface-variant"
                aria-readonly="true"
              >
                {entryById.get(id)?.label ?? id} ·{" "}
                {t("dashboard.roles.inheritedBadge")}
              </span>
            ))}
          </div>
        )}
      </div>

      <label className="block">
        <span className="sr-only">
          {t("dashboard.roles.searchPermissionsSr")}
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("dashboard.roles.searchPermissionsPlaceholder")}
          className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </label>

      {unavailableSelected.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-sm font-bold text-amber-950">
            {t("dashboard.roles.existingGrantsNoLongerSelectable")}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {t("dashboard.roles.removeGrantsHelp")}
          </p>
          <ul className="mt-2 space-y-2">
            {unavailableSelected.map((grant) => (
              <li
                key={grant.permission}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {entryById.get(grant.permission)?.label ?? grant.permission}
                </span>
                <button
                  type="button"
                  className="rounded border border-amber-400 px-2 py-1 text-xs font-bold"
                  onClick={() => updateGrant(grant.permission, null)}
                >
                  {t("dashboard.roles.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {filteredGroups.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {t("dashboard.roles.noSelectableMatch")}
        </p>
      ) : (
        <div className="max-h-[34rem] space-y-2 overflow-y-auto rounded-lg border border-outline-variant/30 p-2">
          {filteredGroups.map((group) => {
            const open = expanded.has(group.group) || Boolean(normalizedSearch);
            return (
              <div
                key={group.group}
                className="rounded-lg border border-outline-variant/20"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-start font-bold"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(group.group)) next.delete(group.group);
                      else next.add(group.group);
                      return next;
                    })
                  }
                >
                  {group.label}
                  <span className="material-symbols-outlined">
                    {open ? "expand_less" : "expand_more"}
                  </span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-outline-variant/20 p-3">
                    {group.permissions.map((entry) => {
                      const grant = selectedById.get(entry.id);
                      const actorGrant = actorGrants[entry.id];
                      const checked = Boolean(grant);
                      return (
                        <div
                          key={entry.id}
                          className="rounded-lg bg-surface-container-lowest p-3"
                        >
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() =>
                                updateGrant(
                                  entry.id,
                                  checked
                                    ? null
                                    : {
                                        permission: entry.id,
                                        ...(entry.compatibleScopes.length > 0
                                          ? { scopes: emptyPermissionScopes() }
                                          : {}),
                                      },
                                )
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-bold text-on-surface">
                                {entry.label}
                              </span>
                              <span className="block text-xs text-on-surface-variant">
                                {entry.description}
                              </span>
                              <span className="mt-1 block text-[11px] text-on-surface-variant">
                                {t("dashboard.roles.actorInfo", {
                                  source:
                                    actorGrant?.source ??
                                    t("dashboard.roles.actorSourceUnavailable"),
                                  scope: formatScope(actorGrant?.scope, t),
                                })}
                              </span>
                            </span>
                          </label>
                          {checked && entry.compatibleScopes.length > 0 ? (
                            <ScopeControls
                              entry={entry}
                              actorScope={actorGrant?.scope ?? null}
                              value={normalizeScopesForPermission(
                                grant?.scopes ?? emptyPermissionScopes(),
                                entry.compatibleScopes,
                              )}
                              onChange={(scopes) =>
                                updateGrant(entry.id, {
                                  permission: entry.id,
                                  scopes,
                                })
                              }
                              scopeOptions={scopeOptions}
                              scopeOptionsLoading={scopeOptionsLoading}
                              scopeOptionsError={scopeOptionsError}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ScopeControls({
  entry,
  actorScope,
  value,
  onChange,
  scopeOptions,
  scopeOptionsLoading,
  scopeOptionsError,
}: {
  entry: PermissionCatalogEntry;
  actorScope: PermissionScopes | null;
  value: PermissionScopes;
  onChange: (value: PermissionScopes) => void;
  scopeOptions: RoleScopeOptions;
  scopeOptionsLoading: boolean;
  scopeOptionsError: string | null;
}) {
  const { t } = useI18n();
  const control = (dimension: PermissionScopeType) =>
    entry.compatibleScopes.includes(dimension);

  return (
    <fieldset className="mt-3 space-y-3 rounded-lg border border-outline-variant/30 p-3">
      <legend className="px-1 text-xs font-bold text-on-surface">
        {t("dashboard.roles.delegatedScope")}
      </legend>
      <p className="text-[11px] text-on-surface-variant">
        {t("dashboard.roles.submittedScopeHelp", {
          scope: formatScope(actorScope, t),
        })}
      </p>
      {control("selfOnly") ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.selfOnly}
            onChange={(event) =>
              onChange({ ...value, selfOnly: event.target.checked })
            }
          />
          {t("dashboard.roles.scopeSelfOnly")}
        </label>
      ) : null}
      {control("departmentIds") ? (
        <ScopeOptionPicker
          label={t("dashboard.roles.deptIdsLabel")}
          options={scopeOptions.departments}
          archived={scopeOptions.archived.departments}
          selected={value.departmentIds}
          valueKey="id"
          dimension="departmentIds"
          actorScope={actorScope}
          loading={scopeOptionsLoading}
          error={scopeOptionsError}
          onChange={(next) => onChange({ ...value, departmentIds: next })}
        />
      ) : null}
      {control("documentCategories") ? (
        <ScopeOptionPicker
          label={t("dashboard.roles.docCategoriesLabel")}
          options={scopeOptions.categories}
          archived={scopeOptions.archived.categories}
          selected={value.documentCategories}
          valueKey="name"
          dimension="documentCategories"
          actorScope={actorScope}
          loading={scopeOptionsLoading}
          error={scopeOptionsError}
          onChange={(next) => onChange({ ...value, documentCategories: next })}
        />
      ) : null}
      {control("documentClassifications") ? (
        <ScopeOptionPicker
          label={t("dashboard.roles.docClassificationsLabel")}
          options={scopeOptions.classifications}
          archived={scopeOptions.archived.classifications}
          selected={value.documentClassifications}
          valueKey="name"
          dimension="documentClassifications"
          actorScope={actorScope}
          loading={scopeOptionsLoading}
          error={scopeOptionsError}
          onChange={(next) =>
            onChange({ ...value, documentClassifications: next })
          }
        />
      ) : null}
    </fieldset>
  );
}

function RoleDetailsDialog({
  role,
  loading,
  error,
  catalog,
  catalogEntries,
  selectableGroups,
  actorGrants,
  scopeOptions,
  scopeOptionsLoading,
  scopeOptionsError,
  editing,
  editName,
  editBaseRole,
  editGrants,
  editError,
  editSubmitting,
  editStale,
  editHasChanges,
  canEdit,
  onClose,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onEditNameChange,
  onEditBaseRoleChange,
  onEditGrantsChange,
  onSave,
  onReloadLatest,
}: {
  role: RoleView | null;
  loading: boolean;
  error: string | null;
  catalog: CatalogData | null;
  catalogEntries: PermissionCatalogEntry[];
  selectableGroups: PermissionCatalogGroup[];
  actorGrants: ActorGrantMap;
  scopeOptions: RoleScopeOptions;
  scopeOptionsLoading: boolean;
  scopeOptionsError: string | null;
  editing: boolean;
  editName: string;
  editBaseRole: TenantBaseRole;
  editGrants: PermissionGrant[];
  editError: string | null;
  editSubmitting: boolean;
  editStale: boolean;
  editHasChanges: boolean;
  canEdit: boolean;
  onClose: () => void;
  onRetry: () => void;
  onStartEdit: (role: RoleView) => void;
  onCancelEdit: () => void;
  onEditNameChange: (value: string) => void;
  onEditBaseRoleChange: (value: TenantBaseRole) => void;
  onEditGrantsChange: (value: PermissionGrant[]) => void;
  onSave: () => void;
  onReloadLatest: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalKeyboard(onClose, editSubmitting);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const inheritedIds =
    role && catalog
      ? deriveInheritedPermissionIds(
          catalog.baseRoleDefaults,
          editing ? editBaseRole : role.baseRole,
        )
      : [];
  const entryById = new Map(catalogEntries.map((entry) => [entry.id, entry]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-details-title"
    >
      <DashboardPanel className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/30 p-4">
          <div>
            <h2
              id="role-details-title"
              className="text-title-lg font-bold text-primary"
            >
              {role?.name ?? t("dashboard.roles.roleDetails")}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {t("dashboard.roles.authoritativeRoleData")}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("dashboard.roles.closeRoleDetails")}
            onClick={onClose}
            className="rounded-full p-2 hover:bg-surface-container"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <CenteredStatus text={t("dashboard.roles.loadingRoleDetails")} />
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              {error}
              <button
                type="button"
                className="ms-3 underline"
                onClick={onRetry}
              >
                {t("dashboard.roles.retry")}
              </button>
            </div>
          ) : role ? (
            <>
              {editing ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-bold">
                      {t("dashboard.roles.roleNameLabel")}
                      <input
                        value={editName}
                        onChange={(event) =>
                          onEditNameChange(event.target.value)
                        }
                        maxLength={50}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <label className="text-sm font-bold">
                      {t("dashboard.roles.baseRoleLabel")}
                      <select
                        value={editBaseRole}
                        onChange={(event) =>
                          onEditBaseRoleChange(
                            event.target.value as TenantBaseRole,
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary"
                      >
                        {BASE_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <PermissionEditor
                    groups={selectableGroups}
                    allEntries={catalogEntries}
                    actorGrants={actorGrants}
                    inheritedIds={inheritedIds}
                    selectedGrants={editGrants}
                    onChange={onEditGrantsChange}
                    loading={false}
                    scopeOptions={scopeOptions}
                    scopeOptionsLoading={scopeOptionsLoading}
                    scopeOptionsError={scopeOptionsError}
                  />
                  {editError ? (
                    <div
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                    >
                      {editError}
                      {editStale ? (
                        <button
                          type="button"
                          className="ms-3 underline"
                          onClick={onReloadLatest}
                        >
                          {t("dashboard.roles.reloadLatest")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/30 pt-4">
                    <button
                      type="button"
                      className="rounded-lg border border-outline-variant px-4 py-2 font-bold"
                      onClick={onCancelEdit}
                      disabled={editSubmitting}
                    >
                      {t("dashboard.roles.cancel")}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50"
                      onClick={onSave}
                      disabled={editSubmitting || editStale || !editHasChanges}
                    >
                      {editSubmitting
                        ? t("dashboard.roles.saving")
                        : t("dashboard.roles.saveChanges")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Meta
                      label={t("dashboard.roles.headingBaseRole")}
                      value={
                        role.baseRole === "COMPANY_ADMIN"
                          ? t("dashboard.roles.companyAdmin")
                          : t("dashboard.roles.employee")
                      }
                    />
                    <Meta
                      label={t("dashboard.roles.headingStatus")}
                      value={
                        role.status === "active"
                          ? t("dashboard.roles.active")
                          : t("dashboard.roles.archived")
                      }
                    />
                    <Meta
                      label={t("dashboard.roles.assignedUsers")}
                      value={String(role.userCount)}
                    />
                    <Meta
                      label={t("dashboard.roles.version")}
                      value={`v${role.version}`}
                    />
                    <Meta
                      label={t("dashboard.roles.created")}
                      value={role.createdAt}
                    />
                    <Meta
                      label={t("dashboard.roles.updated")}
                      value={role.updatedAt}
                    />
                  </dl>
                  <section>
                    <h3 className="font-bold text-on-surface">
                      {t("dashboard.roles.inheritedReadonly")}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {inheritedIds.map((id) => (
                        <span
                          key={id}
                          className="rounded-full bg-surface-container px-2 py-1 text-xs"
                        >
                          {entryById.get(id)?.label ?? id}
                        </span>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="font-bold text-on-surface">
                      {t("dashboard.roles.explicitGrants")}
                    </h3>
                    {role.grants.length === 0 ? (
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {t("dashboard.roles.noExplicitGrants")}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {role.grants.map((grant) => (
                          <li
                            key={grant.permission}
                            className="rounded-lg border border-outline-variant/30 p-3 text-sm"
                          >
                            <p className="font-bold">
                              {entryById.get(grant.permission)?.label ??
                                grant.permission}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {formatScope(grant.scopes, t)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <div className="flex justify-end border-t border-outline-variant/30 pt-4">
                    {canEdit ? (
                      <button
                        type="button"
                        className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary"
                        onClick={() => onStartEdit(role)}
                      >
                        {t("dashboard.roles.editRole")}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </DashboardPanel>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="mt-1 break-words font-medium text-on-surface">{value}</dd>
    </div>
  );
}

function LifecycleDialog({
  lifecycle,
  cloneName,
  onCloneNameChange,
  usageCount,
  usageLoading,
  deleteFlow,
  canMigrate,
  destinations,
  destinationId,
  onDestinationChange,
  migrationResult,
  migrationSubmitting,
  submitting,
  stale,
  error,
  onConfirm,
  onMigrate,
  onReloadLatest,
  onCancel,
}: {
  lifecycle: LifecycleState;
  cloneName: string;
  onCloneNameChange: (value: string) => void;
  usageCount: number | null;
  usageLoading: boolean;
  deleteFlow: ReturnType<typeof deriveDeleteFlowState>;
  canMigrate: boolean;
  destinations: RoleView[];
  destinationId: string;
  onDestinationChange: (value: string) => void;
  migrationResult: MigrationResult | null;
  migrationSubmitting: boolean;
  submitting: boolean;
  stale: boolean;
  error: string | null;
  onConfirm: () => void;
  onMigrate: () => void;
  onReloadLatest: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalKeyboard(onCancel, submitting || migrationSubmitting);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const title =
    lifecycle.type === "clone"
      ? t("dashboard.roles.dialogCloneTitle")
      : lifecycle.type === "archive"
        ? t("dashboard.roles.dialogArchiveTitle")
        : lifecycle.type === "reactivate"
          ? t("dashboard.roles.dialogReactivateTitle")
          : t("dashboard.roles.dialogDeleteTitle");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lifecycle-title"
    >
      <DashboardPanel className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
        <div className="flex items-start justify-between border-b border-outline-variant/30 p-4">
          <div>
            <h2
              id="lifecycle-title"
              className="text-title-lg font-bold text-primary"
            >
              {title}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {lifecycle.role.name} · v{lifecycle.role.version}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("dashboard.roles.closeConfirmation")}
            onClick={onCancel}
            disabled={submitting || migrationSubmitting}
            className="rounded-full p-2"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 p-4">
          {lifecycle.type === "clone" ? (
            <label className="block text-sm font-bold">
              {t("dashboard.roles.cloneName")}
              <input
                value={cloneName}
                onChange={(event) => onCloneNameChange(event.target.value)}
                maxLength={50}
                className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          ) : null}
          {lifecycle.type === "archive" ? (
            <p className="text-sm text-on-surface-variant">
              {t("dashboard.roles.archivedHelp")}
            </p>
          ) : null}
          {lifecycle.type === "reactivate" ? (
            <p className="text-sm text-on-surface-variant">
              {t("dashboard.roles.reactivateHelp")}
            </p>
          ) : null}
          {lifecycle.type === "delete" ? (
            <div className="space-y-4">
              {usageLoading ? (
                <CenteredStatus
                  text={t("dashboard.roles.checkingAuthoritativeUsage")}
                />
              ) : (
                <div className="rounded-lg bg-surface-container-low p-3 text-sm">
                  <p className="font-bold">
                    {usageCount !== null
                      ? t("dashboard.roles.assignedUsersCount", {
                          count: String(usageCount),
                        })
                      : t("dashboard.roles.assignedUsersUnknown")}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t("dashboard.roles.deletionZeroNotice")}
                  </p>
                </div>
              )}
              {deleteFlow.requiresMigration ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-bold text-amber-950">
                    {t("dashboard.roles.migrationRequired")}
                  </h3>
                  {canMigrate ? (
                    <>
                      <label className="mt-3 block text-sm font-bold text-amber-950">
                        {t("dashboard.roles.destinationRole")}
                        <select
                          value={destinationId}
                          onChange={(event) =>
                            onDestinationChange(event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-normal"
                        >
                          <option value="">
                            {t("dashboard.roles.selectDestination")}
                          </option>
                          {destinations.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name} · v{role.version}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="mt-3 rounded-lg bg-amber-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        disabled={
                          !destinationId || migrationSubmitting || stale
                        }
                        onClick={onMigrate}
                      >
                        {migrationSubmitting
                          ? t("dashboard.roles.migrating")
                          : t("dashboard.roles.migrateUsers")}
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-amber-900">
                      {t("dashboard.roles.needUsersAssignRole")}
                    </p>
                  )}
                </div>
              ) : null}
              {migrationResult ? (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                >
                  {t("dashboard.roles.migrationResult", {
                    affected: String(migrationResult.affected),
                    skipped: String(migrationResult.skipped),
                    conflicted: String(migrationResult.conflicted),
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            >
              {error}
              {stale ? (
                <button
                  type="button"
                  className="ms-3 underline"
                  onClick={onReloadLatest}
                >
                  {t("dashboard.roles.reloadLatest")}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-outline-variant/30 pt-4">
            <button
              type="button"
              className="rounded-lg border border-outline-variant px-4 py-2 font-bold"
              onClick={onCancel}
              disabled={submitting || migrationSubmitting}
            >
              {t("dashboard.roles.cancel")}
            </button>
            <button
              type="button"
              className={
                lifecycle.type === "delete"
                  ? "rounded-lg bg-error px-4 py-2 font-bold text-on-error disabled:opacity-50"
                  : "rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50"
              }
              onClick={onConfirm}
              disabled={
                submitting ||
                stale ||
                (lifecycle.type === "delete" && !deleteFlow.canDelete)
              }
            >
              {submitting
                ? t("dashboard.roles.processing")
                : lifecycle.type === "delete"
                  ? t("dashboard.roles.actionDelete")
                  : lifecycle.type === "archive"
                    ? t("dashboard.roles.actionArchive")
                    : lifecycle.type === "reactivate"
                      ? t("dashboard.roles.actionReactivate")
                      : t("dashboard.roles.actionClone")}
            </button>
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}

function UserAssignmentDialog({
  role,
  users,
  search,
  onSearchChange,
  loading,
  saving,
  error,
  stale,
  onAssign,
  onRemove,
  onReloadLatest,
  onClose,
}: {
  role: RoleView;
  users: UserView[];
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  saving: Record<string, boolean>;
  error: string | null;
  stale: boolean;
  onAssign: (userId: string) => void;
  onRemove: (userId: string) => void;
  onReloadLatest: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalKeyboard(onClose, false);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = users.filter(
    (user) =>
      !normalizedSearch ||
      `${user.name} ${user.email}`.toLowerCase().includes(normalizedSearch),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assignment-title"
    >
      <DashboardPanel className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between border-b border-outline-variant/30 p-4">
          <div>
            <h2
              id="assignment-title"
              className="text-title-lg font-bold text-primary"
            >
              {t("dashboard.roles.assignmentsTitle", { name: role.name })}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {t("dashboard.roles.roleVersionSubtitle", {
                version: String(role.version),
              })}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("dashboard.roles.closeAssignments")}
            onClick={onClose}
            className="rounded-full p-2"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <label className="block">
            <span className="sr-only">
              {t("dashboard.roles.searchUsersSr")}
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("dashboard.roles.searchUsersPlaceholder")}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
            >
              {error}
              {stale ? (
                <button
                  type="button"
                  className="ms-3 underline"
                  onClick={onReloadLatest}
                >
                  {t("dashboard.roles.reloadLatest")}
                </button>
              ) : null}
            </div>
          ) : null}
          {loading ? (
            <CenteredStatus text={t("dashboard.roles.loadingUsers")} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-on-surface-variant">
              {t("dashboard.roles.noUsersFound")}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[680px] w-full text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-3 py-2 text-start">
                      {t("dashboard.roles.headingUser")}
                    </th>
                    <th className="px-3 py-2 text-start">
                      {t("dashboard.roles.headingBaseRole")}
                    </th>
                    <th className="px-3 py-2 text-start">
                      {t("dashboard.roles.headingStatus")}
                    </th>
                    <th className="px-3 py-2 text-start">
                      {t("dashboard.roles.headingAction")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filtered.map((user) => {
                    const assigned = user.customRoleId === role.id;
                    const compatible = user.role === role.baseRole;
                    const busy = Boolean(saving[user.id]);
                    return (
                      <tr key={user.id}>
                        <td className="px-3 py-2">
                          <p className="font-bold">{user.name}</p>
                          <p className="text-xs text-on-surface-variant">
                            {user.email}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          {user.role}
                          {!compatible ? (
                            <p className="text-xs text-error">
                              {t("dashboard.roles.baseRoleMismatch")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{user.status}</td>
                        <td className="px-3 py-2">
                          {assigned ? (
                            <button
                              type="button"
                              className="rounded border border-error/40 px-3 py-1.5 text-xs font-bold text-error disabled:opacity-50"
                              disabled={busy || stale}
                              onClick={() => onRemove(user.id)}
                            >
                              {busy
                                ? t("dashboard.roles.removing")
                                : t("dashboard.roles.remove")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50"
                              disabled={
                                busy ||
                                stale ||
                                !compatible ||
                                role.status !== "active"
                              }
                              onClick={() => onAssign(user.id)}
                            >
                              {busy
                                ? t("dashboard.roles.assigning")
                                : t("dashboard.roles.actionAssign")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DashboardPanel>
    </div>
  );
}

function useModalKeyboard(onClose: () => void, disabled: boolean) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, onClose]);
}
