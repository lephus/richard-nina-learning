# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A corpus of Vietnamese-language TOEIC study materials — `.docx` and `.pdf` source documents, no application code. There is no build system, no test suite, no linter, and no package manifest. Do not invent one or scaffold tooling unless asked.

Work here is content work: reading the source documents, extracting or restructuring their material, and producing derived study artifacts.

## Layout and what the directories mean

- `toeic-resource/NGỮ PHÁP TOEIC/` — grammar **theory** (tenses, articles, relative clauses, passive voice, conditionals, modals, subject-verb agreement, comparatives, pronouns, reported speech, noun/adjective/adverb theory).
- `toeic-resource/Bài tập/` — **exercises** (bài tập) matched to the grammar topics: nouns, adjectives/adverbs.
- `toeic-resource/CHUẨN HÓA PHÁT ÂM 2026.docx` — pronunciation standardization.
- `toeic-resource/VOCAB. Toeic Practice Club.pdf` — the vocabulary bank (~105 MB).

The `ÔN ĐH` prefix on many grammar files is Vietnamese shorthand for *ôn thi Đại học* (university-entrance exam review) — those files are repurposed exam-prep material, so their framing is broader than TOEIC alone. Theory and exercise files pair up by topic across the two directories.

## Reading the source documents

The documents are binary; `Read` will not give you their text. Convert first (all four tools are installed):

```bash
# .docx → readable text (preserves tables, which most grammar files rely on heavily)
pandoc -t plain "toeic-resource/NGỮ PHÁP TOEIC/TENSES.docx"

# .pdf → text
pdftotext "toeic-resource/NGỮ PHÁP TOEIC/LÝ THUYẾT DANH TỪ.pdf" -

# Large PDFs: always page-range. The vocab PDF is 105 MB — a full extraction is slow and floods context.
pdftotext -f 1 -l 20 "toeic-resource/VOCAB. Toeic Practice Club.pdf" -
```

`textutil` (macOS) and `python-docx` are also available; `pypdf` is not installed.

Grammar content is predominantly laid out as two-column comparison tables (e.g. present simple vs. present continuous). `pandoc -t plain` renders these as ASCII tables — readable, but structure-sensitive extraction is easier from `pandoc -t markdown` or `-t json`.

## Path handling

Every content path contains spaces and Vietnamese diacritics. Always quote paths in shell commands. Filenames are NFC/NFD-sensitive on macOS — prefer globbing or `find` over retyping a name by hand when a command fails to match a file you can see in a listing.

## Language conventions

Source material explains English grammar **in Vietnamese**, with English example sentences. Derived artifacts (summaries, flashcards, exercise sets) should preserve that split: Vietnamese for explanation and instructions, English for the target-language examples being taught. Keep the existing Vietnamese terminology (`danh từ`, `tính từ`, `trạng từ`, `mệnh đề quan hệ`) rather than substituting English grammar terms.

## Git

Only `README.md` is currently tracked; `toeic-resource/` is untracked. Before committing the resources, note that `VOCAB. Toeic Practice Club.pdf` is ~105 MB, which exceeds GitHub's 100 MB per-file hard limit — it needs Git LFS or a `.gitignore` entry. Raise this with the user rather than committing it and letting the push fail.
