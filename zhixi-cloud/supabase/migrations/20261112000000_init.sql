-- ============================================================
-- 知隙 · Supabase 初始化迁移
-- 在 Supabase Dashboard → SQL Editor 或 `supabase db push` 中执行。
-- 设计原则：
--   1. 所有业务表都启用 RLS，客户端只能访问 auth.uid() 自己的行。
--   2. questions 使用 (user_id, id) 复合主键，前端字符串 id 可无损迁移。
--   3. 删除采用 deleted_at 软删除，避免多设备同步时把已删除的题复活。
--   4. 图片放在私有 Storage bucket，路径第一段必须是 user_id。
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 用户资料
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  phone text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '用户公开资料。RLS 限制每个用户只能读取/修改自己的资料。';

-- ------------------------------------------------------------
-- 2. 用户设置与标签
-- ------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tags text[] not null default array[
    '微观经济学',
    '宏观经济学',
    '计量经济学',
    '政治经济学',
    '数三',
    '英语'
  ]::text[],
  notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_tags_limit check (cardinality(tags) <= 60)
);

comment on table public.user_settings is '每个用户的标签集合、通知开关和同步设置。';

-- ------------------------------------------------------------
-- 3. 错题（文本 + 图片云端路径 + 复习记录）
-- ------------------------------------------------------------
create table if not exists public.questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  stem text not null,
  answer text not null default '',
  analysis text not null default '',
  image_path text,
  tags text[] not null default '{}'::text[],
  mastery text not null default 'unmastered'
    check (mastery in ('unmastered', 'normal', 'mastered')),
  next_review date not null default current_date,
  review_stage integer not null default 0
    check (review_stage between 0 and 7),
  review_history jsonb not null default '[]'::jsonb,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  constraint questions_id_format check (id ~ '^[A-Za-z0-9_-]{4,90}$'),
  constraint questions_stem_length check (char_length(stem) between 1 and 30000),
  constraint questions_answer_length check (char_length(answer) <= 30000),
  constraint questions_analysis_length check (char_length(analysis) <= 30000),
  constraint questions_tags_limit check (cardinality(tags) <= 12),
  constraint questions_image_path_format check (
    image_path is null
    or (
      image_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]{4,90}/[0-9]+-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$'
      and split_part(image_path, '/', 1) = user_id::text
    )
  )
);

comment on table public.questions is '错题的云端主表；review_history 保留每一次艾宾浩斯反馈。';
comment on column public.questions.image_path is '私有 Storage 中的对象路径，格式：<user_id>/<question_id>/<timestamp>-<random>.jpg';
comment on column public.questions.deleted_at is '软删除时间；多设备同步通过墓碑标记删除。';

create index if not exists questions_user_updated_idx
  on public.questions (user_id, updated_at desc);
create index if not exists questions_user_next_review_idx
  on public.questions (user_id, next_review)
  where deleted_at is null;
create index if not exists questions_user_deleted_idx
  on public.questions (user_id, deleted_at)
  where deleted_at is not null;

-- ------------------------------------------------------------
-- 4. OAuth 身份映射（微信 / QQ）
--    只由 Edge Function 使用 service_role 访问，客户端 RLS 无策略。
-- ------------------------------------------------------------
create table if not exists public.oauth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('wechat', 'qq')),
  provider_uid text not null,
  union_id text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (provider, provider_uid)
);

create index if not exists oauth_identities_user_idx
  on public.oauth_identities (user_id);

comment on table public.oauth_identities is '微信/QQ openid 与 Supabase auth.users 的映射，只允许 service_role 访问。';

-- ------------------------------------------------------------
-- 5. OAuth state（防 CSRF，10 分钟过期，只由 Edge Function 访问）
-- ------------------------------------------------------------
create table if not exists public.oauth_states (
  state text primary key,
  provider text not null check (provider in ('wechat', 'qq')),
  redirect_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_expires_idx
  on public.oauth_states (expires_at);

comment on table public.oauth_states is '微信/QQ OAuth 的 state 与最终回跳地址，仅 service_role 可访问。';

-- ------------------------------------------------------------
-- 6. 新用户触发器：创建 profile 和 settings 默认行
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, phone, provider)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      nullif(new.phone, ''),
      '知隙用户'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    new.phone,
    coalesce(
      nullif(new.raw_app_meta_data ->> 'oauth_provider', ''),
      nullif(new.raw_user_meta_data ->> 'oauth_provider', '')
    )
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 给在迁移之前已经存在的用户补齐 profile / settings（全新项目通常为空）
insert into public.profiles (id, display_name, phone)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), nullif(u.phone, ''), '知隙用户'),
  u.phone
from auth.users u
on conflict (id) do nothing;

insert into public.user_settings (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- 7. RLS：profiles
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- 8. RLS：user_settings
-- ------------------------------------------------------------
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
  on public.user_settings for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 9. RLS：questions
-- ------------------------------------------------------------
alter table public.questions enable row level security;

drop policy if exists "questions_select_own" on public.questions;
create policy "questions_select_own"
  on public.questions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "questions_insert_own" on public.questions;
create policy "questions_insert_own"
  on public.questions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "questions_update_own" on public.questions;
create policy "questions_update_own"
  on public.questions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "questions_delete_own" on public.questions;
create policy "questions_delete_own"
  on public.questions for delete to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 10. OAuth 表：启用 RLS 且不创建任何客户端策略，并撤销客户端权限
-- ------------------------------------------------------------
alter table public.oauth_identities enable row level security;
alter table public.oauth_states enable row level security;

revoke all on table public.oauth_identities from anon, authenticated;
revoke all on table public.oauth_states from anon, authenticated;

-- 业务表显式授权给已登录用户（RLS 仍然生效）
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.questions to authenticated;

-- ------------------------------------------------------------
-- 11. Storage：私有错题图片桶 + 对象级 RLS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "question_images_select_own" on storage.objects;
create policy "question_images_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "question_images_insert_own" on storage.objects;
create policy "question_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "question_images_update_own" on storage.objects;
create policy "question_images_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "question_images_delete_own" on storage.objects;
create policy "question_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'question-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- 12. Realtime：添加业务表到 publication
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.questions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.user_settings;
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

-- 完成。下一步：
--   1. Authentication → Providers → Email：开启；
--   2. Confirm email：关闭（否则 signUp 不返回 session）；
--   3. Allow new users to sign up：开启；
--   4. 配置 Site URL（Cloudflare Pages 正式域名）；
--   5. 前端只配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
-- 当前账号密码登录不需要 oauth-bridge / 手机号 / 微信 / QQ 配置。
