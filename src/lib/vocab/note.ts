/**
 * Trần độ dài ghi chú, khớp `check (char_length(body) <= 2000)` ở migration 0010.
 *
 * Ở một tệp RIÊNG chứ không nằm trong `(app)/vocab/actions.ts`: trong một tệp
 * `"use server"`, MỌI export đều bị Next biến thành một HTTP endpoint công
 * khai — một hằng số ở đó làm vỡ build. Cùng lý do đã ghi ở đầu
 * `lib/assessment/run.ts` của lát 1.
 */
export const NOTE_MAX = 2000;
