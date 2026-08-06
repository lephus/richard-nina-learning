create type part_of_speech as enum ('n','v','adj','adv','prep','conj');

create table vocab_words (
  id            bigserial primary key,
  ordinal       int  not null unique,
  word          text not null,
  pos           part_of_speech not null,
  ipa           text not null,
  meaning_vi    text not null,
  definition_en text not null,
  definition_vi text not null,
  synonyms      text[] not null default '{}',
  example_en    text not null,
  example_vi    text not null,
  blank_answer  text not null,
  created_at    timestamptz not null default now()
);

create table grammar_lessons (
  id          bigserial primary key,
  ordinal     int  not null unique,
  slug        text not null unique,
  title       text not null,
  summary     text not null,
  content_md  text not null,
  source_file text not null
);

create table grammar_questions (
  id          bigserial primary key,
  lesson_id   bigint not null references grammar_lessons(id) on delete cascade,
  stem        text not null,
  options     jsonb  not null,
  answer      char(1) not null check (answer in ('A','B','C','D')),
  explanation text not null
);

create index on grammar_questions (lesson_id);
