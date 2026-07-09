import { AdminForm } from "@/components/admin/admin-form";
import { Field, SelectField } from "@/components/admin/form-controls";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { AdminUser } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { roleLabels, roles } from "@/lib/roles";
import { apiGet } from "@/lib/server-api";

import { createUser, setUserActive, setUserRole } from "./actions";

const roleOptions = roles.map((role) => ({
  value: role,
  label: roleLabels[role],
}));

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
  const { pageItems, ...pagination } = paginate(users, pageNumber(params.page));

  return (
    <>
      <PageHeader
        title="Users"
        description="Create staff accounts and control their access by role."
      />

      <Card title="Add user">
        <AdminForm action={createUser} submitLabel="Create user">
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
              label="Password"
              name="password"
              hint="At least 8 characters."
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
        </AdminForm>
      </Card>

      <Card title={`All users (${users.length})`}>
        {users.length === 0 ? (
          <EmptyState>No users yet.</EmptyState>
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
              <tr className="align-top" key={user.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">
                    {user.name || "—"}
                  </p>
                  <p className="text-xs text-stone-500">{user.email}</p>
                </td>
                <td className="py-3 pr-4">
                  <InlineActionForm
                    action={setUserRole}
                    className="flex flex-wrap items-center gap-2"
                    submitLabel="Save"
                  >
                    <input name="id" type="hidden" value={user.id} />
                    <select
                      className="h-8 rounded-md border border-stone-300 bg-white px-2 text-xs"
                      defaultValue={user.role}
                      name="role"
                    >
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </InlineActionForm>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge active={user.isActive} />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(user.lastLoginAt)}
                </td>
                <td className="py-3 pr-4">
                  <InlineActionForm
                    action={setUserActive}
                    submitLabel={user.isActive ? "Deactivate" : "Activate"}
                  >
                    <input name="id" type="hidden" value={user.id} />
                    <input
                      name="isActive"
                      type="hidden"
                      value={user.isActive ? "false" : "true"}
                    />
                  </InlineActionForm>
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
      </Card>
    </>
  );
}
