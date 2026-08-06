create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create type lesson_status     as enum ('locked','available','in_progress','completed');
create type assessment_type   as enum ('review','test','remedial');
create type assessment_status as enum ('in_progress','submitted','expired');

create table user_lesson_progress (
  user_id      uuid   not null references auth.users(id) on delete cascade,
  lesson_id    bigint not null references lessons(id),
  status       lesson_status not null default 'locked',
  score        int,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

create table word_mastery (
  user_id       uuid   not null references auth.users(id) on delete cascade,
  word_id       bigint not null references vocab_words(id),
  correct_count int not null default 0,
  wrong_count   int not null default 0,
  mastered      boolean not null default false,
  last_seen_at  timestamptz,
  primary key (user_id, word_id)
);

create table grammar_mastery (
  user_id           uuid   not null references auth.users(id) on delete cascade,
  grammar_lesson_id bigint not null references grammar_lessons(id),
  correct_count int not null default 0,
  wrong_count   int not null default 0,
  primary key (user_id, grammar_lesson_id)
);

create table assessments (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         assessment_type not null,
  scope        int[] not null,
  status       assessment_status not null default 'in_progress',
  score        int,
  passed       boolean,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  submitted_at timestamptz
);

create table assessment_items (
  id            bigserial primary key,
  assessment_id bigint not null references assessments(id) on delete cascade,
  position      int    not null,
  item_type     text   not null check (item_type in ('vocab','grammar')),
  ref_id        bigint not null,
  payload       jsonb  not null,
  user_answer   text,
  is_correct    boolean,
  unique (assessment_id, position)
);

create index on assessments (user_id, status);
create index on assessment_items (assessment_id);
