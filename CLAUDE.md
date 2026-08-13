# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A Vietnamese-language TOEIC self-study web app, plus the source documents it was built from.

- **The app** — Next.js 16 (App Router) + React 19 + Tailwind 4 + Supabase (Postgres, Auth, Storage). Vitest for unit tests, Playwright for e2e. **No ESLint is installed** — never add `eslint-disable` comments, they would reference a tool that does not exist here.
- **The corpus** — `.docx`/`.pdf` study materials under `toeic-resource/`, which are build-time raw material, not runtime content.

Learner-facing text is Vietnamese throughout. The app teaches vocabulary (605 words in 10 groups) and serves the scanned vocabulary book; the grammar track is built but not yet exposed.

## Commands

```bash
npm run dev              # Next dev server (localhost:3000)
npm run build            # production build
npm test                 # Vitest, tests/**/*.test.ts
npm run test:e2e         # Playwright; add `-- book` etc. to scope to one spec
npx tsc --noEmit         # type check
```

Content pipeline (run in order, only when regenerating content — see below):

```bash
npm run phase0:render    # PDF → data/images/*.png → OCR → data/raw/ocr/
npm run phase0:vocab     # OCR → data/raw/vocab-raw.json → data/clean/vocab.json
npm run phase0:grammar   # .docx → data/clean/grammar.json
npm run phase0:questions # → data/clean/questions.json
npm run phase0:seed      # data/clean/*.json → Supabase. DANGEROUS now — see below.
npm run phase0:book      # data/images/*.png → WebP 1600px q80 → Storage bucket `book-pages`
```

## Layout

| Path | What it holds |
|---|---|
| `src/app/(app)/` | authenticated pages: `dashboard`, `vocab`, `stats`, `doc-sach` (book reader). Its `layout.tsx` redirects anonymous users to `/login` — pages inside it must not re-check auth. |
| `src/app/(auth)/` | `login`, `register`, and their server actions |
| `src/lib/` | pure domain logic, one folder per concern: `book`, `curriculum`, `exam`, `mastery`, `stats`, `vocab`, plus `supabase/server.ts` |
| `src/content/` | parsers and schemas used by the phase0 scripts |
| `scripts/phase0/` | offline content pipeline, run with `tsx` |
| `supabase/migrations/` | `0001`–`0011`; tables: `profiles`, `vocab_words`, `lessons`, `lesson_words`, `grammar_lessons`, `grammar_questions`, `assessments`, `assessment_items`, `word_mastery`, `grammar_mastery`, `user_lesson_progress`, `lesson_cursor`, `word_notes` |
| `data/clean/` | committed JSON: the content of record |
| `data/images/`, `data/raw/` | **gitignored** intermediates |
| `docs/superpowers/specs/`, `plans/` | design specs and implementation plans, one per slice — read the relevant spec before changing a feature; they record *why*, not just what |
| `toeic-resource/` | **gitignored** source documents |

The domain vocabulary is Vietnamese: a **buổi** (lesson) is 30 words, a **nhóm** (group) is 2 buổi, 20 buổi total.

## Database and migrations — read before touching schema

**Never run `npm run phase0:seed` — with or without `--force` — now that learners have progress.** It deletes and re-inserts the content tables, and `word_mastery` references `vocab_words` through a foreign key that does **not** cascade, so the delete fails partway and leaves the database half-wiped. The `--force` flag only bypasses the "progress exists" refusal; it does not make the operation safe. To change seeded content, write a targeted `update` script instead — `scripts/phase0/backfill-grammar-html.ts` is the worked example: it touches one column, matches by `slug` rather than array position, and throws before writing if any expected row is missing. This plan was written twice in one session and caught both times before it ran.

**Never run `supabase db push`, `supabase link`, or `psql` against this project.** Three independent reasons:

1. The project is not linked and its migration history is out of sync with the files — the earlier slices were applied by hand.
2. `0010_phase2_reset.sql` opens with `delete from assessment_items; delete from assessments; delete from word_mastery;`. A push that replays it destroys real learner progress.
3. Direct connections are impossible from this machine anyway: `db.<ref>.supabase.co` resolves only to IPv6 and the machine has no global IPv6 address, so `SUPABASE_DB_URL` cannot be reached.

**The working procedure:** write the migration file, then hand the SQL to the user to paste into Supabase Dashboard → SQL Editor (`pbcopy < file` helps), and verify the result independently through the REST API with the service-role key before continuing. To automate this later, the user would need a Session-pooler connection string (IPv4) from Dashboard → Settings → Database.

Keys live in `.env.local` (gitignored): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, and the `NEXT_PUBLIC_` pair. The service-role key must never appear anywhere under `src/` — it belongs to `scripts/` and `tests/` only.

