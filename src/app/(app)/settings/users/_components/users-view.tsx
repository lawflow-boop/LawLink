"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  KeyRound,
  CircleOff,
  CircleDot,
  Loader2,
  Users as UsersIcon
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  createUser,
  updateUserRole,
  toggleUserActive,
  resetUserPassword
} from "@/server/users/actions";
import { userRoleLabel } from "@/lib/enums";

const ROLES: UserRole[] = ["ADMIN", "PRINCIPAL_LAWYER", "LAWYER", "ASSISTANT", "FINANCE"];

const createSchema = z.object({
  name: z.string().min(1).max(40),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "PRINCIPAL_LAWYER", "LAWYER", "ASSISTANT", "FINANCE"]),
  phone: z.string().max(30).optional()
});
type CreateValues = z.infer<typeof createSchema>;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  _count: { ownedMatters: number; memberships: number };
};

export function UsersView({
  users,
  currentUserId
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UsersIcon className="h-4 w-4 text-primary" />
          用户管理 <span className="text-muted-foreground">({users.length})</span>
        </h2>
        <Button onClick={() => setSheetOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          新增用户
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-popover">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">姓名 / 邮箱</th>
              <th className="px-5 py-3 font-medium">角色</th>
              <th className="px-5 py-3 font-medium">案件</th>
              <th className="px-5 py-3 font-medium">最近登录</th>
              <th className="px-5 py-3 font-medium">状态</th>
              <th className="px-5 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onResetPassword={() => setResetUser(u)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <ResetPasswordDialog
        user={resetUser}
        onClose={() => setResetUser(null)}
      />
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onResetPassword
}: {
  user: UserRow;
  isSelf: boolean;
  onResetPassword: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(role: UserRole) {
    if (role === user.role) return;
    startTransition(async () => {
      try {
        await updateUserRole({ id: user.id, role });
        toast.success("角色已更新");
      } catch (err) {
        toast.error("更新失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  function handleToggleActive() {
    if (
      !confirm(user.active ? `禁用 ${user.name}？禁用后该用户无法登录。` : `重新激活 ${user.name}？`)
    )
      return;
    startTransition(async () => {
      try {
        const res = await toggleUserActive(user.id);
        toast.success(res.active ? "已激活" : "已禁用");
      } catch (err) {
        toast.error("操作失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <tr className={user.active ? "" : "opacity-60"}>
      <td className="px-5 py-3">
        <div className="font-medium">{user.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-5 py-3">
        {isSelf ? (
          <Badge variant="secondary" className="text-[10px]">
            {userRoleLabel[user.role]}（自己）
          </Badge>
        ) : (
          <Select
            value={user.role}
            onValueChange={(v) => handleRoleChange(v as UserRole)}
            disabled={isPending}
          >
            <SelectTrigger className="h-8 w-32 bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {userRoleLabel[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-5 py-3 font-mono text-xs tabular text-muted-foreground">
        主办 {user._count.ownedMatters} · 参与 {user._count.memberships}
      </td>
      <td className="px-5 py-3 font-mono text-xs text-muted-foreground tabular">
        {user.lastLoginAt
          ? new Date(user.lastLoginAt).toLocaleDateString("zh-CN")
          : "从未登录"}
      </td>
      <td className="px-5 py-3">
        <Badge
          variant={user.active ? "secondary" : "outline"}
          className="text-[10px]"
        >
          {user.active ? "已激活" : "已禁用"}
        </Badge>
      </td>
      <td className="px-5 py-3">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetPassword}
            disabled={isPending}
            className="h-7 gap-1 text-xs"
          >
            <KeyRound className="h-3.5 w-3.5" />
            改密码
          </Button>
          {!isSelf && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleActive}
              disabled={isPending}
              className={`h-7 gap-1 text-xs ${user.active ? "text-destructive" : "text-[#4ADE80]"}`}
            >
              {user.active ? (
                <>
                  <CircleOff className="h-3.5 w-3.5" />
                  禁用
                </>
              ) : (
                <>
                  <CircleDot className="h-3.5 w-3.5" />
                  激活
                </>
              )}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CreateUserSheet({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "LAWYER",
      phone: ""
    }
  });

  function onSubmit(values: CreateValues) {
    startTransition(async () => {
      try {
        await createUser(values);
        toast.success("用户已创建");
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error("创建失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border bg-background px-6 py-4">
          <SheetTitle>新增用户</SheetTitle>
          <SheetDescription className="text-xs">
            初始密码可让用户登录后自行修改
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            <SheetField label="姓名" required error={errors.name?.message}>
              <Input {...register("name")} />
            </SheetField>
            <SheetField label="邮箱" required error={errors.email?.message}>
              <Input type="email" className="font-mono" {...register("email")} />
            </SheetField>
            <SheetField label="初始密码（至少 8 位）" required error={errors.password?.message}>
              <Input type="text" className="font-mono" {...register("password")} />
            </SheetField>
            <SheetField label="角色" required>
              <Select
                value={watch("role")}
                onValueChange={(v) =>
                  setValue("role", v as CreateValues["role"], { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {userRoleLabel[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SheetField>
            <SheetField label="电话">
              <Input className="font-mono" {...register("phone")} />
            </SheetField>
          </div>

          <SheetFooter className="border-t border-border bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="gap-1.5">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              创建
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ResetPasswordDialog({
  user,
  onClose
}: {
  user: UserRow | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [pwd, setPwd] = useState("");

  function handleReset() {
    if (!user) return;
    if (pwd.length < 8) {
      toast.warning("密码至少 8 位");
      return;
    }
    startTransition(async () => {
      try {
        await resetUserPassword({ id: user.id, newPassword: pwd });
        toast.success(`已重置 ${user.name} 的密码`);
        setPwd("");
        onClose();
      } catch (err) {
        toast.error("失败", { description: err instanceof Error ? err.message : "" });
      }
    });
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置 {user?.name} 的密码</DialogTitle>
          <DialogDescription>
            管理员重置后，用户使用新密码登录。建议线下告知用户。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">新密码（至少 8 位）</Label>
          <Input
            type="text"
            className="font-mono"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleReset} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            重置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetField({
  label,
  required,
  error,
  children
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
