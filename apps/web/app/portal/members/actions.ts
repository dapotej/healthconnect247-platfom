'use server';

import { MissingColumnsError, validateMemberList } from '@hc247/core';
import { revalidatePath } from 'next/cache';
import { getData } from '@/lib/data';
import type { MemberImportSummary } from '@/lib/data/types';
import { requireClientUser } from '@/lib/session';

export type UploadState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; summary: MemberImportSummary };

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadMembersAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireClientUser();
  if (user.role !== 'client_admin') {
    return { status: 'error', message: 'Only your organisation’s portal admin can update the member list.' };
  }
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: 'Choose a CSV file to upload.' };
  if (file.size > MAX_BYTES) return { status: 'error', message: 'The file is larger than 5 MB. Split it into smaller files.' };
  if (!/\.csv$/i.test(file.name)) {
    return { status: 'error', message: 'Save the spreadsheet as CSV (File › Save as › CSV) and upload that.' };
  }

  const data = getData();
  try {
    const existing = await data.memberIdsFor(user.clientId);
    const result = validateMemberList(await file.text(), existing);
    const summary = await data.saveMemberImport(user.clientId, result.members, {
      filename: file.name,
      rowsTotal: result.rowsTotal,
      errors: result.errors,
    });
    revalidatePath('/portal/members');
    return { status: 'done', summary };
  } catch (err) {
    if (err instanceof MissingColumnsError) {
      const names: Record<string, string> = { fullName: 'name', memberId: 'member ID', phone: 'phone number' };
      return {
        status: 'error',
        message: `We couldn’t find these columns: ${err.missing.map((m) => names[m] ?? m).join(', ')}. Use the template, or check the column headings.`,
      };
    }
    return { status: 'error', message: 'We couldn’t read this file. Check it’s a CSV export of your member list.' };
  }
}
