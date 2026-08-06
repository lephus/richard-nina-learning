create table lessons (
  id                bigserial primary key,
  ordinal           int not null unique check (ordinal between 1 and 20),
  grammar_lesson_id bigint not null unique references grammar_lessons(id)
);

create table lesson_words (
  lesson_id bigint not null references lessons(id) on delete cascade,
  word_id   bigint not null references vocab_words(id),
  position  int    not null check (position between 1 and 30),
  primary key (lesson_id, position),
  -- Rang buoc nay ep "khong tu nao lap giua hai buoi" o tang database,
  -- khong phu thuoc vao script seed lam dung.
  unique (word_id)
);