## Tests — the parts that surprise people

**Both suites run against the real production Supabase project**, not a local instance or fixtures. That drives several deliberate settings, none of which should be "cleaned up":

- `vitest.config.ts` sets `fileParallelism: false` — `tests/rls.test.ts` inserts a sentinel row that `tests/db-integrity.test.ts` asserts against, so parallel files corrupt each other.
- `playwright.config.ts` sets `fullyParallel: false, workers: 1`.
- DB-touching tests use `describe.skipIf(!hasEnv)` so `npm test` still runs without keys.
- Each e2e spec defines its **own** local `login()` helper. This duplication is a deliberate, ruled-on convention — do not extract a shared helper.
- Known infrastructure flakes that are not code bugs: `PGRST303 "JWT issued at future"` (clock skew) and `drainSaves: còn N POST treo`. Both pass on rerun. Suspect infrastructure before editing code, and never mask a failure with retries, longer timeouts, or weakened assertions.

## Framework and library gotchas already paid for

- `params` is a `Promise` — `const { page } = await params`.
- **Do not use `next/image` for Supabase signed URLs.** Next 16's `remotePatterns.search` with `search: ''` matches only URLs without a query string, so a `?token=...` URL is blocked unless you open a wildcard for all query strings. Plain `<img>` is correct for the book pages, which are pre-encoded at display width.
- **Do not add `loading.tsx` under `src/app/(app)/doc-sach/[page]/`.** A loading boundary streams the response and pins `notFound()` at HTTP 200 — see the comment in `src/app/(app)/vocab/(list)/loading.tsx`, which documents the reproduction.
- Supabase Storage signing mints a **fresh token per call**, so the same object yields a different URL every render. Any scheme that assumes two signings produce one cacheable URL is broken by construction.

## Reading the source documents

The documents are binary; `Read` will not give you their text. Convert first:

```bash
# .docx → readable text (preserves tables, which most grammar files rely on heavily)
pandoc -t plain "toeic-resource/NGỮ PHÁP TOEIC/TENSES.docx"

# .pdf → text
pdftotext "toeic-resource/NGỮ PHÁP TOEIC/LÝ THUYẾT DANH TỪ.pdf" -

# Large PDFs: always page-range. The vocab PDF is 105 MB — a full extraction is slow and floods context.
pdftotext -f 1 -l 20 "toeic-resource/VOCAB. Toeic Practice Club.pdf" -
```

`textutil` (macOS), `python-docx`, `sharp`, `cwebp` and ImageMagick are available; `pypdf` is not installed.

Grammar content is predominantly two-column comparison tables (e.g. present simple vs. present continuous). `pandoc -t plain` renders these as ASCII tables — readable, but structure-sensitive extraction is easier from `pandoc -t markdown` or `-t json`.

The `ÔN ĐH` prefix means *ôn thi Đại học* (university-entrance review) — that material is repurposed, so its framing is broader than TOEIC alone.

## Path handling

Every content path contains spaces and Vietnamese diacritics. Always quote paths in shell commands. Filenames are NFC/NFD-sensitive on macOS — prefer globbing or `find` over retyping a name by hand when a command fails to match a file you can see in a listing.

## Language conventions

**In content:** the source explains English grammar *in Vietnamese* with English examples. Derived artifacts keep that split, and keep the existing Vietnamese terminology (`danh từ`, `tính từ`, `trạng từ`, `mệnh đề quan hệ`) rather than substituting English grammar terms.

**In code:** all user-facing strings and all comments are Vietnamese. Diacritics follow the directory:

| Location | Diacritics |
|---|---|
| `src/`, `tests/`, `docs/` | full diacritics — `// Kiểm cả hai biên` |
| `scripts/`, `supabase/migrations/`, git commit messages | none — `-- Kiem ca hai bien` |

Comments explain **why** a thing is the way it is — the constraint, the bug it prevents, the alternative rejected — not what the line does. The existing comments are long on purpose; match that, and when you fix something subtle, record the reasoning where the next reader will hit it.

## Git

Everything above is tracked except `data/images/`, `data/raw/`, `toeic-resource/`, `.env.local`, and build output. Two consequences worth knowing:

- `VOCAB. Toeic Practice Club.pdf` is ~105 MB, over GitHub's 100 MB hard limit. It stays ignored; do not commit it.
- Because `data/images/` is ignored, the 112 book-page images exist only on the original machine and in the Storage bucket. On any other checkout they must be regenerated with `phase0:render` before `phase0:book` can run.

Work happens on a feature branch merged into `main`, not directly on `main`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
