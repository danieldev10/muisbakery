import { AdminFormModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { AdminUser } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { type AppRole, roleLabels, roles } from "@/lib/roles";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { createUser } from "./actions";
import { EditUserButton } from "./edit-user-modal";

const roleOptions = roles.map((role) => ({
  value: role,
  label: roleLabels[role],
}));

const roleBadgeClasses: Record<AppRole, string> = {
  ADMIN: "bg-red-50 text-red-800",
  STORE: "bg-amber-50 text-amber-800",
  PRODUCTION: "bg-sky-50 text-sky-800",
  SALES: "bg-emerald-50 text-emerald-800",
  MANAGEMENT: "bg-indigo-50 text-indigo-800",
};

function initials(user: AdminUser) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";

  return `${first}${second}`.toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }
  return new Date(value).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const users = await apiGet<AdminUser[]>("/admin/users");
  const query = firstParam(params, "q");
  const roleFilter = firstParam(params, "role");
  const statusFilter = firstParam(params, "status");
  const filteredUsers = users.filter(
    (user) =>
      matchesSearch(query, [
        user.name,
        user.email,
        user.recoveryEmail,
        roleLabels[user.role],
        user.role,
      ]) &&
      matchesSelect(roleFilter, user.role) &&
      matchesSelect(statusFilter, user.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredUsers,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          All users ({filteredUsers.length} of {users.length})
        </h2>
        <AdminFormModal
          action={createUser}
          description="Create a staff login and assign the correct department role."
          submitLabel="Create user"
          title="Add user"
          triggerLabel="Add user"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" placeholder="Full name" />
            <Field
              label="Email"
              name="email"
              placeholder="name@muisbakery.com"
              required
              type="email"
            />
            <Field
              hint="Used only for online password recovery."
              label="Recovery email"
              name="recoveryEmail"
              placeholder="staff@example.com"
              type="email"
            />
            <Field
              hint="At least 8 characters."
              label="Password"
              name="password"
              required
              type="password"
            />
            <SelectField
              label="Role"
              name="role"
              options={roleOptions}
              placeholder="Select role"
              required
            />
          </div>
        </AdminFormModal>
      </div>

      <div>
        {users.length > 0 ? (
          <TableToolbar
            basePath="/admin/users"
            searchParams={params}
            searchPlaceholder="Search name, email, recovery email, or role"
            selectFilters={[
              {
                label: "Role",
                name: "role",
                options: roleOptions,
              },
              {
                label: "Status",
                name: "status",
                options: [
                  { label: "Active", value: "true" },
                  { label: "Inactive", value: "false" },
                ],
              },
            ]}
          />
        ) : null}
        {users.length === 0 ? (
          <EmptyState>No users yet.</EmptyState>
        ) : filteredUsers.length === 0 ? (
          <EmptyState>No users match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last login</th>
                <th className="py-2 pr-4">Actions</th>
              </>
            }
          >
            {pageItems.map((user) => (
              <tr
                className={user.isActive ? "align-middle" : "align-middle opacity-55"}
                key={user.id}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${roleBadgeClasses[user.role]}`}
                    >
                      {initials(user)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900">
                        {user.name || "—"}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {user.email}
                      </p>
                      <p className="truncate text-xs text-stone-400">
                        {user.recoveryEmail ?? "Recovery not configured"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClasses[user.role]}`}
                  >
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${
                        user.isActive ? "bg-emerald-500" : "bg-stone-300"
                      }`}
                    />
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(user.lastLoginAt)}
                </td>
                <td className="py-3 pr-4">
                  <EditUserButton user={user} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/admin/users"
          searchParams={params}
          {...pagination}
        />
      </div>
    </Card>
  );
}
