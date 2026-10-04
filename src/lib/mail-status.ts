/** Mail is "down" if the latest attempt failed within the last 30 minutes. */
export function mailLooksDown(rows: { key: string; at: string | Date }[], now = Date.now()): boolean {
  const at = (k: string) => {
    const r = rows.find((x) => x.key === k);
    return r ? new Date(r.at).getTime() : 0;
  };
  const fail = at("mail_last_failure");
  const ok = at("mail_last_success");
  return fail > ok && now - fail < 30 * 60 * 1000;
}
