import { getSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "./_components/change-password-form";
import { userRoleLabel } from "@/lib/enums";

export default async function ProfilePage() {
  const session = await getSession();
  const user = session!.user;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">个人信息</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <Item label="姓名">{user.name}</Item>
          <Item label="邮箱" mono>{user.email}</Item>
          <Item label="角色">{userRoleLabel[user.role as keyof typeof userRoleLabel] ?? user.role}</Item>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">修改密码</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}

function Item({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 ${mono ? "font-mono tabular" : ""}`}>{children}</dd>
    </div>
  );
}
