import { noticeFor } from '@/lib/notices';

export function Notice({ params }: { params: Record<string, string | string[] | undefined> }) {
  const notice = noticeFor(params);
  if (!notice) return null;
  const code = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  return (
    <div className={`banner ${notice.tone}`} role={notice.tone === 'warn' ? 'alert' : 'status'} data-notice={code}>
      {notice.text}
    </div>
  );
}
